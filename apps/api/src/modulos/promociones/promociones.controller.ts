import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import {
  campaniaSchema,
  consultaPromocionesSchema,
  PERMISOS,
  promocionSchema,
} from '@aurora/contratos'
import type {
  DatosCampania,
  DatosConsultaPromociones,
  DatosPromocion,
} from '@aurora/contratos'
import { zod } from '../../nucleo/validacion/zod-validacion.pipe'
import { conMensaje, creado, pagina } from '../../nucleo/respuesta/sobre'
import { BitacoraService } from '../../nucleo/bitacora/bitacora.service'
import { Publico, RequierePermiso } from '../../nucleo/autenticacion/decoradores'
import { PromocionesService } from './promociones.service'

@ApiTags('promociones')
@Controller('api')
export class PromocionesController {
  constructor(private readonly promociones: PromocionesService) {}

  /** Publico: el banner de campanias es parte de la vidriera. */
  @Get('campanias')
  @Publico()
  @ApiOperation({ summary: 'Campanias; con vigentes=true solo las que rigen hoy' })
  campanias(@Query('vigentes') vigentes?: string) {
    return this.promociones.campanias(vigentes === 'true')
  }

  @Post('campanias')
  @RequierePermiso(PERMISOS.PROMOCION_GESTIONAR)
  @ApiOperation({ summary: 'Crea una campania' })
  async crearCampania(@Body(zod(campaniaSchema)) datos: DatosCampania, @Req() req: Request) {
    return creado(
      await this.promociones.crearCampania(datos, BitacoraService.contextoDe(req)),
      'Campania creada'
    )
  }

  @Get('promociones')
  @RequierePermiso(PERMISOS.PROMOCION_GESTIONAR)
  @ApiOperation({ summary: 'Promociones configuradas' })
  async listar(@Query(zod(consultaPromocionesSchema)) filtros: DatosConsultaPromociones) {
    const { items, total } = await this.promociones.listar(filtros)
    return pagina(items, total, filtros)
  }

  @Post('promociones')
  @RequierePermiso(PERMISOS.PROMOCION_GESTIONAR)
  @ApiOperation({ summary: 'Crea una promocion' })
  async crear(@Body(zod(promocionSchema)) datos: DatosPromocion, @Req() req: Request) {
    return creado(
      await this.promociones.crear(datos, BitacoraService.contextoDe(req)),
      'Promocion creada'
    )
  }

  @Delete('promociones/:id')
  @RequierePermiso(PERMISOS.PROMOCION_GESTIONAR)
  @ApiOperation({ summary: 'Desactiva una promocion' })
  async desactivar(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return conMensaje(
      await this.promociones.desactivar(id, BitacoraService.contextoDe(req)),
      'Promocion desactivada'
    )
  }
}
