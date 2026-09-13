/**
 * Contrato del probador virtual.
 *
 * Resuelve la pregunta que hace que la gente no compre ropa por internet: "¿qué
 * talla soy?". La respuesta sale de comparar las medidas de la clienta contra
 * `guia_talla`, que esta sembrada por categoria porque una M de pantalon y una M
 * de blusa no se deciden con las mismas medidas.
 */
import { z } from 'zod'
import { aEntero, idSchema } from './comun'

// --- Medidas ----------------------------------------------------------------

export const ORIGENES_MEDIDA = ['manual', 'estimado', 'escaneo_camara'] as const
export type OrigenMedida = (typeof ORIGENES_MEDIDA)[number]

/**
 * Rangos de lo que un cuerpo humano adulto puede medir.
 *
 * No son cotas de estilo: una cintura de 300 cm o una altura de 40 cm entran
 * silenciosamente en la guia de tallas y devuelven una recomendacion con cara
 * de seria. Vale mas rechazar el dato que recomendar sobre un disparate.
 */
const cm = (min: number, max: number, que: string) =>
  z.coerce
    .number()
    .min(min, `${que}: ${min} cm es demasiado poco, revisa el dato`)
    .max(max, `${que}: ${max} cm es demasiado, revisa el dato`)
    .transform((n) => Math.round(n * 10) / 10)

export const medidasSchema = z.object({
  altura_cm: cm(120, 220, 'Altura'),
  peso_kg: z.coerce
    .number()
    .min(30, 'Peso: 30 kg es demasiado poco, revisa el dato')
    .max(250, 'Peso: 250 kg es demasiado, revisa el dato')
    .transform((n) => Math.round(n * 10) / 10),

  // Opcionales a proposito: quien no tiene una cinta metrica a mano deja solo
  // altura y peso, y el servidor estima el resto marcandolo como estimado.
  busto_cm: cm(60, 160, 'Busto').optional(),
  cintura_cm: cm(45, 160, 'Cintura').optional(),
  cadera_cm: cm(60, 170, 'Cadera').optional(),
  entrepierna_cm: cm(50, 110, 'Entrepierna').optional(),
  hombro_cm: cm(25, 70, 'Hombro').optional(),
})

export type DatosMedidas = z.infer<typeof medidasSchema>

export interface MedidasCliente {
  altura_cm: number
  peso_kg: number
  busto_cm: number | null
  cintura_cm: number | null
  cadera_cm: number | null
  entrepierna_cm: number | null
  hombro_cm: number | null
  origen: OrigenMedida
  actualizado_en: string
  /** Las que el servidor completo por su cuenta, para poder avisarlo. */
  estimadas: string[]
}

// --- Recomendacion ----------------------------------------------------------

/**
 * Como le queda la prenda.
 *
 * `ajustado` y `holgado` no son "mal": una talla puede ser la mejor disponible y
 * aun asi quedar justa. Decirlo es mas util que dar un numero pelado, porque
 * quien lee decide si le sirve.
 */
export const AJUSTES = ['ajustado', 'justo', 'holgado'] as const
export type Ajuste = (typeof AJUSTES)[number]

export interface Recomendacion {
  talla_id: number
  talla: string
  ajuste: Ajuste
  /** 0 a 1. Baja cuando hay medidas estimadas o cuando el cuerpo cae entre dos tallas. */
  confianza: number
  /** En palabras: de donde salio la recomendacion. Se muestra tal cual. */
  motivo: string
  /** La segunda opcion, cuando el cuerpo cae entre dos tallas. */
  alternativa: { talla_id: number; talla: string; ajuste: Ajuste } | null
  /** Si esa talla esta disponible en el producto que se esta mirando. */
  hay_stock: boolean | null
  variante_id: number | null
}

/** Lo que se responde cuando todavia no hay con que recomendar. */
export interface SinRecomendacion {
  talla_id: null
  motivo: string
  /** Que falta: 'medidas' o 'guia'. */
  falta: 'medidas' | 'guia'
}

export type RespuestaRecomendacion = Recomendacion | SinRecomendacion

export const esRecomendacion = (r: RespuestaRecomendacion): r is Recomendacion =>
  r.talla_id !== null

// --- Pruebas virtuales ------------------------------------------------------

export const MODOS_PRUEBA = ['avatar', 'ra_camara'] as const
export type ModoPrueba = (typeof MODOS_PRUEBA)[number]

export const registrarPruebaSchema = z.object({
  variante_id: idSchema,
  modo: z.enum(MODOS_PRUEBA),
  talla_recomendada_id: idSchema.optional(),
  /** -2 muy chica … 0 justa … +2 muy grande. */
  ajuste: aEntero.min(-2).max(2).optional(),
  duracion_seg: aEntero.min(0).max(3600).optional(),
})

export type DatosRegistrarPrueba = z.infer<typeof registrarPruebaSchema>

// --- Avatar -----------------------------------------------------------------

export const TIPOS_CUERPO = [
  'reloj_arena',
  'triangulo',
  'triangulo_invertido',
  'rectangulo',
  'ovalado',
] as const
export type TipoCuerpo = (typeof TIPOS_CUERPO)[number]

/**
 * Proporciones normalizadas que dibuja el navegador.
 *
 * Van normalizadas contra la altura —no en centimetros— para que el mismo
 * avatar se pueda dibujar en un lienzo de cualquier tamanio sin recalcular
 * nada del lado del servidor.
 */
export interface ParametrosAvatar {
  hombros: number
  busto: number
  cintura: number
  cadera: number
  /** Largo del torso como fraccion de la altura. */
  torso: number
}

export interface Avatar {
  tipo_cuerpo: TipoCuerpo | null
  parametros: ParametrosAvatar
  actualizado_en: string
}

/**
 * Nombre legible de cada tipo de cuerpo.
 *
 * Se comparte para que la tienda y la app movil no escriban cada una su propia
 * traduccion y terminen diciendo cosas distintas de lo mismo.
 */
export const NOMBRE_TIPO_CUERPO: Record<TipoCuerpo, string> = {
  reloj_arena: 'Reloj de arena',
  triangulo: 'Triángulo',
  triangulo_invertido: 'Triángulo invertido',
  rectangulo: 'Rectángulo',
  ovalado: 'Ovalado',
}
