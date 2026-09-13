import { Module } from '@nestjs/common'
import { ReportesModule } from '../reportes/reportes.module'
import { AsistenteController } from './asistente.controller'
import { AsistenteService } from './asistente.service'
import { InterpreteService } from './interprete.service'
import { ModeloService } from './modelo.service'

/**
 * Asistente conversacional.
 *
 * Depende de ReportesModule y de nada mas: el asistente no consulta la base por
 * su cuenta, le pide al motor de reportes que ejecute una plantilla. Eso es lo
 * que garantiza que no pueda leer nada que la pantalla de reportes no pueda
 * leer tambien, con los mismos permisos y el mismo alcance por sucursal.
 */
@Module({
  imports: [ReportesModule],
  controllers: [AsistenteController],
  providers: [AsistenteService, InterpreteService, ModeloService],
})
export class AsistenteModule {}
