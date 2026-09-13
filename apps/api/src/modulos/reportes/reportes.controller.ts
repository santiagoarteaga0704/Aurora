import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import {
  consultaHistorialSchema,
  ejecutarReporteSchema,
  PERMISOS,
} from '@aurora/contratos'
import type { DatosConsultaHistorial, DatosEjecutarReporte } from '@aurora/contratos'
import { zod } from '../../nucleo/validacion/zod-validacion.pipe'
import { pagina } from '../../nucleo/respuesta/sobre'
import { BitacoraService } from '../../nucleo/bitacora/bitacora.service'
import { RequierePermiso, UsuarioActual } from '../../nucleo/autenticacion/decoradores'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'
import { ReportesService } from './reportes.service'

/**
 * Reportes.
 *
 * Quien pide un reporte elige el codigo de una plantilla y manda parametros;
 * nunca manda SQL. Es la misma puerta por la que va a entrar el asistente de IA
 * cuando le pidan "las ventas de ayer en la Ventura": el modelo elegira el
 * codigo y devolvera los parametros, y el resto del camino es este.
 */
@ApiTags('reportes')
@Controller('api/reportes')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Get('plantillas')
  @RequierePermiso(PERMISOS.REPORTE_VER)
  @ApiOperation({ summary: 'Reportes disponibles con sus parametros' })
  plantillas(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.reportes.plantillas(usuario)
  }

  @Get('historial')
  @RequierePermiso(PERMISOS.REPORTE_VER)
  @ApiOperation({ summary: 'Reportes ejecutados' })
  async historial(
    @Query(zod(consultaHistorialSchema)) filtros: DatosConsultaHistorial,
    @UsuarioActual() usuario: UsuarioAutenticado
  ) {
    const { items, total } = await this.reportes.historial(filtros, usuario)
    return pagina(items, total, filtros)
  }

  @Post(':codigo')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.REPORTE_VER)
  @ApiOperation({ summary: 'Ejecuta un reporte con sus parametros' })
  ejecutar(
    @Param('codigo') codigo: string,
    @Body(zod(ejecutarReporteSchema)) datos: DatosEjecutarReporte,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    return this.reportes.ejecutar(codigo, datos, usuario, BitacoraService.contextoDe(req))
  }

  /**
   * Descarga en CSV. Devuelve el archivo directo y no el sobre JSON de siempre:
   * lo que se espera al otro lado es una descarga, no un objeto.
   */
  @Post(':codigo/csv')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.REPORTE_EXPORTAR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Descarga el reporte en CSV' })
  async csv(
    @Param('codigo') codigo: string,
    @Body(zod(ejecutarReporteSchema)) datos: DatosEjecutarReporte,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const { nombre, csv } = await this.reportes.exportarCsv(
      codigo,
      datos,
      usuario,
      BitacoraService.contextoDe(req)
    )
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`)
    res.send(csv)
  }
}
