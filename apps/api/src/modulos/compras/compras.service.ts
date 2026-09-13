import { Injectable } from '@nestjs/common'
import type {
  Compra,
  DatosActualizarProveedor,
  DatosConsultaCompras,
  DatosCrearCompra,
  DatosProveedor,
  DatosRecibirCompra,
} from '@aurora/contratos'
import { salto } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import { PermisosService } from '../../nucleo/autenticacion/permisos.service'
import { PreciosService } from '../catalogo/precios.service'
import { StockService } from '../inventario/stock.service'
import { aNumero } from '../../nucleo/util/decimal'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'

@Injectable()
export class ComprasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly permisos: PermisosService,
    private readonly bitacora: BitacoraService
  ) {}

  // ==========================================================================
  // Proveedores
  // ==========================================================================

  async proveedores(soloActivos = true) {
    return this.prisma.proveedor.findMany({
      where: soloActivos ? { activo: true } : {},
      orderBy: { nombre: 'asc' },
    })
  }

  async crearProveedor(datos: DatosProveedor, ctx: ContextoPeticion) {
    const proveedor = await this.prisma.proveedor.create({
      data: {
        nombre: datos.nombre,
        nit: datos.nit ?? null,
        contacto: datos.contacto ?? null,
        telefono: datos.telefono ?? null,
        email: datos.email ?? null,
        direccion: datos.direccion ?? null,
      },
    })

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'compra',
      entidad: 'proveedor',
      entidadId: proveedor.id,
      descripcion: `Alta del proveedor ${datos.nombre}`,
    })

    return proveedor
  }

  async actualizarProveedor(id: number, datos: DatosActualizarProveedor, ctx: ContextoPeticion) {
    const previo = await this.prisma.proveedor.findUnique({ where: { id } })
    if (!previo) throw ExcepcionNegocio.noEncontrado('Ese proveedor no existe')

    const proveedor = await this.prisma.proveedor.update({ where: { id }, data: datos })

    await this.bitacora.registrar(ctx, {
      accion: 'actualizar',
      modulo: 'compra',
      entidad: 'proveedor',
      entidadId: id,
      descripcion: `Edicion del proveedor ${previo.nombre}`,
      datosPrevios: { nombre: previo.nombre, activo: previo.activo },
      datosNuevos: { nombre: proveedor.nombre, activo: proveedor.activo },
    })

    return proveedor
  }

  // ==========================================================================
  // Compras
  // ==========================================================================

  async crear(
    datos: DatosCrearCompra,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Compra> {
    const proveedor = await this.prisma.proveedor.findUnique({
      where: { id: datos.proveedor_id },
      select: { id: true, nombre: true, activo: true },
    })
    if (!proveedor?.activo) {
      throw ExcepcionNegocio.validacion({ proveedor_id: 'Ese proveedor no existe o esta de baja' })
    }

    const almacen = await this.prisma.almacen.findUnique({
      where: { id: datos.almacen_id },
      select: { id: true, sucursal_id: true, activo: true },
    })
    if (!almacen?.activo) {
      throw ExcepcionNegocio.validacion({ almacen_id: 'Ese almacen no existe o esta inactivo' })
    }
    this.verificarSucursal(usuario, almacen.sucursal_id)

    await this.verificarVariantes(datos.items.map((i) => i.variante_id))

    const lineas = datos.items.map((i) => ({
      variante_id: i.variante_id,
      cantidad: i.cantidad,
      costo_unitario: i.costo_unitario,
      subtotal: PreciosService.centavos(i.cantidad * i.costo_unitario),
    }))

    const subtotal = PreciosService.centavos(lineas.reduce((s, l) => s + l.subtotal, 0))
    if (datos.descuento > subtotal) {
      throw ExcepcionNegocio.validacion({
        descuento: `El descuento (${datos.descuento}) supera el subtotal (${subtotal})`,
      })
    }

    const compraId = await this.prisma.$transaction(async (tx) => {
      const [{ numero }] = await tx.$queryRaw<{ numero: string }[]>`
        SELECT correlativo('COM', 'seq_compra') AS numero
      `

      const compra = await tx.compra.create({
        data: {
          numero,
          proveedor_id: datos.proveedor_id,
          almacen_id: datos.almacen_id,
          usuario_id: usuario.id,
          fecha: datos.fecha ?? new Date(),
          subtotal,
          descuento: datos.descuento,
          total: PreciosService.centavos(subtotal - datos.descuento),
          estado: 'borrador',
        },
        select: { id: true, numero: true },
      })

      await tx.compra_detalle.createMany({
        data: lineas.map((l) => ({ ...l, compra_id: compra.id })),
      })

      return compra.id
    })

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'compra',
      entidad: 'compra',
      entidadId: compraId.toString(),
      descripcion: `Compra a ${proveedor.nombre} por ${subtotal - datos.descuento} BOB`,
    })

    return this.detalle(compraId, usuario)
  }

  /** Confirmada = pedida al proveedor. Todavia no toca el inventario. */
  async confirmar(id: bigint, usuario: UsuarioAutenticado, ctx: ContextoPeticion): Promise<Compra> {
    const compra = await this.buscar(id, usuario)

    if (compra.estado !== 'borrador') {
      throw ExcepcionNegocio.conflicto(
        `Solo se confirma una compra en borrador; esta esta ${compra.estado}`
      )
    }

    await this.prisma.compra.update({ where: { id }, data: { estado: 'confirmada' } })

    await this.bitacora.registrar(ctx, {
      accion: 'confirmar',
      modulo: 'compra',
      entidad: 'compra',
      entidadId: id.toString(),
      descripcion: `Compra ${compra.numero} confirmada`,
    })

    return this.detalle(id, usuario)
  }

  /**
   * Recepcion: aqui y solo aqui sube el stock.
   *
   * Si llego menos de lo pedido, la linea se corrige a lo que entro y los
   * totales se recalculan. El documento queda reflejando lo que hay que pagarle
   * al proveedor, y la diferencia contra lo pedido queda en la bitacora.
   */
  async recibir(
    id: bigint,
    datos: DatosRecibirCompra,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Compra> {
    const compra = await this.buscar(id, usuario)

    if (!['borrador', 'confirmada'].includes(compra.estado)) {
      throw ExcepcionNegocio.conflicto(
        `Una compra ${compra.estado} ya no se recibe`
      )
    }

    const recibidoPor = new Map((datos.items ?? []).map((i) => [i.variante_id, i.cantidad_recibida]))

    for (const [varianteId, cantidad] of recibidoPor) {
      const linea = compra.compra_detalle.find((d) => d.variante_id === varianteId)
      if (!linea) {
        throw ExcepcionNegocio.validacion({
          items: `La variante ${varianteId} no estaba en esta compra`,
        })
      }
      if (cantidad > linea.cantidad) {
        throw ExcepcionNegocio.validacion({
          items: `No se puede recibir mas de lo pedido (variante ${varianteId}: pedidas ${linea.cantidad}, declaradas ${cantidad})`,
        })
      }
    }

    const diferencias: string[] = []

    await this.prisma.$transaction(async (tx) => {
      let subtotal = 0

      for (const linea of compra.compra_detalle) {
        // Sin declaracion explicita se asume que llego todo lo pedido.
        const cantidad = recibidoPor.get(linea.variante_id) ?? linea.cantidad

        if (cantidad !== linea.cantidad) {
          diferencias.push(
            `variante ${linea.variante_id}: llegaron ${cantidad} de ${linea.cantidad}`
          )
        }

        const subtotalLinea = PreciosService.centavos(cantidad * aNumero(linea.costo_unitario))
        subtotal += subtotalLinea

        await tx.compra_detalle.update({
          where: { id: linea.id },
          data: { cantidad, subtotal: subtotalLinea },
        })

        if (cantidad > 0) {
          await this.stock.mover(tx, {
            variante_id: linea.variante_id,
            almacen_id: compra.almacen_id,
            cantidad,
            tipo: 'entrada',
            usuario_id: usuario.id,
            motivo: `Compra ${compra.numero}`,
            referencia_tipo: 'compra',
            referencia_id: compra.id,
          })
        }
      }

      subtotal = PreciosService.centavos(subtotal)
      // El descuento no puede pasarse del subtotal corregido.
      const descuento = Math.min(aNumero(compra.descuento), subtotal)

      await tx.compra.update({
        where: { id },
        data: {
          estado: 'recibida',
          subtotal,
          descuento,
          total: PreciosService.centavos(subtotal - descuento),
        },
      })
    })

    await this.bitacora.registrar(ctx, {
      accion: 'recibir',
      modulo: 'compra',
      entidad: 'compra',
      entidadId: id.toString(),
      descripcion:
        diferencias.length > 0
          ? `Compra ${compra.numero} recibida con diferencias: ${diferencias.join('; ')}`
          : `Compra ${compra.numero} recibida completa`,
      datosNuevos: { diferencias },
    })

    return this.detalle(id, usuario)
  }

  /**
   * Anular. Solo antes de recibir: una vez que la mercaderia entro al almacen,
   * deshacerla seria sacar stock que quizas ya se vendio.
   */
  async anular(
    id: bigint,
    motivo: string,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Compra> {
    const compra = await this.buscar(id, usuario)

    if (compra.estado === 'recibida') {
      throw ExcepcionNegocio.conflicto(
        'Una compra recibida no se anula: la mercaderia ya entro. Corresponde un ajuste de inventario.'
      )
    }
    if (compra.estado === 'anulada') {
      throw ExcepcionNegocio.conflicto('Esa compra ya estaba anulada')
    }

    await this.prisma.compra.update({ where: { id }, data: { estado: 'anulada' } })

    await this.bitacora.registrar(ctx, {
      accion: 'anular',
      modulo: 'compra',
      entidad: 'compra',
      entidadId: id.toString(),
      descripcion: `Compra ${compra.numero} anulada: ${motivo}`,
    })

    return this.detalle(id, usuario)
  }

  // ==========================================================================
  // Consultas
  // ==========================================================================

  async listar(filtros: DatosConsultaCompras, usuario: UsuarioAutenticado) {
    const propia = this.permisos.restringeSucursal(usuario)

    const where = {
      estado: filtros.estado,
      proveedor_id: filtros.proveedor_id,
      almacen_id: filtros.almacen_id,
      ...(propia !== null ? { almacen: { sucursal_id: propia } } : {}),
      ...(filtros.desde || filtros.hasta
        ? { fecha: { gte: filtros.desde, lte: filtros.hasta } }
        : {}),
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.compra.count({ where }),
      this.prisma.compra.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: salto(filtros),
        take: filtros.por_pagina,
        include: {
          proveedor: { select: { nombre: true } },
          almacen: { select: { nombre: true, sucursal: { select: { nombre: true } } } },
          compra_detalle: { select: { cantidad: true } },
        },
      }),
    ])

    return {
      total,
      items: filas.map((c) => ({
        id: c.id.toString(),
        numero: c.numero,
        estado: c.estado,
        proveedor: c.proveedor.nombre,
        almacen: c.almacen.nombre,
        sucursal: c.almacen.sucursal.nombre,
        fecha: c.fecha.toISOString().slice(0, 10),
        total: aNumero(c.total),
        articulos: c.compra_detalle.length,
        unidades: c.compra_detalle.reduce((s, d) => s + d.cantidad, 0),
      })),
    }
  }

  async detalle(id: bigint, usuario: UsuarioAutenticado): Promise<Compra> {
    const c = await this.prisma.compra.findUnique({
      where: { id },
      include: {
        proveedor: { select: { nombre: true } },
        almacen: {
          select: { nombre: true, sucursal_id: true, sucursal: { select: { nombre: true } } },
        },
        usuario: { select: { nombre: true, apellido: true } },
        compra_detalle: {
          include: {
            variante: {
              select: {
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
    if (!c) throw ExcepcionNegocio.noEncontrado('Esa compra no existe')

    this.verificarSucursal(usuario, c.almacen.sucursal_id)

    return {
      id: c.id.toString(),
      numero: c.numero,
      estado: c.estado,
      proveedor: c.proveedor.nombre,
      almacen: c.almacen.nombre,
      sucursal: c.almacen.sucursal.nombre,
      usuario: `${c.usuario.nombre} ${c.usuario.apellido}`,
      fecha: c.fecha.toISOString().slice(0, 10),
      subtotal: aNumero(c.subtotal),
      descuento: aNumero(c.descuento),
      total: aNumero(c.total),
      items: c.compra_detalle.map((d) => ({
        variante_id: d.variante_id,
        sku: d.variante.sku,
        descripcion: `${d.variante.producto.nombre} - ${d.variante.talla.nombre} / ${d.variante.color.nombre}`,
        cantidad: d.cantidad,
        costo_unitario: aNumero(d.costo_unitario),
        subtotal: aNumero(d.subtotal),
      })),
    }
  }

  // ==========================================================================
  // Internos
  // ==========================================================================

  private async buscar(id: bigint, usuario: UsuarioAutenticado) {
    const c = await this.prisma.compra.findUnique({
      where: { id },
      include: {
        compra_detalle: true,
        almacen: { select: { sucursal_id: true } },
      },
    })
    if (!c) throw ExcepcionNegocio.noEncontrado('Esa compra no existe')
    this.verificarSucursal(usuario, c.almacen.sucursal_id)
    return c
  }

  private async verificarVariantes(ids: number[]): Promise<void> {
    const existen = await this.prisma.variante.count({ where: { id: { in: ids } } })
    if (existen !== new Set(ids).size) {
      throw ExcepcionNegocio.validacion({ items: 'Alguna de las variantes no existe' })
    }
  }

  private verificarSucursal(usuario: UsuarioAutenticado, sucursalId: number): void {
    const propia = this.permisos.restringeSucursal(usuario)
    if (propia !== null && propia !== sucursalId) {
      throw ExcepcionNegocio.sinPermiso('Esa compra no es de tu sucursal')
    }
  }
}
