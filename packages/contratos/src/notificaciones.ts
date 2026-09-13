/**
 * Contrato de notificaciones.
 *
 * Son avisos de hechos que ya pasaron: el pedido cambio de estado, el pago se
 * confirmo, una prenda bajo del minimo. No es mensajeria ni chat —para eso esta
 * el asistente— y no hay forma de que un usuario le escriba a otro: las crea el
 * servidor cuando algo ocurre, y nadie mas.
 */
import { z } from 'zod'
import { paginacionSchema } from './comun'

export const TIPOS_NOTIFICACION = [
  'pedido',
  'stock',
  'promocion',
  'sistema',
  'devolucion',
] as const
export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number]

export const consultaNotificacionesSchema = paginacionSchema.extend({
  /** Solo las que faltan leer. Es lo que pide la campanita al abrirse. */
  sin_leer: z.coerce.boolean().optional(),
  tipo: z.enum(TIPOS_NOTIFICACION).optional(),
})

export type DatosConsultaNotificaciones = z.infer<typeof consultaNotificacionesSchema>

export interface Notificacion {
  id: string
  titulo: string
  mensaje: string
  tipo: TipoNotificacion
  /** A donde lleva el aviso. Sin esto, enterarse no sirve de nada. */
  url: string | null
  leida: boolean
  creado_en: string
}

export interface ResumenNotificaciones {
  sin_leer: number
}
