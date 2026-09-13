/**
 * Contrato de inventario y transferencias.
 *
 * El stock no vive en el producto ni en la sucursal: vive en el par
 * (variante, almacen). Una sucursal puede tener varios almacenes -- venta,
 * deposito, devoluciones y transito -- y el stock vendible es el del almacen
 * principal de venta. Esa separacion es la que permite que una devolucion entre
 * a un almacen aparte hasta que alguien revise la prenda.
 */
import { z } from 'zod'
import { aBooleano, aEntero, idSchema, paginacionSchema } from './comun'

export const TIPOS_MOVIMIENTO = [
  'entrada',
  'salida',
  'ajuste',
  'transferencia_salida',
  'transferencia_entrada',
  'devolucion',
  'reserva',
  'liberacion',
] as const
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number]

export const ESTADOS_TRANSFERENCIA = [
  'borrador',
  'solicitada',
  'aprobada',
  'en_transito',
  'recibida',
  'rechazada',
] as const
export type EstadoTransferencia = (typeof ESTADOS_TRANSFERENCIA)[number]

// --- Consulta de stock ------------------------------------------------------

export const consultaInventarioSchema = paginacionSchema.extend({
  sucursal_id: idSchema.optional(),
  almacen_id: idSchema.optional(),
  variante_id: idSchema.optional(),
  producto_id: idSchema.optional(),
  q: z.string().trim().min(1).max(80).optional(),
  /** Solo lo que esta en o por debajo del minimo configurado. */
  solo_bajo_minimo: aBooleano.optional(),
})

export type DatosConsultaInventario = z.infer<typeof consultaInventarioSchema>

export const consultaMovimientosSchema = paginacionSchema.extend({
  variante_id: idSchema.optional(),
  almacen_id: idSchema.optional(),
  tipo: z.enum(TIPOS_MOVIMIENTO).optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
})

export type DatosConsultaMovimientos = z.infer<typeof consultaMovimientosSchema>

// --- Ajuste de stock --------------------------------------------------------

/**
 * El ajuste declara el stock que se conto fisicamente, no la diferencia. Es como
 * trabaja un inventario real: alguien cuenta 18 y escribe 18. El sistema calcula
 * la diferencia contra lo que tenia y la registra como movimiento, que es lo que
 * despues permite auditar quien ajusto que y por que.
 */
export const ajusteInventarioSchema = z.object({
  variante_id: idSchema,
  almacen_id: idSchema,
  stock_contado: aEntero.min(0, 'El stock contado no puede ser negativo'),
  motivo: z.string().trim().min(3, 'El motivo es obligatorio en un ajuste').max(200),
  stock_minimo: aEntero.min(0).optional(),
  ubicacion: z.string().trim().max(40).optional(),
})

export type DatosAjusteInventario = z.infer<typeof ajusteInventarioSchema>

// --- Transferencias entre almacenes -----------------------------------------

export const crearTransferenciaSchema = z
  .object({
    almacen_origen_id: idSchema,
    almacen_destino_id: idSchema,
    observacion: z.string().trim().max(255).optional(),
    items: z
      .array(
        z.object({
          variante_id: idSchema,
          cantidad: aEntero.positive('La cantidad debe ser mayor que cero'),
        })
      )
      .min(1, 'La transferencia necesita al menos un articulo'),
  })
  .refine((t) => t.almacen_origen_id !== t.almacen_destino_id, {
    message: 'El origen y el destino no pueden ser el mismo almacen',
    path: ['almacen_destino_id'],
  })
  .refine((t) => new Set(t.items.map((i) => i.variante_id)).size === t.items.length, {
    message: 'Hay una variante repetida; junta las cantidades en una sola linea',
    path: ['items'],
  })

export type DatosCrearTransferencia = z.infer<typeof crearTransferenciaSchema>

/**
 * Al recibir se declara cuanto llego de verdad. Puede ser menos de lo enviado
 * (faltante en el camino), y esa diferencia queda registrada en vez de
 * taparse: el stock que entra al destino es el recibido, no el enviado.
 */
export const recibirTransferenciaSchema = z.object({
  items: z
    .array(
      z.object({
        variante_id: idSchema,
        cantidad_recibida: aEntero.min(0),
      })
    )
    .min(1),
  observacion: z.string().trim().max(255).optional(),
})

export type DatosRecibirTransferencia = z.infer<typeof recibirTransferenciaSchema>

export const rechazarTransferenciaSchema = z.object({
  motivo: z.string().trim().min(3, 'Explica por que se rechaza').max(255),
})

export const consultaTransferenciasSchema = paginacionSchema.extend({
  estado: z.enum(ESTADOS_TRANSFERENCIA).optional(),
  almacen_origen_id: idSchema.optional(),
  almacen_destino_id: idSchema.optional(),
  sucursal_id: idSchema.optional(),
})

export type DatosConsultaTransferencias = z.infer<typeof consultaTransferenciasSchema>

// --- Formas que devuelve la API ---------------------------------------------

export interface FilaInventario {
  variante_id: number
  sku: string
  producto: string
  talla: string
  color: string
  almacen_id: number
  almacen: string
  sucursal_id: number
  sucursal: string
  stock: number
  reservado: number
  disponible: number
  stock_minimo: number
  bajo_minimo: boolean
  ubicacion: string | null
}

export interface FilaStockSucursal {
  sucursal_id: number
  sucursal: string
  variante_id: number
  sku: string
  producto_id: number
  producto: string
  talla: string
  color: string
  stock_total: number
  reservado: number
  disponible: number
}

export interface TransferenciaResumen {
  id: string
  numero: string
  estado: EstadoTransferencia
  almacen_origen: string
  almacen_destino: string
  solicita: string
  aprueba: string | null
  observacion: string | null
  creado_en: string
  recibido_en: string | null
  articulos: number
  unidades: number
}
