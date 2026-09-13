/**
 * Contrato de administracion: usuarios, roles y permisos.
 *
 * Los permisos viven en la base de datos, no en el codigo. Un administrador
 * crea un rol nuevo y le asigna permisos sin que nadie recompile ni despliegue
 * nada; es el requisito RF-04 y la razon por la que existe la tabla
 * `rol_permiso` en vez de una lista de roles dentro del backend.
 */
import { z } from 'zod'
import { idSchema, paginacionSchema } from './comun'
import { passwordSchema, emailSchema, TIPOS_CLIENTE } from './auth'

export const crearUsuarioSchema = z.object({
  rol_id: idSchema,
  /** El personal pertenece a una sucursal; un cliente no. */
  sucursal_id: idSchema.optional(),
  nombre: z.string().trim().min(2).max(80),
  apellido: z.string().trim().min(2).max(80),
  email: emailSchema,
  telefono: z.string().trim().max(30).optional(),
  ci: z.string().trim().max(20).optional(),
  password: passwordSchema,
})

export type DatosCrearUsuario = z.infer<typeof crearUsuarioSchema>

export const actualizarUsuarioSchema = z.object({
  rol_id: idSchema.optional(),
  sucursal_id: idSchema.nullable().optional(),
  nombre: z.string().trim().min(2).max(80).optional(),
  apellido: z.string().trim().min(2).max(80).optional(),
  telefono: z.string().trim().max(30).optional(),
  ci: z.string().trim().max(20).optional(),
  activo: z.boolean().optional(),
  /** Restablecer la contrasenia cierra todas sus sesiones. */
  password: passwordSchema.optional(),
})

export type DatosActualizarUsuario = z.infer<typeof actualizarUsuarioSchema>

export const consultaUsuariosSchema = paginacionSchema.extend({
  rol_id: idSchema.optional(),
  sucursal_id: idSchema.optional(),
  q: z.string().trim().min(1).max(80).optional(),
  solo_activos: z.enum(['true', 'false']).optional(),
})

export type DatosConsultaUsuarios = z.infer<typeof consultaUsuariosSchema>

export const rolSchema = z.object({
  nombre: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(50)
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'El nombre del rol empieza con letra y admite minusculas, numeros y guion bajo'
    ),
  descripcion: z.string().trim().max(200).optional(),
})

export type DatosRol = z.infer<typeof rolSchema>

export const permisosDeRolSchema = z.object({
  /** Lista completa de codigos: reemplaza lo que el rol tenia. */
  permisos: z.array(z.string().trim().min(1).max(80)).max(100),
})

export type DatosPermisosDeRol = z.infer<typeof permisosDeRolSchema>

export const aprobarMayoristaSchema = z.object({
  aprobado: z.boolean(),
  /** Descuento adicional sobre el precio de mayoreo, en porcentaje. */
  descuento_extra: z.coerce.number().min(0).max(99.99).optional(),
  limite_credito: z.coerce.number().min(0).max(9_999_999.99).optional(),
})

export type DatosAprobarMayorista = z.infer<typeof aprobarMayoristaSchema>

export interface UsuarioAdmin {
  id: number
  nombre: string
  apellido: string
  email: string
  telefono: string | null
  ci: string | null
  rol: string
  rol_id: number
  sucursal: string | null
  sucursal_id: number | null
  activo: boolean
  ultimo_acceso: string | null
  creado_en: string
  tipo_cliente: (typeof TIPOS_CLIENTE)[number] | null
  mayorista_aprobado: boolean | null
}

export interface RolConPermisos {
  id: number
  nombre: string
  descripcion: string | null
  es_sistema: boolean
  activo: boolean
  usuarios: number
  permisos: string[]
}
