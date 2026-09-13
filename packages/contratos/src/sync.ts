/**
 * Contrato de sincronizacion por lote.
 *
 * Lo que hace un punto de venta sin conexion: guarda las ventas y las manda
 * todas juntas cuando vuelve la red.
 *
 * Antes la cola posteaba cada operacion a su endpoint normal con clave de
 * idempotencia. Funcionaba, pero no dejaba rastro: si una venta se rechazaba
 * porque el stock ya no alcanzaba, el motivo vivia solo en el navegador de esa
 * vendedora. Nadie mas podia enterarse, y si esa persona limpiaba el
 * almacenamiento del navegador, la venta desaparecia sin que quedara constancia
 * de que existio.
 *
 * Con el lote, cada operacion queda registrada en `sync_operacion` con su
 * resultado y su motivo. Eso es lo que permite que un conflicto se pueda
 * revisar despues, desde otra maquina, por otra persona.
 */
import { z } from 'zod'
import { paginacionSchema } from './comun'

export const ENTIDADES_SYNC = ['pedido', 'pago'] as const
export type EntidadSync = (typeof ENTIDADES_SYNC)[number]

export const OPERACIONES_SYNC = ['crear', 'actualizar', 'eliminar'] as const
export type OperacionSync = (typeof OPERACIONES_SYNC)[number]

export const ESTADOS_SYNC = ['pendiente', 'aplicado', 'conflicto', 'rechazado'] as const
export type EstadoSync = (typeof ESTADOS_SYNC)[number]

/**
 * Una operacion del lote.
 *
 * `idempotency_key` la genera el cliente **al encolar**, no al enviar. Si se
 * generara al enviar, un reintento despues de una respuesta perdida llevaria
 * una clave nueva y la venta se cobraria dos veces, que es exactamente lo que
 * la clave existe para evitar.
 *
 * `creado_en_cliente` es la hora del dispositivo y puede estar mal. No se usa
 * para nada que importe —el servidor pone la suya— pero se guarda: cuando una
 * venta aparece con fecha rara, saber que el reloj del equipo esta desajustado
 * ahorra media hora de buscar el problema en otro lado.
 */
export const operacionSyncSchema = z.object({
  idempotency_key: z.string().trim().min(8).max(36),
  entidad: z.enum(ENTIDADES_SYNC),
  operacion: z.enum(OPERACIONES_SYNC),
  payload: z.record(z.string(), z.unknown()),
  creado_en_cliente: z.string().datetime({ offset: true }),
})

export type DatosOperacionSync = z.infer<typeof operacionSyncSchema>

export const loteSyncSchema = z.object({
  /**
   * Tope de 50 por lote.
   *
   * Un turno entero sin conexion en una tienda son decenas de ventas, no miles.
   * El tope evita que un cliente con la cola corrupta mande diez mil
   * operaciones y tenga al servidor aplicandolas de a una durante minutos.
   */
  operaciones: z.array(operacionSyncSchema).min(1).max(50),
})

export type DatosLoteSync = z.infer<typeof loteSyncSchema>

export interface ResultadoOperacionSync {
  idempotency_key: string
  estado: EstadoSync
  /** Lo que quedo registrado: el numero de pedido, por ejemplo. */
  resultado: Record<string, unknown> | null
  /** En palabras, por que no se pudo aplicar. Se muestra tal cual. */
  error: string | null
  /** Si esta operacion ya se habia aplicado en un envio anterior. */
  repetida: boolean
}

export interface RespuestaLoteSync {
  aplicadas: number
  conflictos: number
  resultados: ResultadoOperacionSync[]
}

export const consultaSyncSchema = paginacionSchema.extend({
  estado: z.enum(ESTADOS_SYNC).optional(),
  sucursal_id: z.coerce.number().int().positive().optional(),
})

export type DatosConsultaSync = z.infer<typeof consultaSyncSchema>

export interface OperacionRegistrada {
  id: string
  idempotency_key: string
  entidad: EntidadSync
  operacion: OperacionSync
  estado: EstadoSync
  error: string | null
  resultado: Record<string, unknown> | null
  /** Un resumen legible de lo que la operacion intentaba hacer. */
  resumen: string
  dispositivo: string | null
  usuario: string | null
  creado_en_cliente: string
  recibido_en: string
  procesado_en: string | null
}
