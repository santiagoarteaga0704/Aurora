import { Injectable } from '@nestjs/common'
import type {
  DatosConsultaTransferencias,
  DatosCrearTransferencia,
  DatosRecibirTransferencia,
} from '@aurora/contratos'
import { salto } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import { PermisosService } from '../../nucleo/autenticacion/permisos.service'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'
import { StockService, type Tx } from './stock.service'

/**
 * Transferencias de mercaderia entre almacenes.
 *
 * El ciclo tiene tres pasos y cada uno mueve (o no) el stock en un momento
 * distinto, que es lo que hace que la mercaderia en camino no desaparezca del
 * sistema ni se cuente dos veces:
 *
 *   solicitada  - se pide. Todavia no se toca el stock.
 *   en_transito - se aprueba. RECIEN AQUI sale del almacen de origen.
 *   recibida    - llega. Entra al destino lo que realmente llego.
 *
 * Si al recibir llega menos de lo que salio, entra lo que llego y nada mas. La
 * diferencia no se maquilla: queda visible en el kardex como una salida sin su
 * entrada, que es justo lo que hay que investigar.
 */
@Injectable()
export class TransferenciasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly permisos: PermisosService,
    private readonly bitacora: BitacoraService
  ) {}

  // ==========================================================================
  // Alta
  // ==========================================================================

  async crear(datos: DatosCrearTransferencia, usuario: UsuarioAutenticado, ctx: ContextoPeticion) {
    const [origen, destino] = await Promise.all([
      this.almacen(datos.almacen_origen_id, 'almacen_origen_id'),
      this.almacen(datos.almacen_destino_id, 'almacen_destino_id'),
    ])

    // Quien esta limitado a una sucursal puede pedir mercaderia para la suya o
    // mandar desde la suya, pero no mover mercaderia entre dos sucursales ajenas.
    const propia = this.permisos.restringeSucursal(usuario)
    if (propia !== null && origen.sucursal_id !== propia && destino.sucursal_id !== propia) {
      throw ExcepcionNegocio.sinPermiso(
        'Una transferencia tiene que salir de tu sucursal o llegar a ella'
      )
    }

    await this.verificarVariantes(datos.items.map((i) => i.variante_id))

    const transferencia = await this.prisma.$transaction(async (tx) => {
      const numero = await this.siguienteNumero(tx)

      const creada = await tx.transferencia.create({
        data: {
          numero,
          almacen_origen_id: datos.almacen_origen_id,
          almacen_destino_id: datos.almacen_destino_id,
          usuario_solicita_id: usuario.id,
          observacion: datos.observacion ?? null,
          estado: 'solicitada',
        },
        select: { id: true, numero: true },
      })

      await tx.transferencia_detalle.createMany({
        data: datos.items.map((i) => ({
          transferencia_id: creada.id,
          variante_id: i.variante_id,
          cantidad: i.cantidad,
        })),
      })

      return creada
    })

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'inventario',
      entidad: 'transferencia',
      entidadId: transferencia.id.toString(),
      descripcion: `Transferencia ${transferencia.numero}: ${origen.nombre} -> ${destino.nombre}`,
    })

    return this.detalle(transferencia.id)
  }

  // ==========================================================================
  // Aprobacion: aqui sale el stock del origen
  // ==========================================================================

  async aprobar(id: bigint, usuario: UsuarioAutenticado, ctx: ContextoPeticion) {
    const transferencia = await this.buscar(id)

    if (transferencia.estado !== 'solicitada') {
      throw ExcepcionNegocio.conflicto(
        `Solo se puede aprobar una transferencia solicitada; esta esta ${transferencia.estado}`
      )
    }

    // Aprobar saca mercaderia del origen, asi que el permiso se mide contra el
    // origen y no contra el destino.
    this.verificarSucursal(usuario, transferencia.origen.sucursal_id, 'el almacen de origen')

    await this.prisma.$transaction(async (tx) => {
      for (const linea of transferencia.detalle) {
        await this.stock.mover(tx, {
          variante_id: linea.variante_id,
          almacen_id: transferencia.almacen_origen_id,
          cantidad: -linea.cantidad,
          tipo: 'transferencia_salida',
          usuario_id: usuario.id,
          motivo: `Transferencia ${transferencia.numero}`,
          referencia_tipo: 'transferencia',
          referencia_id: transferencia.id,
        })
      }

      await tx.transferencia.update({
        where: { id },
        data: { estado: 'en_transito', usuario_aprueba_id: usuario.id },
      })
    })

    await this.bitacora.registrar(ctx, {
      accion: 'aprobar',
      modulo: 'inventario',
      entidad: 'transferencia',
      entidadId: id.toString(),
      descripcion: `Transferencia ${transferencia.numero} aprobada y despachada`,
    })

    return this.detalle(id)
  }

  // ==========================================================================
  // Recepcion: aqui entra al destino lo que realmente llego
  // ==========================================================================

  async recibir(
    id: bigint,
    datos: DatosRecibirTransferencia,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ) {
    const transferencia = await this.buscar(id)

    if (transferencia.estado !== 'en_transito') {
      throw ExcepcionNegocio.conflicto(
        `Solo se puede recibir una transferencia en transito; esta esta ${transferencia.estado}`
      )
    }

    this.verificarSucursal(usuario, transferencia.destino.sucursal_id, 'el almacen de destino')

    const enviado = new Map(transferencia.detalle.map((d) => [d.variante_id, d.cantidad]))
    const faltantes: string[] = []

    for (const item of datos.items) {
      const cantidadEnviada = enviado.get(item.variante_id)
      if (cantidadEnviada === undefined) {
        throw ExcepcionNegocio.validacion({
          items: `La variante ${item.variante_id} no estaba en esta transferencia`,
        })
      }
      if (item.cantidad_recibida > cantidadEnviada) {
        throw ExcepcionNegocio.validacion({
          items: `No se puede recibir mas de lo enviado (variante ${item.variante_id}: enviadas ${cantidadEnviada}, declaradas ${item.cantidad_recibida})`,
        })
      }
      if (item.cantidad_recibida < cantidadEnviada) {
        faltantes.push(
          `variante ${item.variante_id}: llegaron ${item.cantidad_recibida} de ${cantidadEnviada}`
        )
      }
    }

    // Lo que no se declara se toma como no recibido, no como recibido completo:
    // ante la duda, el sistema no inventa stock que nadie vio.
    const recibidoPor = new Map(datos.items.map((i) => [i.variante_id, i.cantidad_recibida]))

    await this.prisma.$transaction(async (tx) => {
      for (const linea of transferencia.detalle) {
        const recibida = recibidoPor.get(linea.variante_id) ?? 0

        if (recibida > 0) {
          await this.stock.mover(tx, {
            variante_id: linea.variante_id,
            almacen_id: transferencia.almacen_destino_id,
            cantidad: recibida,
            tipo: 'transferencia_entrada',
            usuario_id: usuario.id,
            motivo: `Transferencia ${transferencia.numero}`,
            referencia_tipo: 'transferencia',
            referencia_id: transferencia.id,
          })
        }

        await tx.transferencia_detalle.update({
          where: { id: linea.id },
          data: { cantidad_recibida: recibida },
        })
      }

      await tx.transferencia.update({
        where: { id },
        data: {
          estado: 'recibida',
          recibido_en: new Date(),
          observacion: datos.observacion ?? transferencia.observacion,
        },
      })
    })

    await this.bitacora.registrar(ctx, {
      accion: 'recibir',
      modulo: 'inventario',
      entidad: 'transferencia',
      entidadId: id.toString(),
      descripcion:
        faltantes.length > 0
          ? `Transferencia ${transferencia.numero} recibida con faltantes: ${faltantes.join('; ')}`
          : `Transferencia ${transferencia.numero} recibida completa`,
      datosNuevos: { faltantes },
    })

    return { ...(await this.detalle(id)), faltantes }
  }

  // ==========================================================================
  // Rechazo
  // ==========================================================================

  async rechazar(id: bigint, motivo: string, usuario: UsuarioAutenticado, ctx: ContextoPeticion) {
    const transferencia = await this.buscar(id)

    // Solo antes de despachar. Una vez que la mercaderia salio del origen ya no
    // se rechaza: se recibe, aunque sea con faltantes, o queda en transito.
    if (transferencia.estado !== 'solicitada') {
      throw ExcepcionNegocio.conflicto(
        `Solo se puede rechazar una transferencia solicitada; esta esta ${transferencia.estado}`
      )
    }

    this.verificarSucursal(usuario, transferencia.origen.sucursal_id, 'el almacen de origen')

    await this.prisma.transferencia.update({
      where: { id },
      data: {
        estado: 'rechazada',
        usuario_aprueba_id: usuario.id,
        observacion: motivo,
      },
    })

    await this.bitacora.registrar(ctx, {
      accion: 'rechazar',
      modulo: 'inventario',
      entidad: 'transferencia',
      entidadId: id.toString(),
      descripcion: `Transferencia ${transferencia.numero} rechazada: ${motivo}`,
    })

    return this.detalle(id)
  }

  // ==========================================================================
  // Consultas
  // ==========================================================================

  async listar(filtros: DatosConsultaTransferencias, usuario: UsuarioAutenticado) {
    const propia = this.permisos.restringeSucursal(usuario)
    const sucursal = propia ?? filtros.sucursal_id

    const where = {
      estado: filtros.estado,
      almacen_origen_id: filtros.almacen_origen_id,
      almacen_destino_id: filtros.almacen_destino_id,
      // Una transferencia le interesa a la sucursal que manda y a la que recibe.
      ...(sucursal !== undefined && sucursal !== null
        ? {
            OR: [
              { almacen_transferencia_almacen_origen_idToalmacen: { sucursal_id: sucursal } },
              { almacen_transferencia_almacen_destino_idToalmacen: { sucursal_id: sucursal } },
            ],
          }
        : {}),
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.transferencia.count({ where }),
      this.prisma.transferencia.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: salto(filtros),
        take: filtros.por_pagina,
        include: {
          almacen_transferencia_almacen_origen_idToalmacen: { select: { nombre: true } },
          almacen_transferencia_almacen_destino_idToalmacen: { select: { nombre: true } },
          usuario_transferencia_usuario_solicita_idTousuario: {
            select: { nombre: true, apellido: true },
          },
          usuario_transferencia_usuario_aprueba_idTousuario: {
            select: { nombre: true, apellido: true },
          },
          transferencia_detalle: { select: { cantidad: true } },
        },
      }),
    ])

    return {
      total,
      items: filas.map((t) => ({
        id: t.id.toString(),
        numero: t.numero,
        estado: t.estado,
        almacen_origen: t.almacen_transferencia_almacen_origen_idToalmacen.nombre,
        almacen_destino: t.almacen_transferencia_almacen_destino_idToalmacen.nombre,
        solicita: `${t.usuario_transferencia_usuario_solicita_idTousuario.nombre} ${t.usuario_transferencia_usuario_solicita_idTousuario.apellido}`,
        aprueba: t.usuario_transferencia_usuario_aprueba_idTousuario
          ? `${t.usuario_transferencia_usuario_aprueba_idTousuario.nombre} ${t.usuario_transferencia_usuario_aprueba_idTousuario.apellido}`
          : null,
        observacion: t.observacion,
        creado_en: t.creado_en.toISOString(),
        recibido_en: t.recibido_en?.toISOString() ?? null,
        articulos: t.transferencia_detalle.length,
        unidades: t.transferencia_detalle.reduce((s, d) => s + d.cantidad, 0),
      })),
    }
  }

  async detalle(id: bigint) {
    const t = await this.prisma.transferencia.findUnique({
      where: { id },
      include: {
        almacen_transferencia_almacen_origen_idToalmacen: {
          select: { id: true, nombre: true, sucursal: { select: { nombre: true } } },
        },
        almacen_transferencia_almacen_destino_idToalmacen: {
          select: { id: true, nombre: true, sucursal: { select: { nombre: true } } },
        },
        usuario_transferencia_usuario_solicita_idTousuario: {
          select: { nombre: true, apellido: true },
        },
        transferencia_detalle: {
          include: {
            variante: {
              select: {
                id: true,
                sku: true,
                producto: { select: { nombre: true } },
                talla: { select: { nombre: true } },
                color: { select: { nombre: true } },
              },
            },
          },
        },
      },
    })

    if (!t) throw ExcepcionNegocio.noEncontrado('Esa transferencia no existe')

    return {
      id: t.id.toString(),
      numero: t.numero,
      estado: t.estado,
      origen: {
        almacen_id: t.almacen_transferencia_almacen_origen_idToalmacen.id,
        almacen: t.almacen_transferencia_almacen_origen_idToalmacen.nombre,
        sucursal: t.almacen_transferencia_almacen_origen_idToalmacen.sucursal.nombre,
      },
      destino: {
        almacen_id: t.almacen_transferencia_almacen_destino_idToalmacen.id,
        almacen: t.almacen_transferencia_almacen_destino_idToalmacen.nombre,
        sucursal: t.almacen_transferencia_almacen_destino_idToalmacen.sucursal.nombre,
      },
      solicita: `${t.usuario_transferencia_usuario_solicita_idTousuario.nombre} ${t.usuario_transferencia_usuario_solicita_idTousuario.apellido}`,
      observacion: t.observacion,
      creado_en: t.creado_en,
      recibido_en: t.recibido_en,
      items: t.transferencia_detalle.map((d) => ({
        variante_id: d.variante_id,
        sku: d.variante.sku,
        producto: d.variante.producto.nombre,
        talla: d.variante.talla.nombre,
        color: d.variante.color.nombre,
        cantidad: d.cantidad,
        cantidad_recibida: d.cantidad_recibida,
      })),
    }
  }

  // ==========================================================================
  // Internos
  // ==========================================================================

  /**
   * Numero legible de la transferencia. Sale de una secuencia de PostgreSQL y no
   * de un MAX(numero)+1, que con dos almacenes operando a la vez daria el mismo
   * numero a las dos y una fallaria por la restriccion de unicidad.
   */
  private async siguienteNumero(tx: Tx): Promise<string> {
    const [{ numero }] = await tx.$queryRaw<{ numero: string }[]>`
      SELECT correlativo('TRF', 'seq_transferencia') AS numero
    `
    return numero
  }

  private async buscar(id: bigint) {
    const t = await this.prisma.transferencia.findUnique({
      where: { id },
      include: {
        almacen_transferencia_almacen_origen_idToalmacen: {
          select: { sucursal_id: true, nombre: true },
        },
        almacen_transferencia_almacen_destino_idToalmacen: {
          select: { sucursal_id: true, nombre: true },
        },
        transferencia_detalle: true,
      },
    })
    if (!t) throw ExcepcionNegocio.noEncontrado('Esa transferencia no existe')

    return {
      ...t,
      origen: t.almacen_transferencia_almacen_origen_idToalmacen,
      destino: t.almacen_transferencia_almacen_destino_idToalmacen,
      detalle: t.transferencia_detalle,
    }
  }

  private async almacen(id: number, campo: string) {
    const a = await this.prisma.almacen.findUnique({
      where: { id },
      select: { id: true, nombre: true, sucursal_id: true, activo: true },
    })
    if (!a) throw ExcepcionNegocio.validacion({ [campo]: 'Ese almacen no existe' })
    if (!a.activo) throw ExcepcionNegocio.validacion({ [campo]: 'Ese almacen esta dado de baja' })
    return a
  }

  private async verificarVariantes(ids: number[]): Promise<void> {
    const existen = await this.prisma.variante.count({ where: { id: { in: ids }, activo: true } })
    if (existen !== new Set(ids).size) {
      throw ExcepcionNegocio.validacion({
        items: 'Alguna de las variantes no existe o esta dada de baja',
      })
    }
  }

  private verificarSucursal(usuario: UsuarioAutenticado, sucursalId: number, cual: string): void {
    const propia = this.permisos.restringeSucursal(usuario)
    if (propia !== null && propia !== sucursalId) {
      throw ExcepcionNegocio.sinPermiso(`${cual} no pertenece a tu sucursal`)
    }
  }
}
