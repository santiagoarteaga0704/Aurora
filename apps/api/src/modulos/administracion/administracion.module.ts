import { Module } from '@nestjs/common'
import { RolesController, UsuariosController } from './administracion.controller'
import { AdministracionService } from './administracion.service'

/**
 * Administracion: personal, roles y permisos.
 *
 * Aqui vive el requisito de que los permisos se configuren sin tocar codigo: el
 * administrador crea un rol, le asigna permisos y el cambio rige en la siguiente
 * peticion.
 */
@Module({
  controllers: [UsuariosController, RolesController],
  providers: [AdministracionService],
})
export class AdministracionModule {}
