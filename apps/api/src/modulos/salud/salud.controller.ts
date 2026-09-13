import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { Publico } from '../../nucleo/autenticacion/decoradores'

/**
 * Salud del servicio.
 *
 * El PWA lo consulta para decidir si esta realmente en linea: tener red no
 * alcanza, porque el navegador puede estar conectado a un wifi sin salida o la
 * base puede estar caida. De esta respuesta depende si la venta se registra
 * contra el servidor o se encola en IndexedDB.
 */
@ApiTags('salud')
@Controller('api/salud')
export class SaludController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Publico()
  @ApiOperation({ summary: 'Estado del servicio y de la base de datos' })
  async estado() {
    return {
      servicio: 'aurora-api',
      version: '1.0.0',
      bd: await this.prisma.estaViva(),
      hora: new Date().toISOString(),
    }
  }
}
