import { Global, Module } from '@nestjs/common'
import { NotificacionesController } from './notificaciones.controller'
import { NotificacionesService } from './notificaciones.service'

/**
 * Global, igual que la bitacora y por el mismo motivo: casi todos los modulos
 * necesitan avisar algo, e importarlo uno por uno crearia un nudo de
 * dependencias por algo que es infraestructura y no negocio.
 */
@Global()
@Module({
  controllers: [NotificacionesController],
  providers: [NotificacionesService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
