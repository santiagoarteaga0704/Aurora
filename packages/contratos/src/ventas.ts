/**
 * Contrato de la cadena de venta: carrito, pedido y pago.
 *
 * El mismo pedido cubre la venta online y la de mostrador; lo que cambia es el
 * `canal`. Modelarlo dos veces habria significado duplicar el descuento de
 * stock, los totales y los reportes, que es de donde salen las diferencias
 * entre "lo que vendio la tienda" y "lo que vendio la web".
 */
import { z } from 'zod'
import { aEntero, idSchema, paginacionSchema } from './comun'

export const CANALES = ['online', 'tienda'] as const
export type Canal = (typeof CANALES)[number]

export const MODALIDADES = ['menudeo', 'mayoreo'] as const
export type Modalidad = (typeof MODALIDADES)[number]

export const TIPOS_ENTREGA = ['inmediata', 'recojo_tienda', 'domicilio'] as const
export type TipoEntrega = (typeof TIPOS_ENTREGA)[number]

export const ESTADOS_PEDIDO = [
  'pendiente',
  'pagado',
  'preparando',
  'listo',
  'enviado',
  'entregado',
  'cancelado',
  'devuelto',
] as const
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number]

export const ESTADOS_PAGO = ['pendiente', 'confirmado', 'rechazado', 'reembolsado'] as const
export type EstadoPago = (typeof ESTADOS_PAGO)[number]

/**
 * Transiciones validas del pedido. Vive en el contrato y no dentro del servicio
 * porque el front tambien la necesita: es lo que decide que botones se pintan.
 *
 *   pendiente -> pagado -> preparando -> listo -> enviado -> entregado
 *
 * `cancelado` solo antes de que la mercaderia salga; una vez entregada, lo que
 * corresponde es una devolucion, que es otro proceso con su propio reembolso.
 */
export const TRANSICIONES_PEDIDO: Record<EstadoPedido, readonly EstadoPedido[]> = {
  pendiente: ['pagado', 'preparando', 'cancelado'],
  pagado: ['preparando', 'cancelado'],
  preparando: ['listo', 'cancelado'],
  listo: ['enviado', 'entregado', 'cancelado'],
  enviado: ['entregado'],
  entregado: ['devuelto'],
  cancelado: [],
  devuelto: [],
}

export const puedePasarA = (desde: EstadoPedido, hasta: EstadoPedido): boolean =>
  TRANSICIONES_PEDIDO[desde].includes(hasta)

// --- Carrito ----------------------------------------------------------------

export const agregarAlCarritoSchema = z.object({
  variante_id: idSchema,
  cantidad: aEntero.positive('La cantidad debe ser mayor que cero').max(999),
})

export type DatosAgregarAlCarrito = z.infer<typeof agregarAlCarritoSchema>

export const cambiarCantidadSchema = z.object({
  /** Cero quita el articulo del carrito. */
  cantidad: aEntero.min(0).max(999),
})

export interface ItemCarrito {
  variante_id: number
  sku: string
  producto: string
  slug: string
  talla: string
  color: string
  imagen: string | null
  cantidad: number
  precio_unitario: number
  subtotal: number
  disponible: number
  /** El carrito guarda articulos que pueden agotarse mientras tanto. */
  sin_stock: boolean
}

export interface Carrito {
  session_token: string
  items: ItemCarrito[]
  unidades: number
  subtotal: number
  modalidad: Modalidad
}

// --- Pedido -----------------------------------------------------------------

