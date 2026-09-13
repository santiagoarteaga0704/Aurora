/**
 * Contrato de reportes.
 *
 * El motor no arma SQL: cada reporte es una PLANTILLA guardada en la base, con
 * su SQL escrito por nosotros y sus parametros declarados. Quien pide el reporte
 * elige un codigo de plantilla y manda valores; nunca manda SQL.
 *
 * Eso importa por dos razones. La obvia: cierra la puerta a la inyeccion. La
 * segunda es la que hace que el asistente de IA sea viable — el modelo va a
 * elegir un codigo y devolver parametros, exactamente lo mismo que hace esta
 * pantalla. Si el modelo pudiera escribir SQL, bastaria una pregunta torcida
 * para que leyera la tabla de usuarios.
 */
import { z } from 'zod'
import { aEntero, idSchema, paginacionSchema } from './comun'

export const VISUALES = ['tabla', 'barras', 'lineas', 'torta', 'tarjeta'] as const
export type Visual = (typeof VISUALES)[number]

export const TIPOS_PARAMETRO = ['int', 'datetime', 'date', 'texto', 'enum', 'booleano'] as const
export type TipoParametro = (typeof TIPOS_PARAMETRO)[number]

export const ENTRADAS = ['texto', 'voz'] as const
export type Entrada = (typeof ENTRADAS)[number]

/** Como se declara un parametro dentro de la plantilla. */
export interface EspecificacionParametro {
  tipo: TipoParametro
  requerido: boolean
  defecto?: string | number | boolean
  opciones?: string[]
}

export interface PlantillaReporte {
  codigo: string
  nombre: string
  descripcion: string | null
  visual: Visual
  parametros: Record<string, EspecificacionParametro>
  /** Falso cuando el usuario no puede ejecutarla, con el motivo al lado. */
  disponible: boolean
  motivo?: string
}

export const ejecutarReporteSchema = z.object({
  /** Valores de los parametros declarados por la plantilla. */
  parametros: z.record(z.unknown()).default({}),
  /**
   * Que se pregunto, tal cual. Lo escribe el asistente cuando el reporte viene
   * de un chat; desde la pantalla queda el nombre de la plantilla.
   */
  pregunta: z.string().trim().max(500).optional(),
  entrada: z.enum(ENTRADAS).default('texto'),
})

export type DatosEjecutarReporte = z.infer<typeof ejecutarReporteSchema>

export interface ColumnaReporte {
  nombre: string
  /** Para que el front sepa alinear a la derecha y formatear como moneda. */
  tipo: 'numero' | 'texto' | 'fecha'
}

export interface ResultadoReporte {
  codigo: string
  nombre: string
  visual: Visual
  columnas: ColumnaReporte[]
  filas: Record<string, unknown>[]
  total_filas: number
  /** Cierto si se corto por el tope de filas. */
  truncado: boolean
  parametros_usados: Record<string, unknown>
  duracion_ms: number
  generado_en: string
}

export const consultaHistorialSchema = paginacionSchema.extend({
  plantilla_id: idSchema.optional(),
  solo_errores: z.enum(['true', 'false']).optional(),
})

export type DatosConsultaHistorial = z.infer<typeof consultaHistorialSchema>

export interface EntradaHistorial {
  id: string
  plantilla: string | null
  pregunta: string
  entrada: Entrada
  parametros: Record<string, unknown> | null
  filas: number | null
  exito: boolean
  error: string | null
  duracion_ms: number | null
  usuario: string
  creado_en: string
}

/** Tope de filas que devuelve un reporte. Ver ReportesService. */
export const TOPE_FILAS = 5000

export const exportarSchema = ejecutarReporteSchema.extend({
  formato: z.enum(['csv']).default('csv'),
})

export type DatosExportar = z.infer<typeof exportarSchema>

/** Rango de fechas rapido, para los botones de la pantalla. */
export const RANGOS_RAPIDOS = {
  hoy: 'Hoy',
  ayer: 'Ayer',
  semana: 'Ultimos 7 dias',
  mes: 'Ultimos 30 dias',
  trimestre: 'Ultimos 90 dias',
} as const

export type RangoRapido = keyof typeof RANGOS_RAPIDOS

/**
 * Convierte un rango rapido en el par de fechas que esperan las plantillas.
 * Vive en el contrato porque lo usan la pantalla y, mas adelante, el asistente
 * cuando alguien diga "las ventas de ayer".
 */
export function rangoAFechas(rango: RangoRapido, ahora = new Date()): { desde: Date; hasta: Date } {
  const finDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
  const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

  switch (rango) {
    case 'hoy':
      return { desde: inicioDelDia(ahora), hasta: finDelDia(ahora) }
    case 'ayer': {
      const ayer = new Date(ahora)
      ayer.setDate(ayer.getDate() - 1)
      return { desde: inicioDelDia(ayer), hasta: finDelDia(ayer) }
    }
    case 'semana': {
      const desde = new Date(ahora)
      desde.setDate(desde.getDate() - 6)
      return { desde: inicioDelDia(desde), hasta: finDelDia(ahora) }
    }
    case 'mes': {
      const desde = new Date(ahora)
      desde.setDate(desde.getDate() - 29)
      return { desde: inicioDelDia(desde), hasta: finDelDia(ahora) }
    }
    case 'trimestre': {
      const desde = new Date(ahora)
      desde.setDate(desde.getDate() - 89)
      return { desde: inicioDelDia(desde), hasta: finDelDia(ahora) }
    }
  }
}

export const aEnteroPositivo = aEntero.positive()
