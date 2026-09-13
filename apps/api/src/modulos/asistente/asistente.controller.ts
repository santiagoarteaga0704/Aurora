import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { consultaConversacionesSchema, PERMISOS, preguntarSchema } from '@aurora/contratos'
import type { DatosConsultaConversaciones, DatosPreguntar } from '@aurora/contratos'
import { zod } from '../../nucleo/validacion/zod-validacion.pipe'
import { pagina } from '../../nucleo/respuesta/sobre'
import { BitacoraService } from '../../nucleo/bitacora/bitacora.service'
import { RequierePermiso, UsuarioActual } from '../../nucleo/autenticacion/decoradores'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'
import { AsistenteService } from './asistente.service'
import { ModeloService } from './modelo.service'

function aBigInt(valor: string): bigint {
  if (!/^\d+$/.test(valor)) {
    throw ExcepcionNegocio.validacion({ id: 'El identificador no es valido' })
  }
  return BigInt(valor)
}

@ApiTags('asistente')
@Controller('api/asistente')
export class AsistenteController {
  constructor(
    private readonly asistente: AsistenteService,
    private readonly modelo: ModeloService
  ) {}

  /**
   * Que capacidades tiene el asistente ahora mismo.
   *
   * El front lo usa para decir con honestidad si esta corriendo solo con el
   * interprete propio. Callarlo haria que una respuesta pobre pareciera un
   * error del sistema en vez de una configuracion pendiente.
   */
  @Get('estado')
  @RequierePermiso(PERMISOS.IA_ASISTENTE)
  @ApiOperation({ summary: 'Capacidades disponibles del asistente' })
  estado() {
    return {
      interprete: true,
      modelo: this.modelo.disponible,
      nota: this.modelo.disponible
        ? 'Interprete propio con apoyo de modelo de lenguaje'
        : 'Solo interprete propio: no hay clave de IA configurada',
    }
  }

  @Post('preguntar')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.IA_ASISTENTE)
  @ApiOperation({ summary: 'Pregunta en lenguaje natural; devuelve el reporte si corresponde' })
  preguntar(
    @Body(zod(preguntarSchema)) datos: DatosPreguntar,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    return this.asistente.preguntar(datos, usuario, BitacoraService.contextoDe(req))
  }

  @Get('conversaciones')
  @RequierePermiso(PERMISOS.IA_ASISTENTE)
  @ApiOperation({ summary: 'Conversaciones del usuario' })
  async conversaciones(
    @Query(zod(consultaConversacionesSchema)) filtros: DatosConsultaConversaciones,
    @UsuarioActual() usuario: UsuarioAutenticado
  ) {
    const { items, total } = await this.asistente.conversaciones(filtros, usuario)
    return pagina(items, total, filtros)
  }

  @Get('conversaciones/:id')
  @RequierePermiso(PERMISOS.IA_ASISTENTE)
  @ApiOperation({ summary: 'Mensajes de una conversacion' })
  mensajes(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.asistente.mensajes(aBigInt(id), usuario)
  }
}
