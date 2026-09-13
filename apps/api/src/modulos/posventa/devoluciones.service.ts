import { Injectable } from '@nestjs/common'
import type {
  DatosConsultaDevoluciones,
  DatosReembolsar,
  DatosRecibirDevolucion,
  DatosResolverDevolucion,
  DatosSolicitarDevolucion,
  Devolucion,
} from '@aurora/contratos'
import { PERMISOS, salto } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import { NotificacionesService } from '../../nucleo/notificaciones/notificaciones.service'
import { PermisosService } from '../../nucleo/autenticacion/permisos.service'
import { PreciosService } from '../catalogo/precios.service'
import { StockService } from '../inventario/stock.service'
import { aNumero } from '../../nucleo/util/decimal'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'

/**
 * Devoluciones.
 *
 * El ciclo es: solicitada -> aprobada -> recibida -> reembolsada, y se puede
 * cortar en rechazada. Cada paso existe por una razon concreta:
 *
 *   aprobar    alguien decide si corresponde, antes de que la clienta se tome
 *              el viaje hasta la tienda.
 *   recibir    llega la prenda y se la clasifica. AQUI se decide si vuelve al
 *              stock vendible, y a que almacen.
 *   reembolsar recien se devuelve el dinero, con la prenda ya en la mano.
 *
 * Pagar antes de recibir es como se pierde la prenda y la plata.
 */
