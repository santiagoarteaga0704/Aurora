import { Module } from '@nestjs/common'
import { PromocionesController } from './promociones.controller'
import { PromocionesService } from './promociones.service'

/**
 * PromocionesService se exporta porque el modulo de ventas lo necesita: el
 * descuento se calcula al registrar el pedido, no antes.
 */
@Module({
  controllers: [PromocionesController],
  providers: [PromocionesService],
  exports: [PromocionesService],
})
export class PromocionesModule {}
