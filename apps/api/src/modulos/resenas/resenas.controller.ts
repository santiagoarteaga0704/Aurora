import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import {
  consultaResenasSchema,
  escribirResenaSchema,
  moderarResenaSchema,
  PERMISOS,
} from '@aurora/contratos'
import type {
  DatosConsultaResenas,
  DatosEscribirResena,
  DatosModerarResena,
} from '@aurora/contratos'
import { zod } from '../../nucleo/validacion/zod-validacion.pipe'
import { creado, pagina } from '../../nucleo/respuesta/sobre'
import {
  Opcional,
  Publico,
  RequierePermiso,
  UsuarioActual,
  UsuarioSiHay,
} from '../../nucleo/autenticacion/decoradores'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'
import { BitacoraService } from '../../nucleo/bitacora/bitacora.service'
import { ResenasService } from './resenas.service'

@ApiTags('resenas')
@Controller('api/resenas')
export class ResenasController {
  constructor(private readonly resenas: ResenasService) {}

  /**
   * Listado publico. Sin sesion se ven solo las aprobadas; quien puede moderar
   * las ve todas, para poder revisarlas.
   */
  @Get()
  @Opcional()
  @ApiOperation({ summary: 'Resenias de un producto' })
  async listar(
    @Query(zod(consultaResenasSchema)) filtros: DatosConsultaResenas,
    @UsuarioSiHay() usuario: UsuarioAutenticado | null
  ) {
    const { total, items } = await this.resenas.listar(filtros, usuario)
    return pagina(items, total, filtros)
  }

  @Get('resumen/:productoId')
  @Publico()
  @ApiOperation({ summary: 'Promedio, reparto por estrellas y que dicen del talle' })
  resumen(@Param('productoId', ParseIntPipe) productoId: number) {
    return this.resenas.resumen(productoId)
  }

  /** Lo que la clienta compro, recibio y todavia no califico. */
  @Get('pendientes')
  @ApiOperation({ summary: 'Compras sobre las que se puede opinar' })
  pendientes(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.resenas.pendientesDe(usuario)
  }

  @Post()
  @ApiOperation({ summary: 'Opinar sobre una prenda comprada' })
  async escribir(
    @Body(zod(escribirResenaSchema)) datos: DatosEscribirResena,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const r = await this.resenas.escribir(datos, usuario, BitacoraService.contextoDe(req))
    return creado(
      r,
      r.aprobado
        ? 'Gracias por opinar'
        : 'Gracias por opinar. Tu comentario se publica despues de una revision'
    )
  }

  @Put(':id/moderar')
  @RequierePermiso(PERMISOS.RESENA_MODERAR)
  @ApiOperation({ summary: 'Aprobar o rechazar una resenia con comentario' })
  moderar(
    @Param('id') id: string,
    @Body(zod(moderarResenaSchema)) datos: DatosModerarResena,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    return this.resenas.moderar(BigInt(id), datos, usuario, BitacoraService.contextoDe(req))
  }
}
