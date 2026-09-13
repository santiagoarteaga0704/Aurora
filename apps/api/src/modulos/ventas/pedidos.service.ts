import { Injectable } from '@nestjs/common'
import type {
  Canal,
  DatosConsultaPedidos,
  DatosCrearPedido,
  EstadoPedido,
  Pedido,
  TipoEntrega,
} from '@aurora/contratos'
import { PERMISOS, puedePasarA, salto, TRANSICIONES_PEDIDO } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import { PermisosService } from '../../nucleo/autenticacion/permisos.service'
import { PreciosService } from '../catalogo/precios.service'
import { StockService, type Tx } from '../inventario/stock.service'
import { CarritoService } from './carrito.service'
import { aNumero } from '../../nucleo/util/decimal'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly precios: PreciosService,
    private readonly stock: StockService,
    private readonly carrito: CarritoService,
    private readonly permisos: PermisosService,
    private readonly bitacora: BitacoraService
  ) {}

  // ==========================================================================
  // Alta
  // ==========================================================================

  /**
   * Registra un pedido.
   *
   * El mismo metodo atiende la venta online y la de mostrador. Lo que cambia es
   * cuando sale la mercaderia:
   *
   *   tienda + inmediata  la clienta se lleva la prenda ahora, asi que el stock
   *                       sale en este mismo momento.
   *   el resto            se RESERVA. El articulo sigue en el almacen pero deja
   *                       de ser vendible; sale cuando alguien lo prepara.
   *
   * Reservar en vez de descontar es lo que evita las dos formas de quedar mal:
   * vender algo que ya no esta, y que un pedido sin pagar bloquee el inventario
   * para siempre (al cancelarse, la reserva se libera).
   */
  async crear(
    datos: DatosCrearPedido,
    usuario: UsuarioAutenticado | null,
    sessionCarrito: string | null,
    claveIdempotencia: string | null,
    ctx: ContextoPeticion
  ): Promise<Pedido> {
    // Una venta hecha sin conexion se reintenta al volver la red. Si el
    // reintento llega con la misma clave, se devuelve el pedido que ya existe en
    // lugar de cobrar dos veces.
    if (claveIdempotencia) {
      const yaRegistrado = await this.prisma.pedido.findUnique({
        where: { idempotency_key: claveIdempotencia },
        select: { id: true },
      })
      if (yaRegistrado) return this.detalle(yaRegistrado.id, usuario)
    }

    const esMostrador = datos.canal === 'tienda'
    if (esMostrador && (!usuario || !this.permisos.puede(usuario.permisos, PERMISOS.VENTA_CREAR))) {
      throw ExcepcionNegocio.sinPermiso('Solo el personal registra ventas de mostrador')
    }

    const sucursal = await this.prisma.sucursal.findUnique({
      where: { id: datos.sucursal_id },
      select: { id: true, nombre: true, activo: true },
    })
    if (!sucursal?.activo) {
      throw ExcepcionNegocio.validacion({ sucursal_id: 'Esa sucursal no existe o esta inactiva' })
    }
    if (esMostrador && usuario) {
      const propia = this.permisos.restringeSucursal(usuario)
      if (propia !== null && propia !== sucursal.id) {
        throw ExcepcionNegocio.sinPermiso('Solo puedes vender en tu sucursal')
      }
    }

    const almacenId = await this.almacenDeVenta(datos.sucursal_id, datos.almacen_id)

    // Quien compra: en la tienda online es quien tiene la sesion; en mostrador
    // puede indicarse un cliente registrado, o ser una venta sin identificar.
    const clienteId = esMostrador
      ? (datos.cliente_id ?? null)
      : await this.clienteDe(usuario)

    if (!esMostrador && clienteId === null) {
      throw ExcepcionNegocio.noAutenticado('Necesitas iniciar sesion para terminar la compra')
    }

    // Los articulos vienen en la peticion (mostrador) o del carrito (tienda).
    let carritoId: bigint | null = null
    let items = datos.items ?? []

    if (items.length === 0) {
      const c = await this.carrito.obtenerOCrear(usuario, sessionCarrito)
      carritoId = c.id
      const filas = await this.prisma.carrito_item.findMany({ where: { carrito_id: c.id } })
      items = filas.map((f) => ({ variante_id: f.variante_id, cantidad: f.cantidad }))
    }

    if (items.length === 0) {
      throw ExcepcionNegocio.validacion({ items: 'No hay articulos que cobrar' })
    }

    // Dos lineas de la misma variante romperian el descuento de stock y darian
    // un total distinto al que ve la clienta.
    const unicas = new Set(items.map((i) => i.variante_id))
    if (unicas.size !== items.length) {
      throw ExcepcionNegocio.validacion({
        items: 'Hay una variante repetida; junta las cantidades en una sola linea',
      })
    }

    if (datos.direccion_id !== undefined) {
      await this.verificarDireccion(datos.direccion_id, clienteId)
    }

    const modalidad = await this.precios.modalidadDe(clienteId)
    const precios = await this.precios.resolver(items, modalidad)

    const lineas = items.map((item, n) => {
      const p = precios[n]
      return {
        variante_id: item.variante_id,
        descripcion: p.descripcion.slice(0, 200),
        cantidad: item.cantidad,
        precio_unitario: p.precio_unitario,
        descuento: 0,
        subtotal: PreciosService.centavos(p.precio_unitario * item.cantidad),
      }
    })

    const subtotal = PreciosService.centavos(lineas.reduce((s, l) => s + l.subtotal, 0))
    const descuento = 0 // lo completara el modulo de promociones
    const total = PreciosService.centavos(subtotal - descuento + datos.costo_envio)

    const salidaInmediata = esMostrador && datos.tipo_entrega === 'inmediata'

    const pedidoId = await this.prisma.$transaction(async (tx) => {
      const [{ numero }] = await tx.$queryRaw<{ numero: string }[]>`
        SELECT correlativo('PED', 'seq_pedido') AS numero
      `

      const pedido = await tx.pedido.create({
        data: {
          numero,
          cliente_id: clienteId,
          sucursal_id: datos.sucursal_id,
          almacen_id: almacenId,
          vendedor_id: esMostrador ? (usuario?.id ?? null) : null,
          canal: datos.canal,
          modalidad: modalidad === 'mayoreo' ? 'mayoreo' : 'menudeo',
          tipo_entrega: datos.tipo_entrega,
          estado: 'pendiente',
          direccion_id: datos.direccion_id ?? null,
          subtotal,
          descuento,
          costo_envio: datos.costo_envio,
          total,
          nota: datos.nota ?? null,
          idempotency_key: claveIdempotencia,
          creado_offline: datos.creado_offline,
          creado_en_cliente: datos.creado_en_cliente ?? null,
        },
        select: { id: true, numero: true },
      })

      await tx.pedido_detalle.createMany({
        data: lineas.map((l) => ({ ...l, pedido_id: pedido.id })),
      })

      for (const linea of lineas) {
        if (salidaInmediata) {
          await this.stock.mover(tx, {
            variante_id: linea.variante_id,
            almacen_id: almacenId,
            cantidad: -linea.cantidad,
            tipo: 'salida',
            usuario_id: usuario?.id ?? null,
            motivo: `Venta ${pedido.numero}`,
            referencia_tipo: 'pedido',
            referencia_id: pedido.id,
          })
        } else {
          await this.stock.reservar(tx, linea.variante_id, almacenId, linea.cantidad)
        }
      }

      await tx.pedido_historial.create({
        data: {
          pedido_id: pedido.id,
          estado: 'pendiente',
          usuario_id: usuario?.id ?? null,
          comentario: datos.creado_offline ? 'Registrado sin conexion' : 'Pedido registrado',
        },
      })

      return pedido.id
    })

    if (carritoId !== null) await this.carrito.vaciarPorId(carritoId)

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'venta',
      entidad: 'pedido',
      entidadId: pedidoId.toString(),
      descripcion: `Pedido por ${total} BOB (${datos.canal})`,
      datosNuevos: { total, items: lineas.length, canal: datos.canal },
    })

    return this.detalle(pedidoId, usuario)
  }

  // ==========================================================================
  // Cambio de estado
  // ==========================================================================

  async cambiarEstado(
    id: bigint,
    nuevo: EstadoPedido,
    comentario: string | undefined,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Pedido> {
    const pedido = await this.buscar(id)
    this.verificarSucursal(usuario, pedido.sucursal_id)

    if (!puedePasarA(pedido.estado, nuevo)) {
      throw ExcepcionNegocio.conflicto(
        `Un pedido ${pedido.estado} no puede pasar a ${nuevo}`,
        { estado: `Transiciones validas: ${this.transicionesDe(pedido.estado)}` }
      )
    }

    if (nuevo === 'cancelado') {
      return this.cancelar(id, comentario ?? 'Cancelado', usuario, ctx)
    }

    const consumeAhora =
      !this.stockYaSalio(pedido) && nuevo === 'preparando'

    await this.prisma.$transaction(async (tx) => {
      if (consumeAhora) {
        // Al preparar el pedido la mercaderia sale de verdad del almacen: la
        // reserva se convierte en salida en un solo paso, para que entre una
        // cosa y la otra nadie pueda vender ese articulo.
        for (const linea of pedido.pedido_detalle) {
          await this.stock.consumirReserva(tx, {
            variante_id: linea.variante_id,
            almacen_id: pedido.almacen_id,
            cantidad: linea.cantidad,
            tipo: 'salida',
            usuario_id: usuario.id,
            motivo: `Preparacion del pedido ${pedido.numero}`,
            referencia_tipo: 'pedido',
            referencia_id: pedido.id,
          })
        }
      }

      await tx.pedido.update({ where: { id }, data: { estado: nuevo } })
      await tx.pedido_historial.create({
        data: {
          pedido_id: id,
          estado: nuevo,
          usuario_id: usuario.id,
          comentario: comentario ?? null,
        },
      })
    })

    await this.bitacora.registrar(ctx, {
      accion: 'actualizar',
      modulo: 'venta',
      entidad: 'pedido',
      entidadId: id.toString(),
      descripcion: `Pedido ${pedido.numero}: ${pedido.estado} -> ${nuevo}`,
      datosPrevios: { estado: pedido.estado },
      datosNuevos: { estado: nuevo },
    })

    return this.detalle(id, usuario)
  }

  /**
   * Cancela un pedido y devuelve el inventario a su lugar.
   *
   * Que hay que devolver depende de si la mercaderia ya salio del almacen: si
   * solo estaba reservada, se libera la reserva; si ya se habia preparado, vuelve
   * a entrar como stock. Confundir los dos casos es lo que produce inventarios
   * inflados o articulos trabados que nadie puede vender.
   */
  async cancelar(
    id: bigint,
    motivo: string,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Pedido> {
    const pedido = await this.buscar(id)

    // El control de acceso va ANTES que el del estado. Al reves, a quien no
    // tiene nada que ver con el pedido se le contestaria "no se puede cancelar
    // un pedido entregado", y ese mensaje ya le confirma que el pedido existe.
    const esDueno = pedido.cliente_id !== null && pedido.cliente_id === usuario.id
    const puedeAnular = this.permisos.puede(usuario.permisos, PERMISOS.VENTA_ANULAR)
    const esPersonal = puedeAnular || this.permisos.puede(usuario.permisos, PERMISOS.VENTA_VER)

    if (!esDueno && !esPersonal) {
      // Mismo 404 que al consultarlo: para un tercero, el pedido no existe.
      throw ExcepcionNegocio.noEncontrado('Ese pedido no existe')
    }
    if (!esDueno && !puedeAnular) {
      throw ExcepcionNegocio.sinPermiso('Te falta el permiso para anular pedidos')
    }
    if (esPersonal) this.verificarSucursal(usuario, pedido.sucursal_id)

    if (!puedePasarA(pedido.estado, 'cancelado')) {
      throw ExcepcionNegocio.conflicto(
        pedido.estado === 'entregado'
          ? 'Un pedido entregado no se cancela: corresponde una devolucion'
          : `Un pedido ${pedido.estado} ya no se puede cancelar`
      )
    }

    // Un cliente cancela lo suyo mientras no se haya preparado; despues tiene
    // que hablar con la tienda, porque la mercaderia ya salio del almacen.
    if (esDueno && !puedeAnular && !['pendiente', 'pagado'].includes(pedido.estado)) {
      throw ExcepcionNegocio.conflicto(
        'El pedido ya se esta preparando. Comunicate con la tienda para cancelarlo.'
      )
    }

    const yaSalio = this.stockYaSalio(pedido)

    await this.prisma.$transaction(async (tx) => {
      for (const linea of pedido.pedido_detalle) {
        if (yaSalio) {
          await this.stock.mover(tx, {
            variante_id: linea.variante_id,
            almacen_id: pedido.almacen_id,
            cantidad: linea.cantidad,
            tipo: 'devolucion',
            usuario_id: usuario.id,
            motivo: `Cancelacion del pedido ${pedido.numero}`,
            referencia_tipo: 'pedido',
            referencia_id: pedido.id,
          })
        } else {
          await this.stock.liberar(tx, linea.variante_id, pedido.almacen_id, linea.cantidad)
        }
      }

      await tx.pedido.update({ where: { id }, data: { estado: 'cancelado' } })
      await tx.pedido_historial.create({
        data: { pedido_id: id, estado: 'cancelado', usuario_id: usuario.id, comentario: motivo },
      })
    })

    await this.bitacora.registrar(ctx, {
      accion: 'anular',
      modulo: 'venta',
      entidad: 'pedido',
      entidadId: id.toString(),
      descripcion: `Pedido ${pedido.numero} cancelado: ${motivo}`,
      datosPrevios: { estado: pedido.estado },
    })

    return this.detalle(id, usuario)
  }

  /**
   * Lo llama el modulo de pagos cuando el pedido queda saldado. No es un cambio
   * de estado normal: no lo pide un usuario, lo dispara el dinero.
   */
  async marcarPagado(tx: Tx, pedidoId: bigint, usuarioId: number | null): Promise<void> {
    const pedido = await tx.pedido.findUnique({
      where: { id: pedidoId },
      select: { estado: true },
    })
    if (!pedido || pedido.estado !== 'pendiente') return

    await tx.pedido.update({ where: { id: pedidoId }, data: { estado: 'pagado' } })
    await tx.pedido_historial.create({
      data: {
        pedido_id: pedidoId,
        estado: 'pagado',
        usuario_id: usuarioId,
        comentario: 'Pago completo confirmado',
      },
    })
  }

  // ==========================================================================
  // Consultas
  // ==========================================================================

  async listar(filtros: DatosConsultaPedidos, usuario: UsuarioAutenticado) {
    const clientePropio = await this.clienteDe(usuario)
    const puedeVerTodo = this.permisos.puede(usuario.permisos, PERMISOS.VENTA_VER)

    // Un cliente solo ve sus pedidos, y eso no se negocia con un parametro.
    const where = {
      ...(puedeVerTodo
        ? {
            sucursal_id: this.permisos.restringeSucursal(usuario) ?? filtros.sucursal_id,
            cliente_id: filtros.cliente_id,
          }
        : { cliente_id: clientePropio ?? -1 }),
      estado: filtros.estado,
      canal: filtros.canal,
      numero: filtros.numero,
      ...(filtros.desde || filtros.hasta
        ? { creado_en: { gte: filtros.desde, lte: filtros.hasta } }
        : {}),
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.pedido.count({ where }),
      this.prisma.pedido.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: salto(filtros),
        take: filtros.por_pagina,
        include: {
          sucursal: { select: { nombre: true } },
          cliente: { select: { usuario: { select: { nombre: true, apellido: true } } } },
          pedido_detalle: { select: { cantidad: true } },
          pago: { select: { monto: true, estado: true } },
        },
      }),
    ])

    return {
      total,
      items: filas.map((p) => ({
        id: p.id.toString(),
        numero: p.numero,
        estado: p.estado,
        canal: p.canal,
        sucursal: p.sucursal.nombre,
        cliente: p.cliente ? `${p.cliente.usuario.nombre} ${p.cliente.usuario.apellido}` : null,
        total: aNumero(p.total),
        pagado: this.sumarConfirmados(p.pago),
        unidades: p.pedido_detalle.reduce((s, d) => s + d.cantidad, 0),
        creado_en: p.creado_en.toISOString(),
        creado_offline: p.creado_offline,
      })),
    }
  }

  async detalle(id: bigint, usuario: UsuarioAutenticado | null): Promise<Pedido> {
    const p = await this.prisma.pedido.findUnique({
      where: { id },
      include: {
        sucursal: { select: { nombre: true } },
        cliente: { select: { usuario: { select: { nombre: true, apellido: true } } } },
        usuario: { select: { nombre: true, apellido: true } },
        pedido_detalle: { include: { variante: { select: { sku: true } } } },
        pago: { select: { monto: true, estado: true } },
      },
    })

    if (!p) throw ExcepcionNegocio.noEncontrado('Ese pedido no existe')

    // Un cliente no puede leer el pedido de otro cambiando el numero en la URL.
    if (usuario && !this.permisos.puede(usuario.permisos, PERMISOS.VENTA_VER)) {
      if (p.cliente_id !== usuario.id) {
        throw ExcepcionNegocio.noEncontrado('Ese pedido no existe')
      }
    }

    const pagado = this.sumarConfirmados(p.pago)
    const total = aNumero(p.total)

    return {
      id: p.id.toString(),
      numero: p.numero,
      estado: p.estado,
      canal: p.canal,
      modalidad: p.modalidad,
      tipo_entrega: p.tipo_entrega,
      sucursal: p.sucursal.nombre,
      sucursal_id: p.sucursal_id,
      almacen_id: p.almacen_id,
      cliente: p.cliente ? `${p.cliente.usuario.nombre} ${p.cliente.usuario.apellido}` : null,
      vendedor: p.usuario ? `${p.usuario.nombre} ${p.usuario.apellido}` : null,
      subtotal: aNumero(p.subtotal),
      descuento: aNumero(p.descuento),
      costo_envio: aNumero(p.costo_envio),
      total,
      pagado,
      saldo: PreciosService.centavos(total - pagado),
      moneda: p.moneda,
      nota: p.nota,
      creado_offline: p.creado_offline,
      creado_en: p.creado_en.toISOString(),
      items: p.pedido_detalle.map((d) => ({
        variante_id: d.variante_id,
        sku: d.variante.sku,
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        precio_unitario: aNumero(d.precio_unitario),
        descuento: aNumero(d.descuento),
        subtotal: aNumero(d.subtotal),
      })),
    }
  }

  async historial(id: bigint, usuario: UsuarioAutenticado) {
    await this.detalle(id, usuario) // reusa el control de acceso

    const filas = await this.prisma.pedido_historial.findMany({
      where: { pedido_id: id },
      orderBy: { id: 'asc' },
      include: { usuario: { select: { nombre: true, apellido: true } } },
    })

    return filas.map((h) => ({
      estado: h.estado,
      comentario: h.comentario,
      usuario: h.usuario ? `${h.usuario.nombre} ${h.usuario.apellido}` : null,
      fecha: h.creado_en.toISOString(),
    }))
  }

  // ==========================================================================
  // Internos
  // ==========================================================================

  private sumarConfirmados(pagos: readonly { monto: unknown; estado: string }[]): number {
    return PreciosService.centavos(
      pagos
        .filter((p) => p.estado === 'confirmado')
        .reduce((s, p) => s + aNumero(p.monto as never), 0)
    )
  }

  /**
   * Dice si la mercaderia de un pedido ya salio del almacen.
   *
   * Una venta de mostrador inmediata descuenta al registrarse; el resto lo hace
   * al prepararse. No hay una columna que lo diga, pero se deduce del canal, el
   * tipo de entrega y el estado, que es informacion que ya esta guardada.
   */
  private stockYaSalio(pedido: { canal: Canal; tipo_entrega: TipoEntrega; estado: EstadoPedido }) {
    if (pedido.canal === 'tienda' && pedido.tipo_entrega === 'inmediata') return true
    return ['preparando', 'listo', 'enviado', 'entregado'].includes(pedido.estado)
  }

  private transicionesDe(estado: EstadoPedido): string {
    const posibles = TRANSICIONES_PEDIDO[estado]
    return posibles.length > 0 ? posibles.join(', ') : 'ninguna, es un estado final'
  }

  private async buscar(id: bigint) {
    const p = await this.prisma.pedido.findUnique({
      where: { id },
      include: { pedido_detalle: true },
    })
    if (!p) throw ExcepcionNegocio.noEncontrado('Ese pedido no existe')
    return p
  }

  /** El almacen desde el que se vende: el indicado, o el principal de venta. */
  private async almacenDeVenta(sucursalId: number, almacenId?: number): Promise<number> {
    if (almacenId !== undefined) {
      const a = await this.prisma.almacen.findUnique({
        where: { id: almacenId },
        select: { id: true, sucursal_id: true, activo: true },
      })
      if (!a?.activo) {
        throw ExcepcionNegocio.validacion({ almacen_id: 'Ese almacen no existe o esta inactivo' })
      }
      if (a.sucursal_id !== sucursalId) {
        throw ExcepcionNegocio.validacion({
          almacen_id: 'Ese almacen no pertenece a la sucursal del pedido',
        })
      }
      return a.id
    }

    const principal = await this.prisma.almacen.findFirst({
      where: { sucursal_id: sucursalId, tipo: 'venta', activo: true },
      orderBy: { es_principal: 'desc' },
      select: { id: true },
    })
    if (!principal) {
      throw ExcepcionNegocio.conflicto('Esa sucursal no tiene un almacen de venta configurado')
    }
    return principal.id
  }

  private async clienteDe(usuario: UsuarioAutenticado | null): Promise<number | null> {
    if (!usuario) return null
    const c = await this.prisma.cliente.findUnique({
      where: { usuario_id: usuario.id },
      select: { usuario_id: true },
    })
    return c?.usuario_id ?? null
  }

  private async verificarDireccion(direccionId: number, clienteId: number | null): Promise<void> {
    const d = await this.prisma.direccion_cliente.findUnique({
      where: { id: direccionId },
      select: { cliente_id: true, activo: true },
    })
    if (!d?.activo) {
      throw ExcepcionNegocio.validacion({ direccion_id: 'Esa direccion no existe' })
    }
    // Enviar el pedido de alguien a la direccion de otro seria una fuga de datos
    // ademas de un error de entrega.
    if (clienteId !== null && d.cliente_id !== clienteId) {
      throw ExcepcionNegocio.validacion({ direccion_id: 'Esa direccion no es de este cliente' })
    }
  }

  private verificarSucursal(usuario: UsuarioAutenticado, sucursalId: number): void {
    const propia = this.permisos.restringeSucursal(usuario)
    if (propia !== null && propia !== sucursalId) {
      throw ExcepcionNegocio.sinPermiso('Ese pedido no es de tu sucursal')
    }
  }
}
