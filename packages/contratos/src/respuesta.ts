/**
 * Forma unica de respuesta de la API.
 *
 * Viene del diseno original: el PWA y la app movil parsean todas las respuestas
 * con un solo modelo, en lugar de una forma distinta por endpoint. Se mantiene
 * tal cual al cambiar de stack para no tocar los clientes.
 */

export interface RespuestaOk<T> {
  ok: true
  mensaje?: string
  datos: T
}

export interface MetaPagina {
  total: number
  pagina: number
  por_pagina: number
  paginas: number
}

export interface RespuestaPagina<T> {
  ok: true
  datos: T[]
  meta: MetaPagina
}

export interface RespuestaError {
  ok: false
  mensaje: string
  /** Errores por campo. La clave es el nombre del campo del formulario. */
  errores?: Record<string, string>
}

export type Respuesta<T> = RespuestaOk<T> | RespuestaPagina<T> | RespuestaError

/** Parametros de paginacion que acepta cualquier listado de la API. */
export interface Paginacion {
  pagina: number
  por_pagina: number
}

export const PAGINACION_POR_DEFECTO: Paginacion = { pagina: 1, por_pagina: 20 }
export const POR_PAGINA_MAXIMO = 100
