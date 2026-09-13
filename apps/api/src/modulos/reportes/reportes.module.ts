import { Module } from '@nestjs/common'
import { ReportesController } from './reportes.controller'
import { ReportesService } from './reportes.service'

/**
 * ReportesService se exporta porque el asistente de IA lo va a usar: el modelo
 * elige el codigo de plantilla y devuelve parametros, y quien ejecuta es este
 * mismo servicio. Sin eso, el asistente tendria que armar SQL.
 */
@Module({
  controllers: [ReportesController],
  providers: [ReportesService],
  exports: [ReportesService],
})
export class ReportesModule {}
