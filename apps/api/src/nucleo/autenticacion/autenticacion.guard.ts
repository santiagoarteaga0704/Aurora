import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { ExcepcionNegocio } from '../errores/excepcion-negocio'
import { ContextoService } from './contexto.service'
import { CLAVE_OPCIONAL, CLAVE_PUBLICO } from './decoradores'

/**
 * Guardia de sesion, global. Por defecto toda ruta exige token valido; se abre
 * con @Publico() o se relaja con @Opcional().
 *
 * Cerrado por defecto y abierto por excepcion: al revés, olvidar un decorador
 * dejaria un endpoint sin proteger, y ese olvido no se nota hasta que alguien lo
 * encuentra.
 */
@Injectable()
export class AutenticacionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly contexto: ContextoService
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const destinos = [ctx.getHandler(), ctx.getClass()]
    const esPublico = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, destinos)
    if (esPublico) return true

    const req = ctx.switchToHttp().getRequest<Request>()
    const token = ContextoService.bearerDe(req.header('authorization'))
    const usuario = await this.contexto.desdeToken(token)

    const esOpcional = this.reflector.getAllAndOverride<boolean>(CLAVE_OPCIONAL, destinos)
    if (esOpcional) {
      req.usuario = usuario
      return true
    }

    if (!usuario) {
      throw ExcepcionNegocio.noAutenticado(
        token ? 'La sesion expiro o el token no es valido' : 'Necesitas iniciar sesion'
      )
    }

    req.usuario = usuario
    return true
  }
}