export const crearPedidoSchema = z
  .object({
    /**
     * Sin items, el pedido se arma con lo que haya en el carrito. El punto de
     * venta manda los items directamente porque no usa carrito.
     */
    items: z
      .array(
        z.object({
          variante_id: idSchema,
          cantidad: aEntero.positive().max(999),
        })
      )
      .optional(),
    canal: z.enum(CANALES).default('online'),
    tipo_entrega: z.enum(TIPOS_ENTREGA).default('recojo_tienda'),
    sucursal_id: idSchema,
    almacen_id: idSchema.optional(),
    direccion_id: idSchema.optional(),
    /** Solo en mostrador: a que cliente registrado se le atribuye la venta. */
    cliente_id: idSchema.optional(),
    costo_envio: z.coerce.number().nonnegative().max(9999).default(0),
    /**
     * Codigo de cupon. Es lo UNICO que el cliente puede decir sobre el
     * descuento: el monto lo calcula el servidor.
     */
    cupon: z.string().trim().toUpperCase().max(30).optional(),
    nota: z.string().trim().max(255).optional(),
    /** Marca las ventas que se registraron sin conexion y se sincronizaron. */
    creado_offline: z.boolean().default(false),
    creado_en_cliente: z.coerce.date().optional(),
    /**
     * Cobro en el mismo acto, para el punto de venta.
     *
     * En el mostrador la venta y el cobro son un solo hecho, y sobre todo: una
     * venta hecha sin conexion se encola como UNA operacion. Si el pago fuera
     * una peticion aparte, la cola tendria que encadenar dos llamadas y pasarle
     * a la segunda el id que devolvio la primera, que es justo el tipo de cosa
     * que se rompe cuando la red va y viene.
     */
    pago: z
      .object({
        metodo_pago_id: idSchema,
        monto: z.coerce.number().positive().max(9_999_999.99),
        referencia_externa: z.string().trim().max(120).optional(),
      })
      .optional(),
  })
  .refine((p) => p.tipo_entrega !== 'domicilio' || p.direccion_id !== undefined, {
    message: 'Un envio a domicilio necesita una direccion',
    path: ['direccion_id'],
  })

export type DatosCrearPedido = z.infer<typeof crearPedidoSchema>

export const cambiarEstadoSchema = z.object({
  estado: z.enum(ESTADOS_PEDIDO),
  comentario: z.string().trim().max(255).optional(),
})

export type DatosCambiarEstado = z.infer<typeof cambiarEstadoSchema>

export const cancelarPedidoSchema = z.object({
  motivo: z.string().trim().min(3, 'Indica por que se cancela').max(255),
})

export const consultaPedidosSchema = paginacionSchema.extend({
  estado: z.enum(ESTADOS_PEDIDO).optional(),
  canal: z.enum(CANALES).optional(),
  sucursal_id: idSchema.optional(),
  cliente_id: idSchema.optional(),
  numero: z.string().trim().max(20).optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
})

export type DatosConsultaPedidos = z.infer<typeof consultaPedidosSchema>

export interface LineaPedido {
  /**
   * Identificador de la linea. Lo necesita la devolucion: se devuelve "esta
   * linea del pedido", no "esta variante", porque la misma variante puede
   * aparecer en pedidos distintos con precios distintos.
   */
  id: string
  variante_id: number
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  descuento: number
  subtotal: number
}

export interface Pedido {
  id: string
  numero: string
  estado: EstadoPedido
  canal: Canal
  modalidad: Modalidad
  tipo_entrega: TipoEntrega
  sucursal: string
  sucursal_id: number
  almacen_id: number
  cliente: string | null
  vendedor: string | null
  subtotal: number
  descuento: number
  costo_envio: number
  total: number
  pagado: number
  saldo: number
  moneda: string
  nota: string | null
  creado_offline: boolean
  creado_en: string
  items: LineaPedido[]
}

// --- Pago -------------------------------------------------------------------

export const registrarPagoSchema = z.object({
  metodo_pago_id: idSchema,
  monto: z.coerce.number().positive('El monto debe ser mayor que cero').max(9_999_999.99),
  referencia_externa: z.string().trim().max(120).optional(),
  comprobante_url: z.string().trim().url().max(255).optional(),
})

export type DatosRegistrarPago = z.infer<typeof registrarPagoSchema>

export const resolverPagoSchema = z.object({
  aprobado: z.boolean(),
  motivo: z.string().trim().max(255).optional(),
})

export type DatosResolverPago = z.infer<typeof resolverPagoSchema>

export interface Pago {
  id: string
  pedido_id: string
  metodo: string
  metodo_codigo: string
  monto: number
  estado: EstadoPago
  referencia_externa: string | null
  comprobante_url: string | null
  confirmado_por: string | null
  creado_en: string
  confirmado_en: string | null
}
