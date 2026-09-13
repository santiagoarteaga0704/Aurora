import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import {
  abrirCajaSchema,
  cerrarCajaSchema,
  consultaCajasSchema,
  movimientoCajaSchema,
  PERMISOS,
} from '@aurora/contratos'
import type {
  DatosAbrirCaja,
  DatosCerrarCaja,
  DatosConsultaCajas,
  DatosMovimientoCaja,
} from '@aurora/contratos'
import { zod } from '../../nucleo/validacion/zod-validacion.pipe'
import { conMensaje, creado, pagina } from '../../nucleo/respuesta/sobre'
import { BitacoraService } from '../../nucleo/bitacora/bitacora.service'
import { RequierePermiso, UsuarioActual } from '../../nucleo/autenticacion/decoradores'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'
import { CajaService } from './caja.service'

function aBigInt(valor: string): bigint {
  if (!/^\d+$/.test(valor)) {
    throw ExcepcionNegocio.validacion({ id: 'El identificador no es valido' })
  }
  return BigInt(valor)
}

@ApiTags('caja')
@Controller('api/caja')
export class CajaController {
  constructor(private readonly caja: CajaService) {}

  @Get('mia')
  @RequierePermiso(PERMISOS.CAJA_OPERAR)
  @ApiOperation({ summary: 'La caja abierta del usuario, si tiene alguna' })
  mia(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.caja.miCaja(usuario)
  }

  @Get()
  @RequierePermiso(PERMISOS.CAJA_OPERAR)
  @ApiOperation({ summary: 'Historial de cajas de la sucursal' })
  async listar(
    @Query(zod(consultaCajasSchema)) filtros: DatosConsultaCajas,
    @UsuarioActual() usuario: UsuarioAutenticado
  ) {
    const { items, total } = await this.caja.listar(filtros, usuario)
    return pagina(items, total, filtros)
  }

  @Get(':id')
  @RequierePermiso(PERMISOS.CAJA_OPERAR)
  @ApiOperation({ summary: 'Detalle de una caja con sus movimientos' })
  detalle(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.caja.detalle(aBigInt(id), usuario)
  }

  @Post('abrir')
  @RequierePermiso(PERMISOS.CAJA_OPERAR)
  @ApiOperation({ summary: 'Abre el turno de caja' })
  async abrir(
    @Body(zod(abrirCajaSchema)) datos: DatosAbrirCaja,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    return creado(
      await this.caja.abrir(datos, usuario, BitacoraService.contextoDe(req)),
      'Caja abierta'
    )
  }

  @Post(':id/movimientos')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.CAJA_OPERAR)
  @ApiOperation({ summary: 'Registra un ingreso o egreso manual' })
  async movimiento(
    @Param('id') id: string,
    @Body(zod(movimientoCajaSchema)) datos: DatosMovimientoCaja,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    return conMensaje(
      await this.caja.registrarMovimiento(
        aBigInt(id),
        datos,
        usuario,
        BitacoraService.contextoDe(req)
      ),
      'Movimiento registrado'
    )
  }

  @Post(':id/cerrar')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.CAJA_OPERAR)
  @ApiOperation({ summary: 'Arqueo y cierre del turno' })
  async cerrar(
    @Param('id') id: string,
    @Body(zod(cerrarCajaSchema)) datos: DatosCerrarCaja,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const caja = await this.caja.cerrar(
      aBigInt(id),
      datos,
      usuario,
      BitacoraService.contextoDe(req)
    )
    const d = caja.diferencia ?? 0
    return conMensaje(
      caja,
      d === 0
        ? 'Caja cerrada y cuadrada'
        : `Caja cerrada con ${d > 0 ? 'sobrante' : 'faltante'} de ${Math.abs(d)} BOB`
    )
  }
}
