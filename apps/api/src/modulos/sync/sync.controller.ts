import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { consultaSyncSchema, loteSyncSchema, PERMISOS } from '@aurora/contratos'
import type { DatosConsultaSync, DatosLoteSync } from '@aurora/contratos'
import { zod } from '../../nucleo/validacion/zod-validacion.pipe'
import { pagina } from '../../nucleo/respuesta/sobre'
import { BitacoraService } from '../../nucleo/bitacora/bitacora.service'
import {
  DispositivoActual,
  RequierePermiso,
  UsuarioActual,
} from '../../nucleo/autenticacion/decoradores'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'
import { SyncService } from './sync.service'

/**
 * Sincronizacion de lo que se hizo sin conexion.
 *
 * Exige el permiso de vender, que es el mismo que exige el endpoint normal: si
 * sincronizar pidiera menos, seria una puerta de atras para registrar ventas.
 */
@ApiTags('sync')
@Controller('api/sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('lote')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.VENTA_CREAR)
  @ApiOperation({ summary: 'Aplica en orden las operaciones hechas sin conexion' })
  lote(
    @Body(zod(loteSyncSchema)) datos: DatosLoteSync,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @DispositivoActual() dispositivo: string | null,
    @Req() req: Request
  ) {
    return this.sync.lote(datos, usuario, dispositivo, BitacoraService.contextoDe(req))
  }

  @Get('operaciones')
  @RequierePermiso(PERMISOS.VENTA_VER)
  @ApiOperation({ summary: 'Operaciones sincronizadas, con su resultado' })
  async listar(
    @Query(zod(consultaSyncSchema)) filtros: DatosConsultaSync,
    @UsuarioActual() usuario: UsuarioAutenticado
  ) {
    const { total, items } = await this.sync.listar(filtros, usuario)
    return pagina(items, total, filtros)
  }

  @Get('conflictos')
  @RequierePermiso(PERMISOS.VENTA_VER)
  @ApiOperation({ summary: 'Cuantas operaciones quedaron sin aplicar' })
  conflictos(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.sync.pendientesDeRevisar(usuario)
  }
}
