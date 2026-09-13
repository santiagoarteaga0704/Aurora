/**
 * Contrato de campanias y promociones.
 *
 * Una campania agrupa promociones con una vigencia y un banner ("Liquidacion de
 * invierno"). Una promocion es la regla concreta que baja el precio.
 *
 * El descuento lo calcula SIEMPRE el servidor. El cliente puede mandar un codigo
 * de cupon, nada mas; nunca el monto del descuento.
 */
import { z } from 'zod'
import { aEntero, idSchema, paginacionSchema } from './comun'

export const TIPOS_CAMPANIA = [
  'temporada',
  'liquidacion',
  'lanzamiento',
  'black_friday',
  'cierre',
] as const
export type TipoCampania = (typeof TIPOS_CAMPANIA)[number]

/**
 * Tipos de promocion:
 *
 *   porcentaje    un % sobre lo que alcanza la promocion
 *   monto_fijo    un monto en bolivianos
 *   2x1           por cada dos unidades de un mismo articulo, una sin costo
 *   envio_gratis  descuenta el costo de envio
 */
export const TIPOS_PROMOCION = ['porcentaje', 'monto_fijo', '2x1', 'envio_gratis'] as const
export type TipoPromocion = (typeof TIPOS_PROMOCION)[number]

export const ALCANCES = ['todo', 'categoria', 'producto', 'variante'] as const
export type Alcance = (typeof ALCANCES)[number]

export const CANALES_PROMOCION = ['todos', 'online', 'tienda'] as const
export const MODALIDADES_PROMOCION = ['todas', 'menudeo', 'mayoreo'] as const

const monto = z.coerce.number().nonnegative().max(9_999_999.99)

export const campaniaSchema = z
  .object({
    nombre: z.string().trim().min(3).max(120),
    descripcion: z.string().trim().max(255).optional(),
    tipo: z.enum(TIPOS_CAMPANIA),
    banner_url: z.string().trim().url().max(255).optional(),
    fecha_inicio: z.coerce.date(),
    fecha_fin: z.coerce.date(),
  })
  .refine((c) => c.fecha_fin > c.fecha_inicio, {
    message: 'La fecha de fin tiene que ser posterior a la de inicio',
    path: ['fecha_fin'],
  })

export type DatosCampania = z.infer<typeof campaniaSchema>

export const promocionSchema = z
  .object({
    campania_id: idSchema.optional(),
    nombre: z.string().trim().min(3).max(120),
    tipo: z.enum(TIPOS_PROMOCION),
    valor: monto.default(0),
    /** Si lleva codigo, solo aplica cuando el cliente lo escribe. */
    codigo_cupon: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]+$/, 'El cupon solo admite letras, numeros y guiones')
      .max(30)
      .optional(),
    min_compra: monto.default(0),
    aplica_a: z.enum(ALCANCES).default('todo'),
    aplica_id: idSchema.optional(),
    canal: z.enum(CANALES_PROMOCION).default('todos'),
    modalidad: z.enum(MODALIDADES_PROMOCION).default('todas'),
    usos_max: aEntero.positive().optional(),
    fecha_inicio: z.coerce.date(),
    fecha_fin: z.coerce.date(),
  })
  .refine((p) => p.fecha_fin > p.fecha_inicio, {
    message: 'La fecha de fin tiene que ser posterior a la de inicio',
    path: ['fecha_fin'],
  })
  .refine((p) => p.aplica_a === 'todo' || p.aplica_id !== undefined, {
    message: 'Indica a que categoria, producto o variante se aplica',
    path: ['aplica_id'],
  })
  .refine((p) => p.tipo !== 'porcentaje' || (p.valor > 0 && p.valor <= 100), {
    message: 'Un porcentaje va entre 1 y 100',
    path: ['valor'],
  })
  .refine((p) => p.tipo === 'envio_gratis' || p.tipo === '2x1' || p.valor > 0, {
    message: 'El valor de la promocion tiene que ser mayor que cero',
    path: ['valor'],
  })

export type DatosPromocion = z.infer<typeof promocionSchema>

export const consultaPromocionesSchema = paginacionSchema.extend({
  campania_id: idSchema.optional(),
  tipo: z.enum(TIPOS_PROMOCION).optional(),
  /** Solo las que rigen ahora mismo. */
  vigentes: z.enum(['true', 'false']).optional(),
})

export type DatosConsultaPromociones = z.infer<typeof consultaPromocionesSchema>

export interface Promocion {
  id: number
  campania: string | null
  nombre: string
  tipo: TipoPromocion
  valor: number
  codigo_cupon: string | null
  min_compra: number
  aplica_a: Alcance
  aplica_id: number | null
  canal: string
  modalidad: string
  usos_max: number | null
  usos_actuales: number
  fecha_inicio: string
  fecha_fin: string
  activo: boolean
  vigente: boolean
}

/** Lo que devuelve el calculo de un descuento sobre un carrito o pedido. */
export interface DescuentoAplicado {
  promocion_id: number | null
  nombre: string | null
  descuento: number
  /** Lo que se ahorra en el envio, aparte del descuento sobre la mercaderia. */
  descuento_envio: number
}
