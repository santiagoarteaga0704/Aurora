/**
 * Contrato del catalogo.
 *
 * Lo importante del modelo: la unidad que se vende NO es el producto sino la
 * **variante** (producto x talla x color). El stock, el SKU, el codigo de barras
 * y los precios cuelgan de la variante. Guardar las tallas como texto dentro del
 * producto es el error clasico en tiendas de ropa y hace imposible saber si
 * queda la M en negro.
 */
import { z } from 'zod'
import { aBooleano, aEntero, idSchema, paginacionSchema } from './comun'

// --- Valores que acepta la base -------------------------------------------

export const TEMPORADAS = ['verano', 'invierno', 'otono', 'primavera', 'todo_ano'] as const
export type Temporada = (typeof TEMPORADAS)[number]

export const TIPOS_PRENDA = [
  'superior',
  'inferior',
  'vestido',
  'abrigo',
  'calzado',
  'accesorio',
  'ropa_interior',
] as const
export type TipoPrenda = (typeof TIPOS_PRENDA)[number]

export const TIPOS_TALLA = ['alfa', 'numerica', 'calzado', 'unica'] as const
export type TipoTalla = (typeof TIPOS_TALLA)[number]

export const ORDENES_CATALOGO = [
  'relevancia',
  'nombre',
  'precio_asc',
  'precio_desc',
  'novedades',
  'mas_vendidos',
] as const
export type OrdenCatalogo = (typeof ORDENES_CATALOGO)[number]

// --- Busqueda del catalogo -------------------------------------------------

/**
 * El enunciado pide "catalogo con multiples busquedas". Todos los filtros se
 * combinan entre si: texto libre, categoria, marca, talla, color, rango de
 * precio, temporada, tipo de prenda y destacados.
 *
 * El texto libre no usa LIKE sino el indice GIN de `to_tsvector('spanish', ...)`
 * que crea el esquema, asi que "vestidos rojos" encuentra "vestido rojo".
 */
export const busquedaCatalogoSchema = paginacionSchema.extend({
  q: z.string().trim().min(1).max(120).optional(),
  categoria_id: idSchema.optional(),
  marca_id: idSchema.optional(),
  talla_id: idSchema.optional(),
  color_id: idSchema.optional(),
  precio_min: z.coerce.number().nonnegative().optional(),
  precio_max: z.coerce.number().nonnegative().optional(),
  temporada: z.enum(TEMPORADAS).optional(),
  tipo_prenda: z.enum(TIPOS_PRENDA).optional(),
  destacado: aBooleano.optional(),
  /** Solo lo usa el personal: incluye los productos dados de baja. */
  incluir_inactivos: aBooleano.optional(),
  orden: z.enum(ORDENES_CATALOGO).default('relevancia'),
})

export type DatosBusquedaCatalogo = z.infer<typeof busquedaCatalogoSchema>

// --- Alta y edicion de productos -------------------------------------------

const precio = z.coerce
  .number()
  .nonnegative('El precio no puede ser negativo')
  .max(9_999_999.99, 'El precio se pasa de lo que admite la columna')

export const crearVarianteSchema = z
  .object({
    talla_id: idSchema,
    color_id: idSchema,
    sku: z.string().trim().min(3).max(40),
    codigo_barras: z.string().trim().max(40).optional(),
    precio_menor: precio,
    precio_mayor: precio,
    costo: precio.default(0),
    peso_gr: aEntero.positive().max(100_000).optional(),
  })
  // Vender al por mayor mas caro que al por menor es casi siempre un error de
  // carga, y se detecta cuando ya se facturo.
  .refine((v) => v.precio_mayor <= v.precio_menor, {
    message: 'El precio de mayoreo no puede ser mayor que el de menudeo',
    path: ['precio_mayor'],
  })

export type DatosCrearVariante = z.infer<typeof crearVarianteSchema>

export const crearProductoSchema = z.object({
  categoria_id: idSchema,
  marca_id: idSchema.optional(),
  codigo: z.string().trim().min(2).max(30),
  nombre: z.string().trim().min(2).max(150),
  descripcion: z.string().trim().max(5000).optional(),
  material: z.string().trim().max(120).optional(),
  cuidados: z.string().trim().max(255).optional(),
  temporada: z.enum(TEMPORADAS).default('todo_ano'),
  tipo_prenda: z.enum(TIPOS_PRENDA),
  destacado: z.boolean().default(false),
  /** Un producto sin variantes no se puede vender, asi que se exige al menos una. */
  variantes: z.array(crearVarianteSchema).min(1, 'Carga al menos una variante (talla y color)'),
})

export type DatosCrearProducto = z.infer<typeof crearProductoSchema>

export const actualizarProductoSchema = crearProductoSchema
  .omit({ variantes: true, codigo: true })
  .partial()
  .extend({ activo: z.boolean().optional() })

export type DatosActualizarProducto = z.infer<typeof actualizarProductoSchema>

export const actualizarVarianteSchema = crearVarianteSchema
  .innerType()
  .omit({ talla_id: true, color_id: true })
  .partial()
  .extend({ activo: z.boolean().optional() })

export type DatosActualizarVariante = z.infer<typeof actualizarVarianteSchema>

// --- Escalas de precio por volumen ------------------------------------------

/**
 * Precio por cantidad para la venta al por mayor: a partir de N unidades, cada
 * una cuesta X. Se declaran de una vez por variante.
 */
export const escalasPrecioSchema = z.object({
  escalas: z
    .array(
      z.object({
        cantidad_min: aEntero.min(2, 'Una escala de mayoreo arranca en 2 unidades'),
        precio_unitario: precio,
      })
    )
    .max(10),
})

export type DatosEscalasPrecio = z.infer<typeof escalasPrecioSchema>

// --- Imagenes ---------------------------------------------------------------

export const imagenSchema = z.object({
  url: z.string().trim().url('La imagen debe ser una URL').max(255),
  alt: z.string().trim().max(150).optional(),
  color_id: idSchema.optional(),
  orden: aEntero.min(0).default(0),
  es_principal: z.boolean().default(false),
})

export type DatosImagen = z.infer<typeof imagenSchema>

// --- Formas que devuelve la API ---------------------------------------------

export interface VarianteResumen {
  id: number
  sku: string
  talla: string
  color: string
  color_hex: string
  precio_menor: number
  precio_mayor: number
  /** Precio que le corresponde a quien consulta, segun sea minorista o mayorista. */
  precio: number
  disponible: number
  activo: boolean
}

export interface ProductoResumen {
  id: number
  codigo: string
  nombre: string
  slug: string
  categoria: string
  marca: string | null
  temporada: Temporada
  tipo_prenda: TipoPrenda
  destacado: boolean
  activo: boolean
  imagen: string | null
  precio_desde: number
  precio_hasta: number
  disponible: number
  calificacion: number
}

export interface ProductoFicha extends ProductoResumen {
  descripcion: string | null
  material: string | null
  cuidados: string | null
  vendidos: number
  imagenes: { url: string; alt: string | null; color_id: number | null; es_principal: boolean }[]
  variantes: VarianteResumen[]
  escalas: Record<number, { cantidad_min: number; precio_unitario: number }[]>
}
