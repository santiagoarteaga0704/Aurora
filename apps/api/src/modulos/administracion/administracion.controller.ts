import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import {
  actualizarUsuarioSchema,
  aprobarMayoristaSchema,
  consultaUsuariosSchema,
  crearUsuarioSchema,
  PERMISOS,
  permisosDeRolSchema,
  rolSchema,
} from '@aurora/contratos'
import type {
  DatosActualizarUsuario,
  DatosAprobarMayorista,
  DatosConsultaUsuarios,
  DatosCrearUsuario,
  DatosPermisosDeRol,
  DatosRol,
} from '@aurora/contratos'
import { zod } from '../../nucleo/validacion/zod-validacion.pipe'
import { conMensaje, creado, pagina } from '../../nucleo/respuesta/sobre'
import { BitacoraService } from '../../nucleo/bitacora/bitacora.service'
import { RequierePermiso, UsuarioActual } from '../../nucleo/autenticacion/decoradores'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'
import { AdministracionService } from './administracion.service'

@ApiTags('usuarios')
@Controller('api/usuarios')
export class UsuariosController {
  constructor(private readonly admin: AdministracionService) {}

  @Get()
  @RequierePermiso(PERMISOS.USUARIO_VER)
  @ApiOperation({ summary: 'Usuarios de la sucursal' })
  async listar(
    @Query(zod(consultaUsuariosSchema)) filtros: DatosConsultaUsuarios,
    @UsuarioActual() usuario: UsuarioAutenticado
  ) {
    const { items, total } = await this.admin.usuarios(filtros, usuario)
    return pagina(items, total, filtros)
  }

  @Post()
  @RequierePermiso(PERMISOS.USUARIO_CREAR)
  @ApiOperation({ summary: 'Alta de personal' })
  async crear(
    @Body(zod(crearUsuarioSchema)) datos: DatosCrearUsuario,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    return creado(
      await this.admin.crearUsuario(datos, usuario, BitacoraService.contextoDe(req)),
      'Usuario creado'
    )
  }

  @Put(':id')
  @RequierePermiso(PERMISOS.USUARIO_EDITAR)
  @ApiOperation({ summary: 'Edicion de un usuario' })
  async actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body(zod(actualizarUsuarioSchema)) datos: DatosActualizarUsuario,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    return conMensaje(
      await this.admin.actualizarUsuario(id, datos, usuario, BitacoraService.contextoDe(req)),
      'Usuario actualizado'
    )
  }

  @Delete(':id')
  @RequierePermiso(PERMISOS.USUARIO_ELIMINAR)
  @ApiOperation({ summary: 'Baja logica de un usuario' })
  async desactivar(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    await this.admin.desactivarUsuario(id, usuario, BitacoraService.contextoDe(req))
    return conMensaje(null, 'Usuario dado de baja')
  }

  @Post(':id/aprobar-mayorista')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.USUARIO_EDITAR)
  @ApiOperation({ summary: 'Habilita o quita los precios de mayoreo de un cliente' })
  async aprobarMayorista(
    @Param('id', ParseIntPipe) id: number,
    @Body(zod(aprobarMayoristaSchema)) datos: DatosAprobarMayorista,
    @Req() req: Request
  ) {
    return conMensaje(
      await this.admin.aprobarMayorista(id, datos, BitacoraService.contextoDe(req)),
      datos.aprobado ? 'Mayorista aprobado' : 'Aprobacion de mayorista retirada'
    )
  }
}

@ApiTags('roles')
@Controller('api')
export class RolesController {
  constructor(private readonly admin: AdministracionService) {}

  @Get('roles')
  @RequierePermiso(PERMISOS.ROL_GESTIONAR, PERMISOS.USUARIO_VER)
  @ApiOperation({ summary: 'Roles con sus permisos y cuantos usuarios los tienen' })
  roles() {
    return this.admin.roles()
  }

  @Get('permisos')
  @RequierePermiso(PERMISOS.ROL_GESTIONAR)
  @ApiOperation({ summary: 'Permisos disponibles, agrupados por modulo' })
  permisos() {
    return this.admin.permisosDisponibles()
  }

  @Post('roles')
  @RequierePermiso(PERMISOS.ROL_GESTIONAR)
  @ApiOperation({ summary: 'Crea un rol' })
  async crearRol(@Body(zod(rolSchema)) datos: DatosRol, @Req() req: Request) {
    return creado(await this.admin.crearRol(datos, BitacoraService.contextoDe(req)), 'Rol creado')
  }

  @Put('roles/:id/permisos')
  @RequierePermiso(PERMISOS.ROL_GESTIONAR)
  @ApiOperation({ summary: 'Reemplaza los permisos de un rol' })
  async definirPermisos(
    @Param('id', ParseIntPipe) id: number,
    @Body(zod(permisosDeRolSchema)) datos: DatosPermisosDeRol,
    @Req() req: Request
  ) {
    return conMensaje(
      await this.admin.definirPermisos(id, datos, BitacoraService.contextoDe(req)),
      'Permisos actualizados'
    )
  }
}
