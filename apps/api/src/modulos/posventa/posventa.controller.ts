import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import {
  actualizarEnvioSchema,
  consultaDevolucionesSchema,
  consultaEnviosSchema,
  crearEnvioSchema,
  PERMISOS,
  recibirDevolucionSchema,
  reembolsarSchema,
  resolverDevolucionSchema,
  solicitarDevolucionSchema,
} from '@aurora/contratos'
import type {
  DatosActualizarEnvio,
  DatosConsultaDevoluciones,
  DatosConsultaEnvios,
  DatosCrearEnvio,
  DatosReembolsar,
  DatosRecibirDevolucion,
  DatosResolverDevolucion,
  DatosSolicitarDevolucion,
} from '@aurora/contratos'
import { zod } from '../../nucleo/validacion/zod-validacion.pipe'
import { conMensaje, creado, pagina } from '../../nucleo/respuesta/sobre'
import { BitacoraService } from '../../nucleo/bitacora/bitacora.service'
import { RequierePermiso, UsuarioActual } from '../../nucleo/autenticacion/decoradores'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'
import { DevolucionesService } from './devoluciones.service'
import { EnviosService } from './envios.service'

function aBigInt(valor: string): bigint {
  if (!/^\d+$/.test(valor)) {
    throw ExcepcionNegocio.validacion({ id: 'El identificador no es valido' })
  }
  return BigInt(valor)
}

@ApiTags('devoluciones')
@Controller('api/devoluciones')
export class DevolucionesController {
  constructor(private readonly devoluciones: DevolucionesService) {}

  /** Sin @RequierePermiso: la clienta solicita la devolucion de lo suyo. */
  @Post()
  @ApiOperation({ summary: 'Solicita la devolucion de articulos de un pedido entregado' })
  async solicitar(
    @Body(zod(solicitarDevolucionSchema)) datos: DatosSolicitarDevolucion,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const d = await this.devoluciones.solicitar(datos, usuario, BitacoraService.contextoDe(req))
    return creado(d, `Devolucion ${d.numero} solicitada`)
  }

  @Get()
  @ApiOperation({ summary: 'Devoluciones: las propias para un cliente, las de la sucursal para el personal' })
  async listar(
    @Query(zod(consultaDevolucionesSchema)) filtros: DatosConsultaDevoluciones,
    @UsuarioActual() usuario: UsuarioAutenticado
  ) {
    const { items, total } = await this.devoluciones.listar(filtros, usuario)
    return pagina(items, total, filtros)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una devolucion' })
  detalle(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.devoluciones.detalle(aBigInt(id), usuario)
  }

  @Post(':id/resolver')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.DEVOLUCION_GESTIONAR)
  @ApiOperation({ summary: 'Aprueba o rechaza la solicitud' })
  async resolver(
    @Param('id') id: string,
    @Body(zod(resolverDevolucionSchema)) datos: DatosResolverDevolucion,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const d = await this.devoluciones.resolver(
      aBigInt(id),
      datos,
      usuario,
      BitacoraService.contextoDe(req)
    )
    return conMensaje(d, datos.aprobada ? 'Devolucion aprobada' : 'Devolucion rechazada')
  }

  @Post(':id/recibir')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.DEVOLUCION_GESTIONAR)
  @ApiOperation({ summary: 'Recibe las prendas y decide que vuelve al stock' })
  async recibir(
    @Param('id') id: string,
    @Body(zod(recibirDevolucionSchema)) datos: DatosRecibirDevolucion,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const d = await this.devoluciones.recibir(
      aBigInt(id),
      datos,
      usuario,
      BitacoraService.contextoDe(req)
    )
    return conMensaje(d, `Devolucion ${d.numero} recibida`)
  }

  @Post(':id/reembolsar')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.DEVOLUCION_GESTIONAR)
  @ApiOperation({ summary: 'Registra el reembolso al cliente' })
  async reembolsar(
    @Param('id') id: string,
    @Body(zod(reembolsarSchema)) datos: DatosReembolsar,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const d = await this.devoluciones.reembolsar(
      aBigInt(id),
      datos,
      usuario,
      BitacoraService.contextoDe(req)
    )
    return conMensaje(d, `Reembolso de ${d.monto_reembolso} BOB registrado`)
  }
}

@ApiTags('envios')
@Controller('api/envios')
export class EnviosController {
  constructor(private readonly envios: EnviosService) {}

  @Get()
  @RequierePermiso(PERMISOS.VENTA_DESPACHAR, PERMISOS.VENTA_VER)
  @ApiOperation({ summary: 'Envios de la sucursal; un repartidor ve su hoja de ruta' })
  async listar(
    @Query(zod(consultaEnviosSchema)) filtros: DatosConsultaEnvios,
    @UsuarioActual() usuario: UsuarioAutenticado
  ) {
    const { items, total } = await this.envios.listar(filtros, usuario)
    return pagina(items, total, filtros)
  }

  @Get(':id')
  @RequierePermiso(PERMISOS.VENTA_DESPACHAR, PERMISOS.VENTA_VER)
  @ApiOperation({ summary: 'Detalle de un envio' })
  detalle(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.envios.detalle(aBigInt(id), usuario)
  }

  @Post()
  @RequierePermiso(PERMISOS.VENTA_DESPACHAR)
  @ApiOperation({ summary: 'Crea el envio de un pedido a domicilio' })
  async crear(
    @Body(zod(crearEnvioSchema)) datos: DatosCrearEnvio,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const e = await this.envios.crear(datos, usuario, BitacoraService.contextoDe(req))
    return creado(e, `Envio del pedido ${e.pedido_numero} creado`)
  }

  @Put(':id')
  @RequierePermiso(PERMISOS.VENTA_DESPACHAR)
  @ApiOperation({ summary: 'Avanza el envio; entregarlo cierra el pedido' })
  async actualizar(
    @Param('id') id: string,
    @Body(zod(actualizarEnvioSchema)) datos: DatosActualizarEnvio,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const e = await this.envios.actualizar(
      aBigInt(id),
      datos,
      usuario,
      BitacoraService.contextoDe(req)
    )
    return conMensaje(e, `Envio ${e.estado}`)
  }
}
