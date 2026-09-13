import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { ExcepcionNegocio } from '../errores/excepcion-negocio'
import { CLAVE_PERMISO } from './decoradores'
import { PermisosService } from './permisos.service'

/**
 * Guardia de autorizacion, global. Solo actua si el endpoint declara
 * @RequierePermiso(...). Basta con tener uno de los permisos listados.
 *
 * Corre despues de AutenticacionGuard, asi que req.usuario ya esta resuelto.
 */
@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permisos: PermisosService
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndOverride<string[]>(CLAVE_PERMISO, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (!requeridos || requeridos.length === 0) return true

    const usuario = ctx.switchToHttp().getRequest<Request>().usuario
    if (!usuario) throw ExcepcionNegocio.noAutenticado()

    const autorizado = requeridos.some((p) => this.permisos.puede(usuario.permisos, p))
    if (!autorizado) {
      throw ExcepcionNegocio.sinPermiso(
        requeridos.length === 1
          ? `Te falta el permiso '${requeridos[0]}'`
          : `Te falta alguno de estos permisos: ${requeridos.join(', ')}`
      )
    }

    return true
  }
}
