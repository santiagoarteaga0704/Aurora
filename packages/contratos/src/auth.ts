/**
 * Esquemas de autenticacion. Son los mismos que validaba a mano el backend
 * anterior; aqui se declaran una sola vez y los usan la API (para rechazar),
 * el PWA y la app movil (para validar el formulario antes de enviar).
 */
import { z } from 'zod'

/**
 * bcrypt solo considera los primeros 72 bytes de la contrasenia, asi que aceptar
 * mas es enganiar al usuario: dos contrasenias que difieren despues del byte 72
 * serian la misma.
 */
export const LARGO_MAXIMO_PASSWORD = 72
export const LARGO_MINIMO_PASSWORD = 8

const texto = (min: number, max: number) => z.string().trim().min(min).max(max)

export const passwordSchema = z
  .string()
  .min(LARGO_MINIMO_PASSWORD, `La contrasenia debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres`)
  .max(LARGO_MAXIMO_PASSWORD, `La contrasenia no puede pasar de ${LARGO_MAXIMO_PASSWORD} caracteres`)

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Correo electronico invalido')
  .max(120)

export const TIPOS_CLIENTE = ['minorista', 'mayorista'] as const
export type TipoCliente = (typeof TIPOS_CLIENTE)[number]

export const registroSchema = z
  .object({
    nombre: texto(2, 80),
    apellido: texto(2, 80),
    email: emailSchema,
    telefono: texto(0, 30).optional(),
    password: passwordSchema,
    tipo: z.enum(TIPOS_CLIENTE).default('minorista'),
    nit: texto(0, 20).optional(),
    razon_social: texto(0, 150).optional(),
  })
  // Un mayorista factura, asi que sin NIT no se puede dar de alta. La regla
  // vivia en el controlador del backend anterior; aqui la ve tambien el front.
  .refine((d) => d.tipo !== 'mayorista' || (d.nit ?? '') !== '', {
    message: 'El NIT es obligatorio para cuentas mayoristas',
    path: ['nit'],
  })

export type DatosRegistro = z.infer<typeof registroSchema>

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'La contrasenia es obligatoria'),
})

export type DatosLogin = z.infer<typeof loginSchema>

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Falta el token de refresco'),
})

export type DatosRefresh = z.infer<typeof refreshSchema>

export const logoutSchema = z.object({
  refresh_token: z.string().optional(),
})

export const cambiarPasswordSchema = z.object({
  password_actual: z.string().min(1, 'Ingresa tu contrasenia actual'),
  password_nueva: passwordSchema,
})

export type DatosCambiarPassword = z.infer<typeof cambiarPasswordSchema>

// --- Formas que devuelve la API ---------------------------------------------

export interface UsuarioSesion {
  id: number
  nombre: string
  apellido: string
  email: string
  rol: string
  sucursal_id: number | null
  permisos: string[]
}

export interface ParTokens {
  token: string
  /** Segundos de vida del token de acceso. */
  expira_en: number
  refresh_token: string
  usuario: UsuarioSesion
}

export interface PerfilCompleto extends UsuarioSesion {
  telefono: string | null
  avatar_url: string | null
  sucursal: string | null
  rol_id: number
  tipo_cliente: TipoCliente | null
  mayorista_aprobado: boolean | null
  puntos: number | null
}
