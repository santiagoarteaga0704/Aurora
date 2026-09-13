import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { actualizarDireccionSchema, direccionSchema } from '@aurora/contratos'
import type { DatosActualizarDireccion, DatosDireccion } from '@aurora/contratos'
import { zod } from '../../nucleo/validacion/zod-validacion.pipe'
import { conMensaje, creado } from '../../nucleo/respuesta/sobre'
import { BitacoraService } from '../../nucleo/bitacora/bitacora.service'
import { UsuarioActual } from '../../nucleo/autenticacion/decoradores'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'
import { ClientesService } from './clientes.service'

/**
 * Cuenta del cliente. No lleva @RequierePermiso: cada quien administra lo suyo,
 * y el servicio resuelve el cliente a partir de la sesion, nunca de un id que
 * venga en la peticion.
 */
@ApiTags('clientes')
@Controller('api/clientes/mis-direcciones')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  @ApiOperation({ summary: 'Direcciones de entrega del cliente' })
  listar(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.clientes.misDirecciones(usuario)
  }

  @Post()
  @ApiOperation({ summary: 'Agrega una direccion' })
  async agregar(
    @Body(zod(direccionSchema)) datos: DatosDireccion,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    return creado(
      await this.clientes.agregar(datos, usuario, BitacoraService.contextoDe(req)),
      'Direccion agregada'
    )
  }

  @Put(':id')
  @ApiOperation({ summary: 'Edita una direccion' })
  async actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body(zod(actualizarDireccionSchema)) datos: DatosActualizarDireccion,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    return conMensaje(
      await this.clientes.actualizar(id, datos, usuario, BitacoraService.contextoDe(req)),
      'Direccion actualizada'
    )
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Quita una direccion' })
  async quitar(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    return conMensaje(
      await this.clientes.quitar(id, usuario, BitacoraService.contextoDe(req)),
      'Direccion quitada'
    )
  }
}
