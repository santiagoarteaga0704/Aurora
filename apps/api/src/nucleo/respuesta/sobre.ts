import type { MetaPagina, Paginacion } from '@aurora/contratos'

/**
 * Marca interna para que el interceptor sepa que el controlador ya decidio la
 * forma de la respuesta (mensaje propio o pagina), en lugar de envolver el
 * valor crudo.
 */
export const MARCA_SOBRE = Symbol('sobre')

export interface Sobre<T> {
  [MARCA_SOBRE]: true
  datos: T
  mensaje?: string
  meta?: MetaPagina
  estado?: number
}

export const esSobre = (v: unknown): v is Sobre<unknown> =>
  typeof v === 'object' && v !== null && MARCA_SOBRE in v

/** Devuelve datos con un mensaje para mostrarle al usuario. */
export function conMensaje<T>(datos: T, mensaje: string): Sobre<T> {
  return { [MARCA_SOBRE]: true, datos, mensaje }
}

/** Devuelve un recurso recien creado (201) con su mensaje. */
export function creado<T>(datos: T, mensaje?: string): Sobre<T> {
  return { [MARCA_SOBRE]: true, datos, mensaje, estado: 201 }
}

/** Devuelve una pagina de resultados con su metadata de paginacion. */
export function pagina<T>(items: T[], total: number, p: Paginacion): Sobre<T[]> {
  return {
    [MARCA_SOBRE]: true,
    datos: items,
    meta: {
      total,
      pagina: p.pagina,
      por_pagina: p.por_pagina,
      paginas: p.por_pagina > 0 ? Math.ceil(total / p.por_pagina) : 0,
    },
  }
}
