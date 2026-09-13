/**
 * Contrato de caja.
 *
 * Una caja es un turno de cobro: se abre con un monto inicial, va acumulando
 * ingresos y egresos, y se cierra con un arqueo. El cierre compara lo que el
 * sistema esperaba con lo que la cajera conto de verdad, y guarda la diferencia
 * en lugar de esconderla: una caja que siempre cuadra al centavo es una caja que
 * nadie esta controlando.
 */
import { z } from 'zod'
import { idSchema, paginacionSchema } from './comun'

export const ESTADOS_CAJA = ['abierta', 'cerrada'] as const
export type EstadoCaja = (typeof ESTADOS_CAJA)[number]

export const TIPOS_MOVIMIENTO_CAJA = ['ingreso', 'egreso'] as const
export type TipoMovimientoCaja = (typeof TIPOS_MOVIMIENTO_CAJA)[number]

const monto = z.coerce.number().nonnegative().max(9_999_999.99)

export const abrirCajaSchema = z.object({
  sucursal_id: idSchema,
  monto_apertura: monto.default(0),
})

export type DatosAbrirCaja = z.infer<typeof abrirCajaSchema>

export const movimientoCajaSchema = z.object({
  tipo: z.enum(TIPOS_MOVIMIENTO_CAJA),
  monto: monto.refine((m) => m > 0, 'El monto debe ser mayor que cero'),
  concepto: z.string().trim().min(3, 'Explica el concepto del movimiento').max(150),
})

export type DatosMovimientoCaja = z.infer<typeof movimientoCajaSchema>

export const cerrarCajaSchema = z.object({
  /** Lo que la cajera conto fisicamente al cerrar el turno. */
  monto_contado: monto,
  observacion: z.string().trim().max(150).optional(),
})

export type DatosCerrarCaja = z.infer<typeof cerrarCajaSchema>

export const consultaCajasSchema = paginacionSchema.extend({
  sucursal_id: idSchema.optional(),
  estado: z.enum(ESTADOS_CAJA).optional(),
  usuario_id: idSchema.optional(),
})

export type DatosConsultaCajas = z.infer<typeof consultaCajasSchema>

export interface Caja {
  id: string
  sucursal: string
  sucursal_id: number
  usuario: string
  estado: EstadoCaja
  monto_apertura: number
  ingresos: number
  egresos: number
  /** Lo que deberia haber en el cajon segun el sistema. */
  monto_esperado: number
  monto_cierre: number | null
  /** contado - esperado. Negativo es faltante. */
  diferencia: number | null
  abierta_en: string
  cerrada_en: string | null
  movimientos: {
    id: string
    tipo: TipoMovimientoCaja
    monto: number
    concepto: string
    pago_id: string | null
    creado_en: string
  }[]
}
