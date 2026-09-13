import { Module } from '@nestjs/common'
import { CatalogoController } from './catalogo.controller'
import { CatalogoService } from './catalogo.service'
import { PreciosService } from './precios.service'

@Module({
  controllers: [CatalogoController],
  providers: [CatalogoService, PreciosService],
  exports: [CatalogoService, PreciosService],
})
export class CatalogoModule {}
