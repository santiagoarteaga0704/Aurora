import { Module } from '@nestjs/common'
import { ProbadorController } from './probador.controller'
import { MedidasService } from './medidas.service'
import { TallasService } from './tallas.service'
import { PruebasService } from './pruebas.service'

/**
 * Probador virtual.
 *
 * Exporta `PruebasService` porque el modulo de ventas necesita marcar la
 * conversion al registrar un pedido: sin ese aviso, el reporte de efectividad
 * del probador corre bien y devuelve 0% para siempre.
 */
@Module({
  controllers: [ProbadorController],
  providers: [MedidasService, TallasService, PruebasService],
  exports: [PruebasService],
})
export class ProbadorModule {}
