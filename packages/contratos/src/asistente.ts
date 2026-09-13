/**
 * Contrato del asistente conversacional.
 *
 * El enunciado pide dos cosas de este modulo: un chat donde la clienta pregunta
 * por la ropa, y **reportes bajo demanda por chat y voz** para el personal.
 *
 * La decision que lo sostiene: el asistente NO depende de que haya una clave de
 * IA configurada. Se resuelve en dos capas —un interprete determinista que
 * siempre corre, y un modelo de lenguaje que lo mejora si hay clave—. Si el
 * demo dependiera de una clave y ese dia no hay saldo, no habria asistente.
 *
 * En ninguna de las dos capas el modelo escribe SQL: devuelve el codigo de una
 * plantilla y sus parametros, y el motor de reportes hace el resto.
 */
import { z } from 'zod'
import { idSchema, paginacionSchema } from './comun'

export const CANALES_CONVERSACION = ['web', 'movil', 'pos'] as const
export type CanalConversacion = (typeof CANALES_CONVERSACION)[number]

export const TIPOS_CONVERSACION = ['asistente_compra', 'reporte', 'soporte'] as const
export type TipoConversacion = (typeof TIPOS_CONVERSACION)[number]

export const ROLES_MENSAJE = ['usuario', 'asistente', 'sistema', 'herramienta'] as const
export type RolMensaje = (typeof ROLES_MENSAJE)[number]

export const preguntarSchema = z.object({
  texto: z.string().trim().min(2, 'Escribi tu pregunta').max(500),
  /** Se omite en el primer mensaje; la respuesta devuelve el id a usar despues. */
  conversacion_id: z.string().regex(/^\d+$/).optional(),
  canal: z.enum(CANALES_CONVERSACION).default('web'),
  /** Marca si la pregunta se dicto por voz, para el registro. */
  entrada: z.enum(['texto', 'voz']).default('texto'),
})

export type DatosPreguntar = z.infer<typeof preguntarSchema>

export const consultaConversacionesSchema = paginacionSchema.extend({
  tipo: z.enum(TIPOS_CONVERSACION).optional(),
})

export type DatosConsultaConversaciones = z.infer<typeof consultaConversacionesSchema>

/** Como entendio el asistente la pregunta. */
export interface Interpretacion {
  /** Codigo de plantilla de reporte, o null si no se reconocio ninguna. */
  codigo: string | null
  parametros: Record<string, unknown>
  /** 0 a 1. Por debajo de 0.5 se consulta al modelo, si hay. */
  confianza: number
  /** Que se reconocio y que no, en palabras. Se muestra al usuario. */
  motivo: string
  /** Que capa resolvio: el interprete propio o el modelo de lenguaje. */
  resuelto_por: 'interprete' | 'modelo' | 'ninguno'
}

export interface MensajeChat {
  id: string
  rol: RolMensaje
  contenido: string | null
  herramienta: string | null
  payload: Record<string, unknown> | null
  creado_en: string
}

export interface RespuestaAsistente {
  conversacion_id: string
  /** Lo que el asistente responde en palabras. */
  respuesta: string
  interpretacion: Interpretacion
  /**
   * El reporte ya ejecutado, cuando la pregunta pedia uno. Es el mismo
   * ResultadoReporte del modulo de reportes, para que el front lo dibuje con el
   * componente que ya tiene.
   */
  reporte: unknown | null
  /** Sugerencias para cuando no se entendio la pregunta. */
  sugerencias: string[]
}

export interface ResumenConversacion {
  id: string
  titulo: string | null
  tipo: TipoConversacion
  canal: CanalConversacion
  mensajes: number
  creado_en: string
  actualizado_en: string
}

/**
 * Sinonimos por plantilla, en el español que usa la gente de una tienda.
 *
 * Vive en el contrato y no dentro del interprete porque el front los usa para
 * proponer ejemplos de pregunta, y porque asi se lee de un vistazo que entiende
 * el asistente sin abrir el codigo.
 */
export const SINONIMOS_REPORTE: Record<string, string[]> = {
  ventas_por_rango: [
    'cuanto vendimos',
    'cuanto se vendio',
    'ventas',
    'total vendido',
    'facturacion',
    'ingresos',
    'venta del dia',
  ],
  ventas_por_sucursal: [
    'que sucursal vendio mas',
    'ranking de sucursales',
    'comparar sucursales',
    'ventas por sucursal',
    'mejor tienda',
    'mejor local',
  ],
  productos_mas_vendidos: [
    'que se vendio mas',
    'productos mas vendidos',
    'lo mas vendido',
    'prendas mas vendidas',
    'top de productos',
    'que prenda sale mas',
  ],
  stock_bajo: [
    'que falta',
    'stock bajo',
    'productos por reponer',
    'que hay que reponer',
    'poco stock',
    'se esta acabando',
    'bajo minimo',
  ],
  ventas_por_hora: [
    'a que hora vendemos mas',
    'ventas por hora',
    'horario de mas ventas',
    'hora pico',
    'cuando hay mas gente',
  ],
  desempeno_vendedores: [
    'que vendedora vendio mas',
    'desempenio de vendedores',
    'ranking de vendedoras',
    'ventas por vendedor',
    'quien vendio mas',
  ],
  efectividad_probador: [
    'efectividad del probador',
    'probador virtual',
    'cuantas pruebas terminaron en compra',
    'conversion del probador',
  ],
  devoluciones_por_motivo: [
    'devoluciones',
    'por que devuelven',
    'motivos de devolucion',
    'cuanto se devolvio',
  ],
}

/** Ejemplos que el front muestra como botones cuando el chat esta vacio. */
export const PREGUNTAS_EJEMPLO = [
  '¿Cuánto vendimos ayer?',
  '¿Qué productos se vendieron más este mes?',
  '¿Qué hay que reponer?',
  '¿Qué sucursal vendió más la semana pasada?',
  '¿A qué hora vendemos más?',
] as const
