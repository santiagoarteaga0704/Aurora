/**
 * Contrato de la cuenta del cliente: sus direcciones de entrega.
 *
 * Las direcciones son del cliente, no del pedido: se guardan una vez y se
 * reutilizan. El pedido apunta a la direccion que se eligio, asi que cambiar
 * "Casa" despues no reescribe a donde se mando un envio que ya salio.
 */
import { z } from 'zod'
import { idSchema } from './comun'

export const direccionSchema = z.object({
  alias: z.string().trim().min(2, 'Ponele un nombre, como "Casa" o "Oficina"').max(50),
  ciudad_id: idSchema,
  direccion: z.string().trim().min(5, 'La direccion es demasiado corta').max(200),
  referencia: z.string().trim().max(200).optional(),
  latitud: z.coerce.number().min(-90).max(90).optional(),
  longitud: z.coerce.number().min(-180).max(180).optional(),
  /** Si la recibe otra persona. */
  destinatario: z.string().trim().max(120).optional(),
  telefono: z.string().trim().max(30).optional(),
  es_principal: z.boolean().default(false),
})

export type DatosDireccion = z.infer<typeof direccionSchema>

export const actualizarDireccionSchema = direccionSchema.partial()

export type DatosActualizarDireccion = z.infer<typeof actualizarDireccionSchema>

export interface Direccion {
  id: number
  alias: string
  ciudad: string
  ciudad_id: number
  departamento: string
  direccion: string
  referencia: string | null
  destinatario: string | null
  telefono: string | null
  es_principal: boolean
}
