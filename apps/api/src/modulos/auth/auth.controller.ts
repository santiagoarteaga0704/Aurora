import { Body, Controller, Get, HttpCode, Post, Put, Req } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import {
  cambiarPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registroSchema,
} from '@aurora/contratos'
import type {
  DatosCambiarPassword,
  DatosLogin,
  DatosRefresh,
  DatosRegistro,
} from '@aurora/contratos'
import { zod } from '../../nucleo/validacion/zod-validacion.pipe'
import { conMensaje, creado } from '../../nucleo/respuesta/sobre'
import { BitacoraService } from '../../nucleo/bitacora/bitacora.service'
import {
  DispositivoActual,
  Opcional,
  Publico,
  UsuarioActual,
} from '../../nucleo/autenticacion/decoradores'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'
import { AuthService, type ContextoSesion } from './auth.service'

/**
 * Registro, inicio de sesion y manejo de tokens.
 *
 * El contrato es el mismo que declaraba routes.php en el backend anterior, para
 * que el PWA y la app movil no tengan que cambiar nada cuando se migro el stack:
 *
 *   POST /api/auth/registro
 *   POST /api/auth/login
 *   POST /api/auth/refresh
 *   POST /api/auth/logout
 *   GET  /api/auth/yo
 *   PUT  /api/auth/password
 */
@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * El limite de 10 peticiones cada 10 minutos por IP aplica a registro y login:
   * son los dos endpoints donde tiene sentido probar credenciales en masa.
   */
  private static readonly LIMITE_ESTRICTO = { default: { limit: 10, ttl: 600_000 } }

  private contexto(req: Request, dispositivoUuid: string | null): ContextoSesion {
    return { ...BitacoraService.contextoDe(req), dispositivoUuid }
  }

  @Post('registro')
  @Publico()
  @Throttle(AuthController.LIMITE_ESTRICTO)
  @ApiOperation({ summary: 'Alta de un cliente desde la tienda' })
  async registro(
    @Body(zod(registroSchema)) datos: DatosRegistro,
    @Req() req: Request,
    @DispositivoActual() dispositivo: string | null
  ) {
    const tokens = await this.auth.registro(datos, this.contexto(req, dispositivo))
    return creado(
      tokens,
      datos.tipo === 'mayorista'
        ? 'Cuenta creada. Un asesor validara tu NIT para habilitar los precios de mayoreo.'
        : 'Cuenta creada correctamente'
    )
  }

  @Post('login')
  @Publico()
  @HttpCode(200)
  @Throttle(AuthController.LIMITE_ESTRICTO)
  @ApiOperation({ summary: 'Inicia sesion y devuelve el par de tokens' })
  async login(
    @Body(zod(loginSchema)) datos: DatosLogin,
    @Req() req: Request,
    @DispositivoActual() dispositivo: string | null
  ) {
    const tokens = await this.auth.login(datos, this.contexto(req, dispositivo))
    return conMensaje(tokens, 'Sesion iniciada')
  }

  @Post('refresh')
  @Publico()
  @HttpCode(200)
  @ApiOperation({ summary: 'Renueva el token de acceso sin pedir la contrasenia' })
  async refrescar(
    @Body(zod(refreshSchema)) datos: DatosRefresh,
    @Req() req: Request,
    @DispositivoActual() dispositivo: string | null
  ) {
    return this.auth.refrescar(datos.refresh_token, this.contexto(req, dispositivo))
  }

  @Post('logout')
  @Opcional()
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoca el token de refresco' })
  async logout(@Body(zod(logoutSchema)) datos: { refresh_token?: string }, @Req() req: Request) {
    await this.auth.logout(datos.refresh_token, BitacoraService.contextoDe(req))
    return conMensaje(null, 'Sesion cerrada')
  }

  @Get('yo')
  @ApiOperation({ summary: 'Perfil y permisos del usuario de la sesion' })
  async yo(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.auth.perfil(usuario.id)
  }

  @Put('password')
  @ApiOperation({ summary: 'Cambia la contrasenia y cierra las demas sesiones' })
  async cambiarPassword(
    @Body(zod(cambiarPasswordSchema)) datos: DatosCambiarPassword,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    await this.auth.cambiarPassword(usuario.id, datos, BitacoraService.contextoDe(req))
    return conMensaje(
      null,
      'Contrasenia actualizada. Vuelve a iniciar sesion en tus otros dispositivos.'
    )
  }
}