@Injectable()
export class DevolucionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly permisos: PermisosService,
    private readonly notificaciones: NotificacionesService,
    private readonly bitacora: BitacoraService
  ) {}

  // ==========================================================================
  // Solicitud
  // ==========================================================================

  async solicitar(
    datos: DatosSolicitarDevolucion,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Devolucion> {
    const pedidoId = BigInt(datos.pedido_id)

    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { pedido_detalle: true },
    })
    if (!pedido) throw ExcepcionNegocio.noEncontrado('Ese pedido no existe')

    const esDueno = pedido.cliente_id !== null && pedido.cliente_id === usuario.id
    const esPersonal = this.permisos.puede(usuario.permisos, PERMISOS.DEVOLUCION_GESTIONAR)
    if (!esDueno && !esPersonal) {
      throw ExcepcionNegocio.noEncontrado('Ese pedido no existe')
    }

    // Solo se devuelve lo que se entrego. Un pedido que todavia no salio se
    // cancela, que es otro camino y no genera reembolso.
    if (pedido.estado !== 'entregado') {
      throw ExcepcionNegocio.conflicto(
        pedido.estado === 'devuelto'
          ? 'Ese pedido ya fue devuelto'
          : `Solo se devuelve un pedido entregado; este esta ${pedido.estado}. Si todavia no se entrego, cancelalo.`
      )
    }

    const porLinea = new Map(pedido.pedido_detalle.map((d) => [d.id.toString(), d]))

    // Cuanto se devolvio ya de cada linea, para no aceptar mas de lo comprado
    // repartido en varias solicitudes.
    const previas = await this.prisma.devolucion_detalle.groupBy({
      by: ['pedido_detalle_id'],
      where: {
        pedido_detalle_id: { in: pedido.pedido_detalle.map((d) => d.id) },
        devolucion: { estado: { not: 'rechazada' } },
      },
      _sum: { cantidad: true },
    })
    const yaDevuelto = new Map(previas.map((p) => [p.pedido_detalle_id.toString(), p._sum.cantidad ?? 0]))

    let montoEstimado = 0
    const lineas: { pedido_detalle_id: bigint; variante_id: number; cantidad: number }[] = []

    for (const item of datos.items) {
      const linea = porLinea.get(item.pedido_detalle_id)
      if (!linea) {
        throw ExcepcionNegocio.validacion({
          items: `La linea ${item.pedido_detalle_id} no pertenece a este pedido`,
        })
      }

      const disponible = linea.cantidad - (yaDevuelto.get(item.pedido_detalle_id) ?? 0)
      if (item.cantidad > disponible) {
        throw ExcepcionNegocio.validacion({
          items: `De ${linea.descripcion} quedan ${disponible} unidad(es) por devolver y se piden ${item.cantidad}`,
        })
      }

      montoEstimado += item.cantidad * aNumero(linea.precio_unitario)
      lineas.push({
        pedido_detalle_id: linea.id,
        variante_id: linea.variante_id,
        cantidad: item.cantidad,
      })
    }

    const devolucionId = await this.prisma.$transaction(async (tx) => {
      const [{ numero }] = await tx.$queryRaw<{ numero: string }[]>`
        SELECT correlativo('DEV', 'seq_devolucion') AS numero
      `

      const devolucion = await tx.devolucion.create({
        data: {
          numero,
          pedido_id: pedidoId,
          cliente_id: pedido.cliente_id,
          motivo: datos.motivo,
          detalle: datos.detalle ?? null,
          estado: 'solicitada',
        },
        select: { id: true },
      })

      await tx.devolucion_detalle.createMany({
        data: lineas.map((l) => ({ ...l, devolucion_id: devolucion.id })),
      })

      return devolucion.id
    })

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'devolucion',
      entidad: 'devolucion',
      entidadId: devolucionId.toString(),
      descripcion: `Devolucion solicitada del pedido ${pedido.numero} por ${datos.motivo}`,
    })

    return this.detalle(devolucionId, usuario)
  }

  // ==========================================================================
  // Aprobacion
  // ==========================================================================

  async resolver(
    id: bigint,
    datos: DatosResolverDevolucion,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Devolucion> {
    const devolucion = await this.buscar(id, usuario)

    if (devolucion.estado !== 'solicitada') {
      throw ExcepcionNegocio.conflicto(
        `Solo se resuelve una devolucion solicitada; esta esta ${devolucion.estado}`
      )
    }

    await this.prisma.devolucion.update({
      where: { id },
      data: {
        estado: datos.aprobada ? 'aprobada' : 'rechazada',
        usuario_gestiona_id: usuario.id,
        detalle: datos.comentario ?? devolucion.detalle,
        cerrado_en: datos.aprobada ? null : new Date(),
      },
    })

    /**
     * Avisarle a la clienta como se resolvio.
     *
     * Una devolucion rechazada que nadie comunica deja a alguien esperando un
     * reembolso que no va a llegar, y el motivo va en el aviso porque
     * "rechazada" a secas no le dice que puede hacer al respecto.
     */
    if (devolucion.cliente_id !== null) {
      await this.notificaciones.crear({
        usuarioId: devolucion.cliente_id,
        tipo: 'devolucion',
        titulo: datos.aprobada ? 'Aprobamos tu devolucion' : 'No pudimos aprobar tu devolucion',
        mensaje: datos.aprobada
          ? `La devolucion ${devolucion.numero} fue aprobada. Podes traer la prenda.`
          : `La devolucion ${devolucion.numero} fue rechazada${
              datos.comentario ? `: ${datos.comentario}` : ''
            }.`,
        url: '/mis-pedidos',
      })
    }

    await this.bitacora.registrar(ctx, {
      accion: datos.aprobada ? 'aprobar' : 'rechazar',
      modulo: 'devolucion',
      entidad: 'devolucion',
      entidadId: id.toString(),
      descripcion: `Devolucion ${devolucion.numero} ${datos.aprobada ? 'aprobada' : `rechazada: ${datos.comentario ?? 'sin motivo'}`}`,
    })

    return this.detalle(id, usuario)
  }

  // ==========================================================================
  // Recepcion de la mercaderia
  // ==========================================================================

  /**
   * Recibe las prendas y decide que vuelve al stock.
   *
   * Una prenda nueva reingresa al almacen desde el que se vendio. Una usada va
   * al almacen de devoluciones de la sucursal, si existe, para revisarla antes
   * de volver a ofrecerla. Una daniada no reingresa a ningun lado: ponerla de
   * vuelta en el stock vendible es mandarsela rota a la siguiente clienta.
   */
  async recibir(
    id: bigint,
    datos: DatosRecibirDevolucion,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Devolucion> {
    const devolucion = await this.buscar(id, usuario)

    if (devolucion.estado !== 'aprobada') {
      throw ExcepcionNegocio.conflicto(
        `Solo se recibe una devolucion aprobada; esta esta ${devolucion.estado}`
      )
    }

    const clasificacion = new Map(datos.items.map((i) => [i.variante_id, i]))
    const almacenDevoluciones = await this.almacenDeDevoluciones(devolucion.pedido.sucursal_id)
    const reingresadas: string[] = []

    await this.prisma.$transaction(async (tx) => {
      for (const linea of devolucion.devolucion_detalle) {
        const clasif = clasificacion.get(linea.variante_id)
        if (!clasif) {
          throw ExcepcionNegocio.validacion({
            items: `Falta clasificar la variante ${linea.variante_id}`,
          })
        }

        // Una prenda daniada no vuelve al stock aunque se pida lo contrario.
        const reingresa =
          clasif.estado_prenda !== 'danada' && (clasif.reingresa_stock ?? true)

        await tx.devolucion_detalle.update({
          where: { id: linea.id },
          data: { estado_prenda: clasif.estado_prenda, reingresa_stock: reingresa },
        })

        if (!reingresa) continue

        const almacenDestino =
          clasif.estado_prenda === 'nueva'
            ? devolucion.pedido.almacen_id
            : (almacenDevoluciones ?? devolucion.pedido.almacen_id)

        await this.stock.mover(tx, {
          variante_id: linea.variante_id,
          almacen_id: almacenDestino,
          cantidad: linea.cantidad,
          tipo: 'devolucion',
          usuario_id: usuario.id,
          motivo: `Devolucion ${devolucion.numero} (${clasif.estado_prenda})`,
          referencia_tipo: 'devolucion',
          referencia_id: devolucion.id,
        })

        reingresadas.push(`${linea.cantidad} x variante ${linea.variante_id} (${clasif.estado_prenda})`)
      }

      await tx.devolucion.update({
        where: { id },
        data: { estado: 'recibida', usuario_gestiona_id: usuario.id },
      })
    })

    await this.bitacora.registrar(ctx, {
      accion: 'recibir',
      modulo: 'devolucion',
      entidad: 'devolucion',
      entidadId: id.toString(),
      descripcion: `Devolucion ${devolucion.numero} recibida. Reingresaron: ${reingresadas.join('; ') || 'nada'}`,
    })

    return this.detalle(id, usuario)
  }

  // ==========================================================================
  // Reembolso
  // ==========================================================================

  async reembolsar(
    id: bigint,
    datos: DatosReembolsar,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Devolucion> {
    const devolucion = await this.buscar(id, usuario)

    if (devolucion.estado !== 'recibida') {
      throw ExcepcionNegocio.conflicto(
        `Solo se reembolsa una devolucion recibida; esta esta ${devolucion.estado}. Primero hay que tener la prenda.`
      )
    }

    // El tope es lo que se pago por esas prendas. Reembolsar de mas convierte
    // una devolucion en una salida de caja sin respaldo.
    const tope = await this.montoDevuelto(devolucion.devolucion_detalle)
    if (datos.monto > tope) {
      throw ExcepcionNegocio.validacion({
        monto: `El maximo a reembolsar por esta devolucion es ${tope}`,
      })
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.devolucion.update({
        where: { id },
        data: {
          estado: 'reembolsada',
          monto_reembolso: datos.monto,
          usuario_gestiona_id: usuario.id,
          cerrado_en: new Date(),
        },
      })

      // Si se devolvio todo lo que tenia el pedido, el pedido queda devuelto.
      // Si fue parcial, sigue entregado: una parte quedo en manos del cliente.
      if (await this.seDevolvioTodo(tx, devolucion.pedido_id)) {
        await tx.pedido.update({ where: { id: devolucion.pedido_id }, data: { estado: 'devuelto' } })
        await tx.pedido_historial.create({
          data: {
            pedido_id: devolucion.pedido_id,
            estado: 'devuelto',
            usuario_id: usuario.id,
            comentario: `Devolucion ${devolucion.numero} reembolsada`,
          },
        })
      }
    })

    await this.bitacora.registrar(ctx, {
      accion: 'reembolsar',
      modulo: 'devolucion',
      entidad: 'devolucion',
      entidadId: id.toString(),
      descripcion: `Devolucion ${devolucion.numero} reembolsada por ${datos.monto} BOB`,
      datosNuevos: { monto: datos.monto, comentario: datos.comentario ?? null },
    })

    return this.detalle(id, usuario)
  }

  // ==========================================================================
  // Consultas
  // ==========================================================================

  async listar(filtros: DatosConsultaDevoluciones, usuario: UsuarioAutenticado) {
    const esPersonal = this.permisos.puede(usuario.permisos, PERMISOS.DEVOLUCION_GESTIONAR)
    const propia = this.permisos.restringeSucursal(usuario)

    const where = {
      estado: filtros.estado,
      motivo: filtros.motivo,
      ...(esPersonal
        ? propia !== null || filtros.sucursal_id !== undefined
          ? { pedido: { sucursal_id: propia ?? filtros.sucursal_id } }
          : {}
        : { cliente_id: usuario.id }),
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.devolucion.count({ where }),
      this.prisma.devolucion.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: salto(filtros),
        take: filtros.por_pagina,
        include: {
          pedido: { select: { numero: true } },
          cliente: { select: { usuario: { select: { nombre: true, apellido: true } } } },
          devolucion_detalle: { select: { cantidad: true } },
        },
      }),
    ])

    return {
      total,
      items: filas.map((d) => ({
        id: d.id.toString(),
        numero: d.numero,
        pedido_numero: d.pedido.numero,
        cliente: d.cliente ? `${d.cliente.usuario.nombre} ${d.cliente.usuario.apellido}` : null,
        motivo: d.motivo,
        estado: d.estado,
        unidades: d.devolucion_detalle.reduce((s, x) => s + x.cantidad, 0),
        monto_reembolso: aNumero(d.monto_reembolso),
        creado_en: d.creado_en.toISOString(),
      })),
    }
  }

  async detalle(id: bigint, usuario: UsuarioAutenticado): Promise<Devolucion> {
    const d = await this.prisma.devolucion.findUnique({
      where: { id },
      include: {
        pedido: { select: { numero: true, sucursal_id: true } },
        cliente: { select: { usuario: { select: { nombre: true, apellido: true } } } },
        usuario: { select: { nombre: true, apellido: true } },
        devolucion_detalle: {
          include: {
            variante: {
              select: {
                sku: true,
                producto: { select: { nombre: true } },
                talla: { select: { nombre: true } },
                color: { select: { nombre: true } },
              },
            },
            pedido_detalle: { select: { precio_unitario: true } },
          },
        },
      },
    })
    if (!d) throw ExcepcionNegocio.noEncontrado('Esa devolucion no existe')

    const esPersonal = this.permisos.puede(usuario.permisos, PERMISOS.DEVOLUCION_GESTIONAR)
    if (!esPersonal && d.cliente_id !== usuario.id) {
      throw ExcepcionNegocio.noEncontrado('Esa devolucion no existe')
    }
    if (esPersonal) {
      const propia = this.permisos.restringeSucursal(usuario)
      if (propia !== null && propia !== d.pedido.sucursal_id) {
        throw ExcepcionNegocio.sinPermiso('Esa devolucion no es de tu sucursal')
      }
    }

    return {
      id: d.id.toString(),
      numero: d.numero,
      pedido_id: d.pedido_id.toString(),
      pedido_numero: d.pedido.numero,
      cliente: d.cliente ? `${d.cliente.usuario.nombre} ${d.cliente.usuario.apellido}` : null,
      motivo: d.motivo,
      detalle: d.detalle,
      estado: d.estado,
      monto_reembolso: aNumero(d.monto_reembolso),
      monto_estimado: await this.montoDevuelto(d.devolucion_detalle),
      gestiona: d.usuario ? `${d.usuario.nombre} ${d.usuario.apellido}` : null,
      creado_en: d.creado_en.toISOString(),
      cerrado_en: d.cerrado_en?.toISOString() ?? null,
      items: d.devolucion_detalle.map((x) => ({
        variante_id: x.variante_id,
        sku: x.variante.sku,
        descripcion: `${x.variante.producto.nombre} - ${x.variante.talla.nombre} / ${x.variante.color.nombre}`,
        cantidad: x.cantidad,
        estado_prenda: x.estado_prenda,
        reingresa_stock: x.reingresa_stock,
        precio_unitario: aNumero(x.pedido_detalle.precio_unitario),
      })),
    }
  }

  // ==========================================================================
  // Internos
  // ==========================================================================

  private async buscar(id: bigint, usuario: UsuarioAutenticado) {
    const d = await this.prisma.devolucion.findUnique({
      where: { id },
      include: {
        devolucion_detalle: { include: { pedido_detalle: { select: { precio_unitario: true } } } },
        pedido: { select: { sucursal_id: true, almacen_id: true, numero: true } },
      },
    })
    if (!d) throw ExcepcionNegocio.noEncontrado('Esa devolucion no existe')

    const propia = this.permisos.restringeSucursal(usuario)
    if (propia !== null && propia !== d.pedido.sucursal_id) {
      throw ExcepcionNegocio.sinPermiso('Esa devolucion no es de tu sucursal')
    }

    return d
  }

  private async montoDevuelto(
    lineas: readonly { cantidad: number; pedido_detalle: { precio_unitario: unknown } }[]
  ): Promise<number> {
    return PreciosService.centavos(
      lineas.reduce((s, l) => s + l.cantidad * aNumero(l.pedido_detalle.precio_unitario as never), 0)
    )
  }

  /** El almacen de devoluciones de la sucursal, si lo tiene configurado. */
  private async almacenDeDevoluciones(sucursalId: number): Promise<number | null> {
    const a = await this.prisma.almacen.findFirst({
      where: { sucursal_id: sucursalId, tipo: 'devoluciones', activo: true },
      select: { id: true },
    })
    return a?.id ?? null
  }

  private async seDevolvioTodo(
    tx: Parameters<StockService['mover']>[0],
    pedidoId: bigint
  ): Promise<boolean> {
    const vendido = await tx.pedido_detalle.aggregate({
      where: { pedido_id: pedidoId },
      _sum: { cantidad: true },
    })
    const devuelto = await tx.devolucion_detalle.aggregate({
      where: { devolucion: { pedido_id: pedidoId, estado: { in: ['recibida', 'reembolsada'] } } },
      _sum: { cantidad: true },
    })
    return (devuelto._sum.cantidad ?? 0) >= (vendido._sum.cantidad ?? 0)
  }
}
