import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import {
  ajusteInventarioSchema,
  consultaInventarioSchema,
  consultaMovimientosSchema,
  consultaTransferenciasSchema,
  crearTransferenciaSchema,
  PERMISOS,
  rechazarTransferenciaSchema,
  recibirTransferenciaSchema,
} from '@aurora/contratos'
import type {
  DatosAjusteInventario,
  DatosConsultaInventario,
  DatosConsultaMovimientos,
  DatosConsultaTransferencias,
  DatosCrearTransferencia,
  DatosRecibirTransferencia,
} from '@aurora/contratos'
import { zod } from '../../nucleo/validacion/zod-validacion.pipe'
import { conMensaje, creado, pagina } from '../../nucleo/respuesta/sobre'
import { BitacoraService } from '../../nucleo/bitacora/bitacora.service'
import { RequierePermiso, UsuarioActual } from '../../nucleo/autenticacion/decoradores'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'
import { InventarioService } from './inventario.service'
import { TransferenciasService } from './transferencias.service'

/** Los identificadores de documento son BIGINT y llegan como texto en la URL. */
function aBigInt(valor: string): bigint {
  if (!/^\d+$/.test(valor)) {
    throw ExcepcionNegocio.validacion({ id: 'El identificador no es valido' })
  }
  return BigInt(valor)
}

@ApiTags('inventario')
@Controller('api/inventario')
export class InventarioController {
  constructor(private readonly inventario: InventarioService) {}

  @Get()
  @RequierePermiso(PERMISOS.INVENTARIO_VER)
  @ApiOperation({ summary: 'Stock por variante y almacen' })
  async consultar(
    @Query(zod(consultaInventarioSchema)) filtros: DatosConsultaInventario,
    @UsuarioActual() usuario: UsuarioAutenticado
  ) {
    const { items, total } = await this.inventario.consultar(filtros, usuario)
    return pagina(items, total, filtros)
  }

  @Get('sucursal')
  @RequierePermiso(PERMISOS.INVENTARIO_VER)
  @ApiOperation({ summary: 'Stock consolidado por sucursal (vista v_stock_sucursal)' })
  async porSucursal(
    @Query(zod(consultaInventarioSchema)) filtros: DatosConsultaInventario,
    @UsuarioActual() usuario: UsuarioAutenticado
  ) {
    const { items, total } = await this.inventario.porSucursal(filtros, usuario)
    return pagina(items, total, filtros)
  }

  @Get('movimientos')
  @RequierePermiso(PERMISOS.INVENTARIO_VER)
  @ApiOperation({ summary: 'Kardex de movimientos' })
  async movimientos(
    @Query(zod(consultaMovimientosSchema)) filtros: DatosConsultaMovimientos,
    @UsuarioActual() usuario: UsuarioAutenticado
  ) {
    const { items, total } = await this.inventario.movimientos(filtros, usuario)
    return pagina(items, total, filtros)
  }

  @Post('ajuste')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.INVENTARIO_AJUSTAR)
  @ApiOperation({ summary: 'Ajusta el stock al resultado de un conteo fisico' })
  async ajustar(
    @Body(zod(ajusteInventarioSchema)) datos: DatosAjusteInventario,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const resultado = await this.inventario.ajustar(
      datos,
      usuario,
      BitacoraService.contextoDe(req)
    )
    return conMensaje(
      resultado,
      resultado.diferencia === 0
        ? 'El conteo coincide con el sistema'
        : `Ajuste registrado: ${resultado.diferencia > 0 ? '+' : ''}${resultado.diferencia} unidad(es)`
    )
  }
}

@ApiTags('transferencias')
@Controller('api/transferencias')
export class TransferenciasController {
  constructor(private readonly transferencias: TransferenciasService) {}

  @Get()
  @RequierePermiso(PERMISOS.INVENTARIO_VER)
  @ApiOperation({ summary: 'Transferencias de la sucursal' })
  async listar(
    @Query(zod(consultaTransferenciasSchema)) filtros: DatosConsultaTransferencias,
    @UsuarioActual() usuario: UsuarioAutenticado
  ) {
    const { items, total } = await this.transferencias.listar(filtros, usuario)
    return pagina(items, total, filtros)
  }

  @Get(':id')
  @RequierePermiso(PERMISOS.INVENTARIO_VER)
  @ApiOperation({ summary: 'Detalle de una transferencia' })
  detalle(@Param('id') id: string) {
    return this.transferencias.detalle(aBigInt(id))
  }

  @Post()
  @RequierePermiso(PERMISOS.INVENTARIO_TRANSFERIR)
  @ApiOperation({ summary: 'Solicita una transferencia entre almacenes' })
  async crear(
    @Body(zod(crearTransferenciaSchema)) datos: DatosCrearTransferencia,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const t = await this.transferencias.crear(datos, usuario, BitacoraService.contextoDe(req))
    return creado(t, `Transferencia ${t.numero} solicitada`)
  }

  @Post(':id/aprobar')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.INVENTARIO_TRANSFERIR)
  @ApiOperation({ summary: 'Aprueba y despacha: descuenta el stock del origen' })
  async aprobar(
    @Param('id') id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const t = await this.transferencias.aprobar(
      aBigInt(id),
      usuario,
      BitacoraService.contextoDe(req)
    )
    return conMensaje(t, `Transferencia ${t.numero} despachada`)
  }

  @Post(':id/recibir')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.INVENTARIO_TRANSFERIR)
  @ApiOperation({ summary: 'Recibe en destino lo que realmente llego' })
  async recibir(
    @Param('id') id: string,
    @Body(zod(recibirTransferenciaSchema)) datos: DatosRecibirTransferencia,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const t = await this.transferencias.recibir(
      aBigInt(id),
      datos,
      usuario,
      BitacoraService.contextoDe(req)
    )
    return conMensaje(
      t,
      t.faltantes.length > 0
        ? `Transferencia ${t.numero} recibida con ${t.faltantes.length} faltante(s)`
        : `Transferencia ${t.numero} recibida completa`
    )
  }

  @Post(':id/rechazar')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.INVENTARIO_TRANSFERIR)
  @ApiOperation({ summary: 'Rechaza una transferencia todavia no despachada' })
  async rechazar(
    @Param('id') id: string,
    @Body(zod(rechazarTransferenciaSchema)) datos: { motivo: string },
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const t = await this.transferencias.rechazar(
      aBigInt(id),
      datos.motivo,
      usuario,
      BitacoraService.contextoDe(req)
    )
    return conMensaje(t, `Transferencia ${t.numero} rechazada`)
  }
}
