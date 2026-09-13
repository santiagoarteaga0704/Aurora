/**
 * Contrato de compras a proveedores.
 *
 * Es la contracara de la venta: por aqui entra la mercaderia al almacen. El
 * ciclo tiene tres pasos por la misma razon que la transferencia -- la compra se
 * registra antes de que la mercaderia llegue, y el stock solo sube cuando
 * alguien la recibe fisicamente.
 *
 *   borrador   se esta cargando. No afecta nada.
 *   confirmada se mando al proveedor. Sigue sin afectar el stock.
 *   recibida   llego. AQUI sube el inventario.
 */
import { z } from 'zod'
import { aEntero, idSchema, paginacionSchema } from './comun'

export const ESTADOS_COMPRA = ['borrador', 'confirmada', 'recibida', 'anulada'] as const
export type EstadoCompra = (typeof ESTADOS_COMPRA)[number]

// --- Proveedores ------------------------------------------------------------

export const proveedorSchema = z.object({
  nombre: z.string().trim().min(2).max(150),
  nit: z.string().trim().max(20).optional(),
  contacto: z.string().trim().max(120).optional(),
  telefono: z.string().trim().max(30).optional(),
  email: z.string().trim().email('Correo invalido').max(120).optional(),
  direccion: z.string().trim().max(200).optional(),
})

export type DatosProveedor = z.infer<typeof proveedorSchema>

export const actualizarProveedorSchema = proveedorSchema
  .partial()
  .extend({ activo: z.boolean().optional() })

export type DatosActualizarProveedor = z.infer<typeof actualizarProveedorSchema>

// --- Compras ----------------------------------------------------------------

const costo = z.coerce.number().nonnegative().max(9_999_999.99)

export const crearCompraSchema = z
  .object({
    proveedor_id: idSchema,
    almacen_id: idSchema,
    fecha: z.coerce.date().optional(),
    descuento: costo.default(0),
    items: z
      .array(
        z.object({
          variante_id: idSchema,
          cantidad: aEntero.positive('La cantidad debe ser mayor que cero').max(99_999),
          costo_unitario: costo,
        })
      )
      .min(1, 'La compra necesita al menos un articulo'),
  })
  .refine((c) => new Set(c.items.map((i) => i.variante_id)).size === c.items.length, {
    message: 'Hay una variante repetida; junta las cantidades en una sola linea',
    path: ['items'],
  })

export type DatosCrearCompra = z.infer<typeof crearCompraSchema>

/**
 * Al recibir se puede declarar cuanto llego de verdad de cada linea: que un
 * proveedor mande de menos es lo normal, no la excepcion.
 *
 * A diferencia de la transferencia, `compra_detalle` no tiene una columna para
 * lo recibido aparte de lo pedido. Asi que al recibir se CORRIGEN las lineas y
 * los totales a lo que realmente entro, y la diferencia queda en la bitacora.
 * El documento termina reflejando lo que llego y lo que se va a pagar, que es
 * lo que tiene que cuadrar contra la factura del proveedor.
 *
 * Si se omiten los items, se recibe todo lo pedido.
 */
export const recibirCompraSchema = z.object({
  items: z
    .array(
      z.object({
        variante_id: idSchema,
        cantidad_recibida: aEntero.min(0),
      })
    )
    .optional(),
})

export type DatosRecibirCompra = z.infer<typeof recibirCompraSchema>

export const consultaComprasSchema = paginacionSchema.extend({
  estado: z.enum(ESTADOS_COMPRA).optional(),
  proveedor_id: idSchema.optional(),
  almacen_id: idSchema.optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
})

export type DatosConsultaCompras = z.infer<typeof consultaComprasSchema>

export interface Compra {
  id: string
  numero: string
  estado: EstadoCompra
  proveedor: string
  almacen: string
  sucursal: string
  usuario: string
  fecha: string
  subtotal: number
  descuento: number
  total: number
  items: {
    variante_id: number
    sku: string
    descripcion: string
    cantidad: number
    costo_unitario: number
    subtotal: number
  }[]
}
