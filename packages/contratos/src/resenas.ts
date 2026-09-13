/**
 * Contrato de resenias.
 *
 * Solo puede opinar quien compro la prenda y la recibio. No es una politica de
 * moderacion: es lo unico que hace que una calificacion signifique algo. Un
 * catalogo donde cualquiera puede poner cinco estrellas no informa nada, y uno
 * donde cualquiera puede poner una es una herramienta de sabotaje.
 */
import { z } from 'zod'
import { aEntero, idSchema, paginacionSchema } from './comun'

/**
 * Como le quedo de verdad.
 *
 * Cierra el circulo con el probador: la talla que se recomendo y la que resulto
 * ser. Con eso se puede medir si la guia de tallas de una categoria esta bien
 * calibrada, que es una pregunta que hoy nadie puede responder.
 */
export const AJUSTES_REALES = ['pequena', 'justa', 'grande'] as const
export type AjusteReal = (typeof AJUSTES_REALES)[number]

export const NOMBRE_AJUSTE_REAL: Record<AjusteReal, string> = {
  pequena: 'Me quedó chica',
  justa: 'Me quedó bien',
  grande: 'Me quedó grande',
}

export const escribirResenaSchema = z.object({
  producto_id: idSchema,
  pedido_id: z.string().regex(/^\d+$/, 'Identificador de pedido invalido'),
  calificacion: aEntero
    .min(1, 'La calificacion va de 1 a 5')
    .max(5, 'La calificacion va de 1 a 5'),
  comentario: z.string().trim().max(500, 'El comentario no puede pasar de 500 caracteres').optional(),
  talla_comprada_id: idSchema.optional(),
  ajuste_real: z.enum(AJUSTES_REALES).optional(),
})

export type DatosEscribirResena = z.infer<typeof escribirResenaSchema>

export const consultaResenasSchema = paginacionSchema.extend({
  producto_id: idSchema.optional(),
  /** Solo para moderacion: las que esperan aprobacion. */
  pendientes: z.coerce.boolean().optional(),
})

export type DatosConsultaResenas = z.infer<typeof consultaResenasSchema>

export const moderarResenaSchema = z.object({
  aprobada: z.boolean(),
})

export type DatosModerarResena = z.infer<typeof moderarResenaSchema>

export interface Resena {
  id: string
  producto_id: number
  producto: string
  /** Solo el nombre de pila: nadie pidio publicar su apellido al comprar. */
  autora: string
  calificacion: number
  comentario: string | null
  talla_comprada: string | null
  ajuste_real: AjusteReal | null
  aprobado: boolean
  creado_en: string
}

/** Lo que se muestra arriba de la lista en la ficha. */
export interface ResumenResenas {
  promedio: number
  total: number
  /** Cuantas de cada calificacion, de 1 a 5. */
  reparto: Record<string, number>
  /** Que dice la gente sobre el talle, que es lo que mas se pregunta. */
  ajuste: Record<AjusteReal, number>
}

/**
 * Una compra sobre la que todavia se puede opinar.
 *
 * La tienda las ofrece en el detalle del pedido. Se calculan en el servidor
 * porque la regla —entregado, comprado por vos, sin resenia previa— es la misma
 * que valida el alta, y tenerla escrita dos veces garantiza que en algun momento
 * dejen de coincidir.
 */
export interface CompraResenable {
  pedido_id: string
  pedido_numero: string
  producto_id: number
  producto: string
  slug: string
  talla_comprada_id: number | null
  talla_comprada: string | null
  entregado_en: string | null
}
