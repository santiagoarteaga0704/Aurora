import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type {
  DatosConsultaSync,
  DatosLoteSync,
  DatosOperacionSync,
  EntidadSync,
  EstadoSync,
  OperacionRegistrada,
  RespuestaLoteSync,
  ResultadoOperacionSync,
} from '@aurora/contratos'
import { crearPedidoSchema, registrarPagoSchema, salto } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import { PermisosService } from '../../nucleo/autenticacion/permisos.service'
import { PedidosService } from '../ventas/pedidos.service'
import { PagosService } from '../ventas/pagos.service'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'

@Injectable()
export class SyncService {
  private readonly log = new Logger('Sync')

  constructor(
    private readonly prisma: PrismaService,
    private readonly pedidos: PedidosService,
    private readonly pagos: PagosService,
    private readonly permisos: PermisosService,
    private readonly bitacora: BitacoraService
  ) {}

  /**
   * Aplica un lote de operaciones hechas sin conexion.
   *
   * **En orden y de a una.** En paralelo seria mas rapido y estaria mal: dos
   * ventas del mismo articulo se pasarian el stock por delante y el conflicto
   * caeria en la que el azar decida, no en la segunda. Quien vendio primero
   * tiene que quedarse con la prenda.
   *
   * **Un conflicto no corta el lote.** Si la tercera venta de doce no tiene
   * stock, las otras once se aplican igual. Cortar ahi dejaria nueve ventas
   * buenas sin registrar por culpa de una mala, y la vendedora tendria que
   * adivinar cuales entraron.
   */
  async lote(
    datos: DatosLoteSync,
    usuario: UsuarioAutenticado,
    dispositivoUuid: string | null,
    ctx: ContextoPeticion
  ): Promise<RespuestaLoteSync> {
    const dispositivoId = await this.resolverDispositivo(dispositivoUuid, usuario, ctx)

    const resultados: ResultadoOperacionSync[] = []
    let aplicadas = 0
    let conflictos = 0

    for (const op of datos.operaciones) {
      const resultado = await this.aplicarUna(op, usuario, dispositivoId, ctx)
      resultados.push(resultado)

      if (resultado.estado === 'aplicado') aplicadas++
      else conflictos++
    }

    await this.prisma.dispositivo
      .update({ where: { id: dispositivoId }, data: { ultima_sync: new Date() } })
      .catch(() => null)

    await this.bitacora.registrar(ctx, {
      accion: 'sincronizar',
      modulo: 'sync',
      entidad: 'sync_operacion',
      descripcion: `Lote de ${datos.operaciones.length} operaciones: ${aplicadas} aplicadas, ${conflictos} sin aplicar`,
    })

    return { aplicadas, conflictos, resultados }
  }

  /**
   * Aplica una operacion y deja constancia.
   *
   * El registro en `sync_operacion` se escribe pase lo que pase, tambien cuando
   * la operacion se rechaza. Es el punto entero de este endpoint: antes, una
   * venta rechazada por falta de stock dejaba su motivo unicamente en el
   * navegador de esa vendedora, y si esa persona limpiaba el almacenamiento la
   * venta desaparecia sin que quedara rastro de que existio.
   */
  private async aplicarUna(
    op: DatosOperacionSync,
    usuario: UsuarioAutenticado,
    dispositivoId: number,
    ctx: ContextoPeticion
  ): Promise<ResultadoOperacionSync> {
    // Una clave repetida es un reenvio, no una operacion nueva: se devuelve lo
    // que ya se le respondio. Sin esto, una respuesta perdida haria que el
    // cliente reintente y el servidor conteste distinto la segunda vez.
    const previa = await this.prisma.sync_operacion.findUnique({
      where: { idempotency_key: op.idempotency_key },
      select: { estado: true, resultado: true, error: true },
    })

    if (previa && previa.estado !== 'pendiente') {
      return {
        idempotency_key: op.idempotency_key,
        estado: previa.estado as EstadoSync,
        resultado: (previa.resultado as Record<string, unknown> | null) ?? null,
        error: previa.error,
        repetida: true,
      }
    }

    const registro = previa
      ? null
      : await this.prisma.sync_operacion.create({
          data: {
            dispositivo_id: dispositivoId,
            usuario_id: usuario.id,
            idempotency_key: op.idempotency_key,
            entidad: op.entidad,
            operacion: op.operacion,
            payload: op.payload as Prisma.InputJsonValue,
            estado: 'pendiente',
            creado_en_cliente: new Date(op.creado_en_cliente),
          },
          select: { id: true },
        })

    const id = registro?.id ?? null

    try {
      const resultado = await this.ejecutar(op, usuario, ctx)

      await this.cerrar(id, op.idempotency_key, 'aplicado', resultado, null)

      return {
        idempotency_key: op.idempotency_key,
        estado: 'aplicado',
        resultado,
        error: null,
        repetida: false,
      }
    } catch (e) {
      /**
       * Conflicto o rechazo, que no es lo mismo.
       *
       *   conflicto  el mundo cambio mientras no habia conexion: ya no hay
       *              stock, el precio es otro. Reintentar no lo arregla, pero
       *              una persona puede decidir que hacer.
       *   rechazado  la operacion esta mal formada o no corresponde. No hay
       *              nada que decidir.
       *
       * La distincion importa porque la pantalla del mostrador ofrece rehacer
       * la venta solo en el primer caso.
       */
      const estado: EstadoSync = this.esConflicto(e) ? 'conflicto' : 'rechazado'
      const error = this.mensajeDe(e)

      await this.cerrar(id, op.idempotency_key, estado, null, error)

      if (estado === 'rechazado') {
        this.log.warn(`Operacion ${op.idempotency_key} rechazada: ${error}`)
      }

      return {
        idempotency_key: op.idempotency_key,
        estado,
        resultado: null,
        error,
        repetida: false,
      }
    }
  }

