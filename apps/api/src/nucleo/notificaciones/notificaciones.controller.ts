import { Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { consultaNotificacionesSchema } from '@aurora/contratos'
import type { DatosConsultaNotificaciones } from '@aurora/contratos'
import { zod } from '../validacion/zod-validacion.pipe'
import { pagina } from '../respuesta/sobre'
import { UsuarioActual } from '../autenticacion/decoradores'
import type { UsuarioAutenticado } from '../autenticacion/tipos'
import { NotificacionesService } from './notificaciones.service'

/**
 * Avisos del usuario de la sesion.
 *
 * Sin @RequierePermiso y sin ningun endpoint que reciba un id de usuario: cada
 * quien ve los suyos, y no hay forma de pedir los de otro.
 */
@ApiTags('notificaciones')
@Controller('api/notificaciones')
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Avisos del usuario' })
  async listar(
    @Query(zod(consultaNotificacionesSchema)) filtros: DatosConsultaNotificaciones,
    @UsuarioActual() usuario: UsuarioAutenticado
  ) {
    const { total, items } = await this.notificaciones.listar(filtros, usuario)
    return pagina(items, total, filtros)
  }

  /** Lo unico que la campanita consulta en reposo: un entero. */
  @Get('sin-leer')
  @ApiOperation({ summary: 'Cuantos avisos faltan leer' })
  sinLeer(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.notificaciones.sinLeer(usuario)
  }

  @Post(':id/leida')
  @ApiOperation({ summary: 'Marcar un aviso como leido' })
  marcar(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.notificaciones.marcarLeida(BigInt(id), usuario)
  }

  @Post('leidas')
  @ApiOperation({ summary: 'Marcar todos los avisos como leidos' })
  marcarTodas(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.notificaciones.marcarTodas(usuario)
  }
}
