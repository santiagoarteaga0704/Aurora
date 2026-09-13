import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common'
import type { Request } from 'express'
import { ExcepcionNegocio } from '../errores/excepcion-negocio'
import type { UsuarioAutenticado } from './tipos'

export const CLAVE_PUBLICO = 'aurora:publico'
export const CLAVE_OPCIONAL = 'aurora:opcional'
export const CLAVE_PERMISO = 'aurora:permiso'

/** Ruta abierta: no se mira el token. Ej. login, registro, salud. */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true)

/**
 * Ruta que funciona con y sin sesion. El catalogo es el caso tipico: un visitante
 * ve precios de lista y un mayorista aprobado ve los suyos.
 */
export const Opcional = () => SetMetadata(CLAVE_OPCIONAL, true)

/**
 * Exige un permiso concreto, de los que viven en la tabla `permiso`. El rol
 * administrador tiene el comodin '*' y pasa cualquiera.
 */
export const RequierePermiso = (...permisos: string[]) => SetMetadata(CLAVE_PERMISO, permisos)

/** Inyecta el usuario autenticado en el controlador. */
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): UsuarioAutenticado => {
    const req = ctx.switchToHttp().getRequest<Request>()
    if (!req.usuario) {
      // Pasa si se pide el usuario en una ruta marcada @Publico u @Opcional:
      // es un error de programacion, no del cliente.
      throw ExcepcionNegocio.noAutenticado()
    }
    return req.usuario
  }
)

/** Como UsuarioActual, pero admite null en rutas @Opcional. */
export const UsuarioSiHay = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): UsuarioAutenticado | null =>
    ctx.switchToHttp().getRequest<Request>().usuario ?? null
)

/**
 * Clave de idempotencia que manda el cliente en la cabecera Idempotency-Key.
 *
 * Es la pieza que hace segura la cola offline: una venta registrada sin red se
 * reintenta al volver la conexion, y como la clave viaja con ella, el servidor
 * reconoce el reintento en vez de registrar la venta dos veces.
 */
export const ClaveIdempotencia = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): string | null => {
    const valor = ctx.switchToHttp().getRequest<Request>().header('idempotency-key')
    return valor ? valor.slice(0, 36) : null
  }
)

/** UUID del dispositivo, para atar la sesion y la cola de sincronizacion. */
export const DispositivoActual = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): string | null => {
    const valor = ctx.switchToHttp().getRequest<Request>().header('x-dispositivo')
    return valor ? valor.slice(0, 64) : null
  }
)

/**
 * Token del carrito anonimo, en la cabecera X-Carrito.
 *
 * Permite que alguien arme su carrito sin registrarse y que, al iniciar sesion,
 * ese carrito se fusione con el de su cuenta en vez de perderse.
 */
export const CarritoSesion = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): string | null => {
    const valor = ctx.switchToHttp().getRequest<Request>().header('x-carrito')
    return valor ? valor.slice(0, 64) : null
  }
)