  /**
   * Ejecuta la operacion contra el servicio de negocio que corresponde.
   *
   * El payload se valida con el MISMO esquema que usa el endpoint normal. Es lo
   * que garantiza que sincronizar no sea una puerta de atras: una venta que
   * llega por aqui pasa exactamente por donde pasaria una venta de mostrador,
   * con los mismos controles de permiso, precio y stock.
   */
  private async ejecutar(
    op: DatosOperacionSync,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Record<string, unknown>> {
    if (op.entidad === 'pedido') {
      if (op.operacion !== 'crear') {
        throw ExcepcionNegocio.validacion({
          operacion: 'Sobre un pedido solo se sincroniza el alta',
        })
      }

      const datos = crearPedidoSchema.parse(op.payload)
      const pedido = await this.pedidos.crear(datos, usuario, null, op.idempotency_key, ctx)

      return { pedido_id: pedido.id, numero: pedido.numero, total: pedido.total }
    }

    if (op.entidad === 'pago') {
      if (op.operacion !== 'crear') {
        throw ExcepcionNegocio.validacion({
          operacion: 'Sobre un pago solo se sincroniza el alta',
        })
      }

      const pedidoId = op.payload.pedido_id
      if (typeof pedidoId !== 'string' && typeof pedidoId !== 'number') {
        throw ExcepcionNegocio.validacion({ pedido_id: 'Falta el pedido al que pertenece el pago' })
      }

      const datos = registrarPagoSchema.parse(op.payload)
      const pago = await this.pagos.registrar(
        BigInt(pedidoId),
        datos,
        usuario,
        op.idempotency_key,
        ctx
      )

      return { pago_id: pago.id, estado: pago.estado, monto: pago.monto }
    }

    throw ExcepcionNegocio.validacion({ entidad: `No se sabe sincronizar "${op.entidad}"` })
  }

  /**
   * Conflicto o rechazo.
   *
   * Solo el 409 es conflicto: es el mundo diciendo que la operacion llego
   * tarde —no alcanza el stock, el pedido ya se cancelo, el monto supera el
   * saldo—. Ahi hay algo que una persona puede decidir.
   *
   * El 422 NO cuenta, aunque sea igual de "de negocio": significa que los datos
   * estan mal. Una venta sin articulos no se arregla rehaciendola, y ofrecer
   * rehacerla en el mostrador manda a alguien a perder el tiempo. Un 500
   * tampoco: eso es un problema del servidor, no de la venta.
   */
  private esConflicto(e: unknown): boolean {
    return e instanceof ExcepcionNegocio && e.getStatus() === 409
  }

  /**
   * El texto que se guarda y se muestra.
   *
   * Se toma de `ExcepcionNegocio.mensaje` y no de `Error.message`: en una
   * excepcion con detalle por campo, Nest deja en `message` el nombre de la
   * clase, y el registro terminaba diciendo "Excepcion Negocio" —que es
   * exactamente lo que despues lee quien intenta entender que venta se perdio—.
   */
  private mensajeDe(e: unknown): string {
    if (e instanceof ExcepcionNegocio) return e.mensaje
    if (e instanceof Error) return e.message
    return 'No se pudo aplicar'
  }

  private async cerrar(
    id: bigint | null,
    clave: string,
    estado: EstadoSync,
    resultado: Record<string, unknown> | null,
    error: string | null
  ): Promise<void> {
    const data = {
      estado,
      resultado: resultado === null ? Prisma.DbNull : (resultado as Prisma.InputJsonValue),
      error: error?.slice(0, 255) ?? null,
      procesado_en: new Date(),
    }

    // Por id cuando se acaba de crear; por clave cuando se retoma una que habia
    // quedado en pendiente de un envio cortado a la mitad.
    if (id !== null) await this.prisma.sync_operacion.update({ where: { id }, data })
    else await this.prisma.sync_operacion.update({ where: { idempotency_key: clave }, data })
  }

  private async resolverDispositivo(
    uuid: string | null,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<number> {
    if (!uuid) {
      throw ExcepcionNegocio.validacion(
        { dispositivo: 'Falta la cabecera X-Dispositivo' },
        'Para sincronizar hace falta identificar el equipo'
      )
    }

    const existente = await this.prisma.dispositivo.findUnique({
      where: { uuid },
      select: { id: true },
    })
    if (existente) return existente.id

    const agente = (ctx.userAgent ?? '').toLowerCase()
    const plataforma = agente.includes('android')
      ? 'android'
      : agente.includes('iphone') || agente.includes('ipad')
        ? 'ios'
        : 'web'

    const creado = await this.prisma.dispositivo.create({
      data: {
        usuario_id: usuario.id,
        uuid,
        plataforma,
        modelo: ctx.userAgent?.slice(0, 80) ?? null,
      },
      select: { id: true },
    })

    return creado.id
  }

  // ==========================================================================
  // Consulta
  // ==========================================================================

  /**
   * Las operaciones sincronizadas, para poder revisarlas.
   *
   * Quien solo ve su sucursal solo ve las de los equipos de su sucursal. El
   * filtro no es por el registro —`sync_operacion` no tiene sucursal— sino por
   * el usuario que las mando, que si la tiene.
   */
  async listar(filtros: DatosConsultaSync, usuario: UsuarioAutenticado) {
    const propia = this.permisos.restringeSucursal(usuario)

    const where: Prisma.sync_operacionWhereInput = {
      ...(filtros.estado ? { estado: filtros.estado } : {}),
      ...(propia !== null
        ? { usuario: { sucursal_id: propia } }
        : filtros.sucursal_id
          ? { usuario: { sucursal_id: filtros.sucursal_id } }
          : {}),
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.sync_operacion.count({ where }),
      this.prisma.sync_operacion.findMany({
        where,
        orderBy: { recibido_en: 'desc' },
        skip: salto(filtros),
        take: filtros.por_pagina,
        include: {
          dispositivo: { select: { uuid: true, plataforma: true } },
          usuario: { select: { nombre: true, apellido: true } },
        },
      }),
    ])

    return {
      total,
      items: filas.map(
        (f): OperacionRegistrada => ({
          id: f.id.toString(),
          idempotency_key: f.idempotency_key,
          entidad: f.entidad as EntidadSync,
          operacion: f.operacion,
          estado: f.estado as EstadoSync,
          error: f.error,
          resultado: (f.resultado as Record<string, unknown> | null) ?? null,
          resumen: this.resumir(f.entidad, f.payload),
          dispositivo: f.dispositivo?.uuid.slice(0, 8) ?? null,
          usuario: f.usuario ? `${f.usuario.nombre} ${f.usuario.apellido}` : null,
          creado_en_cliente: f.creado_en_cliente.toISOString(),
          recibido_en: f.recibido_en.toISOString(),
          procesado_en: f.procesado_en?.toISOString() ?? null,
        })
      ),
    }
  }

  /**
   * Un resumen legible de lo que la operacion intentaba hacer.
   *
   * El payload crudo tiene ids de variante y de metodo de pago, que no le dicen
   * nada a quien esta en el mostrador tratando de entender que venta se perdio.
   */
  private resumir(entidad: string, payload: unknown): string {
    const p = payload as Record<string, unknown> | null
    if (!p) return entidad

    if (entidad === 'pedido') {
      const items = Array.isArray(p.items) ? p.items : []
      const unidades = items.reduce(
        (n: number, i: unknown) => n + Number((i as { cantidad?: number })?.cantidad ?? 0),
        0
      )
      const pago = p.pago as { monto?: number } | undefined
      const monto = pago?.monto
      return `Venta de ${unidades} articulo${unidades === 1 ? '' : 's'}${
        monto ? ` por ${monto} BOB` : ''
      }`
    }

    if (entidad === 'pago') {
      return `Pago de ${p.monto ?? '?'} BOB del pedido ${p.pedido_id ?? '?'}`
    }

    return entidad
  }

  /** Cuantas quedaron sin aplicar, que es lo que mira la pantalla del mostrador. */
  async pendientesDeRevisar(usuario: UsuarioAutenticado): Promise<{ conflictos: number }> {
    const propia = this.permisos.restringeSucursal(usuario)

    const conflictos = await this.prisma.sync_operacion.count({
      where: {
        estado: { in: ['conflicto', 'rechazado'] },
        ...(propia !== null ? { usuario: { sucursal_id: propia } } : {}),
      },
    })

    return { conflictos }
  }
}
