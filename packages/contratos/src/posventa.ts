/**
 * Contrato de posventa: devoluciones y envios.
 *
 * Son las dos cosas que pasan despues de vender, y las dos tocan el inventario
 * y el estado del pedido, asi que comparten contrato.
 */
import { z } from 'zod'
import { aEntero, idSchema, paginacionSchema } from './comun'

// --- Devoluciones -----------------------------------------------------------

export const MOTIVOS_DEVOLUCION = [
  'talla_incorrecta',
  'defecto',
  'no_coincide',
  'arrepentimiento',
  'otro',
] as const
export type MotivoDevolucion = (typeof MOTIVOS_DEVOLUCION)[number]

export const ESTADOS_DEVOLUCION = [
  'solicitada',
  'aprobada',
  'rechazada',
  'recibida',
  'reembolsada',
] as const
export type EstadoDevolucion = (typeof ESTADOS_DEVOLUCION)[number]

export const ESTADOS_PRENDA = ['nueva', 'usada', 'danada'] as const
export type EstadoPrenda = (typeof ESTADOS_PRENDA)[number]

export const solicitarDevolucionSchema = z.object({
  pedido_id: z.string().regex(/^\d+$/, 'Identificador de pedido invalido'),
  motivo: z.enum(MOTIVOS_DEVOLUCION),
  detalle: z.string().trim().max(255).optional(),
  items: z
    .array(
      z.object({
        pedido_detalle_id: z.string().regex(/^\d+$/, 'Identificador de linea invalido'),
        cantidad: aEntero.positive('La cantidad debe ser mayor que cero'),
      })
    )
    .min(1, 'Indica que articulos devuelves'),
})

export type DatosSolicitarDevolucion = z.infer<typeof solicitarDevolucionSchema>

export const resolverDevolucionSchema = z.object({
  aprobada: z.boolean(),
  comentario: z.string().trim().max(255).optional(),
})

export type DatosResolverDevolucion = z.infer<typeof resolverDevolucionSchema>

/**
 * Al recibir la mercaderia se clasifica prenda por prenda.
 *
 * De eso depende si vuelve a estar a la venta: una prenda nueva reingresa al
 * piso, una usada al almacen de devoluciones para revisarla, y una daniada no
 * reingresa a ningun lado. Meter todo de vuelta al stock vendible es como se
 * termina mandando ropa rota a la siguiente clienta.
 */
export const recibirDevolucionSchema = z.object({
  items: z
    .array(
      z.object({
        variante_id: idSchema,
        estado_prenda: z.enum(ESTADOS_PRENDA),
        reingresa_stock: z.boolean().optional(),
      })
    )
    .min(1),
})

export type DatosRecibirDevolucion = z.infer<typeof recibirDevolucionSchema>

export const reembolsarSchema = z.object({
  monto: z.coerce.number().nonnegative().max(9_999_999.99),
  comentario: z.string().trim().max(255).optional(),
})

export type DatosReembolsar = z.infer<typeof reembolsarSchema>

export const consultaDevolucionesSchema = paginacionSchema.extend({
  estado: z.enum(ESTADOS_DEVOLUCION).optional(),
  motivo: z.enum(MOTIVOS_DEVOLUCION).optional(),
  sucursal_id: idSchema.optional(),
})

export type DatosConsultaDevoluciones = z.infer<typeof consultaDevolucionesSchema>

/**
 * Una devolucion en el listado.
 *
 * Sin las lineas, igual que en compras: llegan al abrir el detalle. El tipo
 * faltaba y el servicio devolvia una forma sin declarar, que es la manera de
 * que un cliente la adivine mal sin que nada avise.
 */
export interface DevolucionResumen {
  id: string
  numero: string
  pedido_numero: string
  cliente: string | null
  motivo: MotivoDevolucion
  estado: EstadoDevolucion
  unidades: number
  monto_reembolso: number
  creado_en: string
}

export interface Devolucion {
  id: string
  numero: string
  pedido_id: string
  pedido_numero: string
  cliente: string | null
  motivo: MotivoDevolucion
  detalle: string | null
  estado: EstadoDevolucion
  monto_reembolso: number
  monto_estimado: number
  gestiona: string | null
  creado_en: string
  cerrado_en: string | null
  items: {
    variante_id: number
    sku: string
    descripcion: string
    cantidad: number
    estado_prenda: EstadoPrenda
    reingresa_stock: boolean
    precio_unitario: number
  }[]
}

// --- Envios -----------------------------------------------------------------

export const ESTADOS_ENVIO = ['preparando', 'en_ruta', 'entregado', 'fallido', 'devuelto'] as const
export type EstadoEnvio = (typeof ESTADOS_ENVIO)[number]

/**
 * Transiciones del envio. `fallido` no es final: un intento fallido se puede
 * reintentar, que es lo que de verdad pasa cuando no hay nadie en el domicilio.
 */
export const TRANSICIONES_ENVIO: Record<EstadoEnvio, readonly EstadoEnvio[]> = {
  preparando: ['en_ruta', 'devuelto'],
  en_ruta: ['entregado', 'fallido'],
  fallido: ['en_ruta', 'devuelto'],
  entregado: [],
  devuelto: [],
}

export const crearEnvioSchema = z.object({
  pedido_id: z.string().regex(/^\d+$/, 'Identificador de pedido invalido'),
  repartidor_id: idSchema.optional(),
  empresa: z.string().trim().max(80).optional(),
  tracking: z.string().trim().max(80).optional(),
  costo: z.coerce.number().nonnegative().max(9999).default(0),
  fecha_estimada: z.coerce.date().optional(),
})

export type DatosCrearEnvio = z.infer<typeof crearEnvioSchema>

export const actualizarEnvioSchema = z.object({
  estado: z.enum(ESTADOS_ENVIO),
  repartidor_id: idSchema.optional(),
  tracking: z.string().trim().max(80).optional(),
  evidencia_url: z.string().trim().url().max(255).optional(),
  comentario: z.string().trim().max(255).optional(),
})

export type DatosActualizarEnvio = z.infer<typeof actualizarEnvioSchema>

export const consultaEnviosSchema = paginacionSchema.extend({
  estado: z.enum(ESTADOS_ENVIO).optional(),
  repartidor_id: idSchema.optional(),
  sucursal_id: idSchema.optional(),
})

export type DatosConsultaEnvios = z.infer<typeof consultaEnviosSchema>

export interface Envio {
  id: string
  pedido_id: string
  pedido_numero: string
  estado: EstadoEnvio
  repartidor: string | null
  empresa: string | null
  tracking: string | null
  costo: number
  direccion: string | null
  fecha_estimada: string | null
  entregado_en: string | null
  evidencia_url: string | null
}
