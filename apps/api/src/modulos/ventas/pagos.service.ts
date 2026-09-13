import { Injectable } from '@nestjs/common'
import type { DatosRegistrarPago, DatosResolverPago, Pago } from '@aurora/contratos'
import { PERMISOS } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import { PermisosService } from '../../nucleo/autenticacion/permisos.service'
import { PreciosService } from '../catalogo/precios.service'
import { CajaService } from '../caja/caja.service'
import { PedidosService } from './pedidos.service'
import { aNumero } from '../../nucleo/util/decimal'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'

/**
 * Pagos de un pedido.
 *
 * Un pedido admite varios pagos: es normal cobrar una parte en efectivo y otra
 * con tarjeta, o dejar una senia. El pedido pasa a `pagado` cuando la suma de
 * los pagos CONFIRMADOS cubre el total; los pendientes no cuentan.
 *
 * Que se confirma solo y que espera:
 *
 *   efectivo, tarjeta en POS   los cobra el personal en el mostrador y quedan
 *                              confirmados al registrarlos: el dinero ya esta.
 *   QR, transferencia          exigen comprobante y los revisa alguien con el
 *                              permiso pago.confirmar. No se puede confiar en
 *                              que el cliente diga que pago.
 *   contra entrega             se confirma al entregar.
 */
