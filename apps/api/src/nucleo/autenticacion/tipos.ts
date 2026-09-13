import type { UsuarioSesion } from '@aurora/contratos'

/** Usuario ya resuelto desde el token, tal como lo ve cada controlador. */
export interface UsuarioAutenticado extends UsuarioSesion {
  rol_id: number
  activo: boolean
}

/** Carga del JWT de acceso. */
export interface CargaAcceso {
  sub: number
  tipo: 'acceso'
  rol: string
  sucursal_id: number | null
}

declare module 'express' {
  interface Request {
    /** Lo rellena AutenticacionGuard. Es null en rutas publicas u opcionales. */
    usuario?: UsuarioAutenticado | null
  }
}
