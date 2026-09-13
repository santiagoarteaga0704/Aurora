/**
 * Piezas que reutilizan todos los modulos: paginacion, identificadores y
 * conversiones desde la cadena que llega en la query string.
 */
import { z } from 'zod'
import { POR_PAGINA_MAXIMO } from './respuesta'

/**
 * Los parametros de la URL llegan siempre como texto. Estos ayudantes los
 * convierten antes de validar, para que el controlador reciba el tipo correcto
 * y no tenga que hacer Number() por todos lados.
 */
export const aEntero = z.coerce.number().int()
export const aBooleano = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1')

export const idSchema = aEntero.positive('El identificador debe ser un entero positivo')

export const paginacionSchema = z.object({
  pagina: aEntero.min(1).default(1),
  por_pagina: aEntero.min(1).max(POR_PAGINA_MAXIMO).default(20),
})

export type DatosPaginacion = z.infer<typeof paginacionSchema>

/** Convierte pagina/por_pagina en el salto que espera la base de datos. */
export const salto = (p: DatosPaginacion): number => (p.pagina - 1) * p.por_pagina