@Injectable()
export class PagosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pedidos: PedidosService,
    private readonly caja: CajaService,
    private readonly permisos: PermisosService,
    private readonly bitacora: BitacoraService
  ) {}

  async metodos(canal?: 'online' | 'tienda') {
    const filas = await this.prisma.metodo_pago.findMany({
      where: {
        activo: true,
        ...(canal ? { canal: { in: ['todos', canal] } } : {}),
      },
      orderBy: { id: 'asc' },
    })

    return filas.map((m) => ({
      id: m.id,
      codigo: m.codigo,
      nombre: m.nombre,
      tipo: m.tipo,
      requiere_comprobante: m.requiere_comprobante,
      disponible_offline: m.disponible_offline,
      canal: m.canal,
    }))
  }

  // ==========================================================================
  // Registro
  // ==========================================================================

  async registrar(
    pedidoId: bigint,
    datos: DatosRegistrarPago,
    usuario: UsuarioAutenticado,
    claveIdempotencia: string | null,
    ctx: ContextoPeticion
  ): Promise<Pago> {
    if (claveIdempotencia) {
      const yaRegistrado = await this.prisma.pago.findUnique({
        where: { idempotency_key: claveIdempotencia },
        select: { id: true },
      })
      if (yaRegistrado) return this.uno(yaRegistrado.id)
    }

    const pedido = await this.pedidos.detalle(pedidoId, usuario)

    if (['cancelado', 'devuelto'].includes(pedido.estado)) {
      throw ExcepcionNegocio.conflicto(`No se puede cobrar un pedido ${pedido.estado}`)
    }

    const metodo = await this.prisma.metodo_pago.findUnique({
      where: { id: datos.metodo_pago_id },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        tipo: true,
        activo: true,
        canal: true,
        requiere_comprobante: true,
      },
    })
    if (!metodo?.activo) {
      throw ExcepcionNegocio.validacion({ metodo_pago_id: 'Ese metodo de pago no esta disponible' })
    }
    if (metodo.canal !== 'todos' && metodo.canal !== pedido.canal) {
      throw ExcepcionNegocio.validacion({
        metodo_pago_id: `${metodo.nombre} no se puede usar en el canal ${pedido.canal}`,
      })
    }

    // Cobrar de mas obliga despues a un reembolso manual que nadie registra.
    if (datos.monto > pedido.saldo) {
      throw ExcepcionNegocio.validacion({
        monto: `El saldo del pedido es ${pedido.saldo} y se intenta cobrar ${datos.monto}`,
      })
    }

    if (metodo.requiere_comprobante && !datos.comprobante_url && !datos.referencia_externa) {
      throw ExcepcionNegocio.validacion({
        comprobante_url: `${metodo.nombre} necesita el comprobante o la referencia de la operacion`,
      })
    }

    // Confirmacion automatica solo cuando el dinero ya esta en la caja y lo
    // registra alguien autorizado a confirmar.
    const puedeConfirmar = this.permisos.puede(usuario.permisos, PERMISOS.PAGO_CONFIRMAR)
    const seConfirmaSolo = puedeConfirmar && !metodo.requiere_comprobante && metodo.tipo !== 'contra_entrega'

    const pagoId = await this.prisma.$transaction(async (tx) => {
      const pago = await tx.pago.create({
        data: {
          pedido_id: pedidoId,
          metodo_pago_id: metodo.id,
          monto: datos.monto,
          estado: seConfirmaSolo ? 'confirmado' : 'pendiente',
          referencia_externa: datos.referencia_externa ?? null,
          comprobante_url: datos.comprobante_url ?? null,
          usuario_confirma_id: seConfirmaSolo ? usuario.id : null,
          confirmado_en: seConfirmaSolo ? new Date() : null,
          idempotency_key: claveIdempotencia,
        },
        select: { id: true },
      })

      if (seConfirmaSolo) {
        await this.aCaja(tx, {
          tipo: metodo.tipo,
          canal: pedido.canal,
          sucursalId: pedido.sucursal_id,
          usuarioId: usuario.id,
          monto: datos.monto,
          numeroPedido: pedido.numero,
          pagoId: pago.id,
        })
        await this.actualizarEstadoDelPedido(tx, pedidoId, usuario.id)
      }

      return pago.id
    })

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'pago',
      entidad: 'pago',
      entidadId: pagoId.toString(),
      descripcion: `Pago de ${datos.monto} BOB con ${metodo.nombre} en el pedido ${pedido.numero}`,
      datosNuevos: { monto: datos.monto, metodo: metodo.codigo, confirmado: seConfirmaSolo },
    })

    return this.uno(pagoId)
  }

  // ==========================================================================
  // Confirmacion o rechazo
  // ==========================================================================

  async resolver(
    pagoId: bigint,
    datos: DatosResolverPago,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Pago> {
    const pago = await this.prisma.pago.findUnique({
      where: { id: pagoId },
      include: {
        // tipo y canal hacen falta para decidir si el cobro entra a la caja.
        metodo_pago: { select: { nombre: true, tipo: true } },
        pedido: { select: { id: true, numero: true, sucursal_id: true, canal: true } },
      },
    })
    if (!pago) throw ExcepcionNegocio.noEncontrado('Ese pago no existe')

    const propia = this.permisos.restringeSucursal(usuario)
    if (propia !== null && propia !== pago.pedido.sucursal_id) {
      throw ExcepcionNegocio.sinPermiso('Ese pago no es de tu sucursal')
    }

    if (pago.estado !== 'pendiente') {
      throw ExcepcionNegocio.conflicto(`Ese pago ya esta ${pago.estado}`)
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.pago.update({
        where: { id: pagoId },
        data: {
          estado: datos.aprobado ? 'confirmado' : 'rechazado',
          usuario_confirma_id: usuario.id,
          confirmado_en: new Date(),
        },
      })

      if (datos.aprobado) {
        await this.aCaja(tx, {
          tipo: pago.metodo_pago.tipo,
          canal: pago.pedido.canal,
          sucursalId: pago.pedido.sucursal_id,
          usuarioId: usuario.id,
          monto: aNumero(pago.monto),
          numeroPedido: pago.pedido.numero,
          pagoId: pago.id,
        })
        await this.actualizarEstadoDelPedido(tx, pago.pedido_id, usuario.id)
      }
    })

    await this.bitacora.registrar(ctx, {
      accion: datos.aprobado ? 'confirmar' : 'rechazar',
      modulo: 'pago',
      entidad: 'pago',
      entidadId: pagoId.toString(),
      descripcion: `Pago de ${aNumero(pago.monto)} BOB en el pedido ${pago.pedido.numero}: ${
        datos.aprobado ? 'confirmado' : `rechazado (${datos.motivo ?? 'sin motivo'})`
      }`,
    })

    return this.uno(pagoId)
  }

  // ==========================================================================
  // Consulta
  // ==========================================================================

  async delPedido(pedidoId: bigint, usuario: UsuarioAutenticado): Promise<Pago[]> {
    await this.pedidos.detalle(pedidoId, usuario) // reusa el control de acceso

    const filas = await this.prisma.pago.findMany({
      where: { pedido_id: pedidoId },
      orderBy: { id: 'asc' },
      include: {
        metodo_pago: { select: { nombre: true, codigo: true } },
        usuario: { select: { nombre: true, apellido: true } },
      },
    })

    return filas.map((p) => this.formatear(p))
  }

  async pendientes(usuario: UsuarioAutenticado) {
    const propia = this.permisos.restringeSucursal(usuario)

    const filas = await this.prisma.pago.findMany({
      where: {
        estado: 'pendiente',
        ...(propia !== null ? { pedido: { sucursal_id: propia } } : {}),
      },
      orderBy: { id: 'asc' },
      include: {
        metodo_pago: { select: { nombre: true, codigo: true } },
        usuario: { select: { nombre: true, apellido: true } },
        pedido: { select: { numero: true } },
      },
    })

    return filas.map((p) => ({ ...this.formatear(p), pedido_numero: p.pedido.numero }))
  }

  private async uno(pagoId: bigint): Promise<Pago> {
    const p = await this.prisma.pago.findUniqueOrThrow({
      where: { id: pagoId },
      include: {
        metodo_pago: { select: { nombre: true, codigo: true } },
        usuario: { select: { nombre: true, apellido: true } },
      },
    })
    return this.formatear(p)
  }

  private formatear(p: {
    id: bigint
    pedido_id: bigint
    monto: unknown
    estado: string
    referencia_externa: string | null
    comprobante_url: string | null
    creado_en: Date
    confirmado_en: Date | null
    metodo_pago: { nombre: string; codigo: string }
    usuario: { nombre: string; apellido: string } | null
  }): Pago {
    return {
      id: p.id.toString(),
      pedido_id: p.pedido_id.toString(),
      metodo: p.metodo_pago.nombre,
      metodo_codigo: p.metodo_pago.codigo,
      monto: aNumero(p.monto as never),
      estado: p.estado as Pago['estado'],
      referencia_externa: p.referencia_externa,
      comprobante_url: p.comprobante_url,
      confirmado_por: p.usuario ? `${p.usuario.nombre} ${p.usuario.apellido}` : null,
      creado_en: p.creado_en.toISOString(),
      confirmado_en: p.confirmado_en?.toISOString() ?? null,
    }
  }

  /**
   * Un cobro en efectivo de mostrador entra a la caja abierta de quien lo
   * cobro.
   *
   * Solo el efectivo: una tarjeta o una transferencia no ponen billetes en el
   * cajon, asi que sumarlas al arqueo daria siempre un faltante. Si no hay caja
   * abierta el pago vale igual y queda anotado en la bitacora: una venta no se
   * puede caer porque alguien olvido abrir su turno.
   */
  private async aCaja(
    tx: Parameters<PedidosService['marcarPagado']>[0],
    d: {
      tipo: string
      canal: string
      sucursalId: number
      usuarioId: number
      monto: number
      numeroPedido: string
      pagoId: bigint
    }
  ): Promise<void> {
    if (d.tipo !== 'efectivo' || d.canal !== 'tienda') return

    await this.caja.registrarCobro(tx, {
      sucursalId: d.sucursalId,
      usuarioId: d.usuarioId,
      monto: d.monto,
      concepto: `Cobro en efectivo del pedido ${d.numeroPedido}`,
      pagoId: d.pagoId,
    })
  }

  /**
   * Si los pagos confirmados cubren el total, el pedido pasa a `pagado`.
   *
   * Se recalcula sumando de la base en lugar de llevar un acumulado en el
   * pedido: un contador que se actualiza por separado termina desfasado en
   * cuanto un pago se rechaza o se reembolsa.
   */
  private async actualizarEstadoDelPedido(
    tx: Parameters<PedidosService['marcarPagado']>[0],
    pedidoId: bigint,
    usuarioId: number
  ): Promise<void> {
    const pedido = await tx.pedido.findUnique({
      where: { id: pedidoId },
      select: { total: true },
    })
    if (!pedido) return

    const confirmados = await tx.pago.aggregate({
      where: { pedido_id: pedidoId, estado: 'confirmado' },
      _sum: { monto: true },
    })

    const pagado = aNumero(confirmados._sum.monto as never)
    if (pagado >= aNumero(pedido.total as never)) {
      await this.pedidos.marcarPagado(tx, pedidoId, usuarioId)
    }
  }
}
