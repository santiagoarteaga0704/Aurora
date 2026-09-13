import { Module } from '@nestjs/common'
import { CatalogoModule } from '../catalogo/catalogo.module'
import { CajaController } from './caja.controller'
import { CajaService } from './caja.service'

/**
 * CajaService se exporta porque el modulo de pagos lo necesita: un cobro en
 * efectivo de mostrador tiene que entrar solo a la caja abierta, o el arqueo
 * mediria la memoria de la cajera en vez del dinero.
 */
@Module({
  imports: [CatalogoModule],
  controllers: [CajaController],
  providers: [CajaService],
  exports: [CajaService],
})
export class CajaModule {}
