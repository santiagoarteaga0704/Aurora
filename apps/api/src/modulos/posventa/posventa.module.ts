import { Module } from '@nestjs/common'
import { CatalogoModule } from '../catalogo/catalogo.module'
import { InventarioModule } from '../inventario/inventario.module'
import { DevolucionesController, EnviosController } from './posventa.controller'
import { DevolucionesService } from './devoluciones.service'
import { EnviosService } from './envios.service'

/**
 * Posventa: devoluciones y envios. Las dos cosas que pasan despues de vender, y
 * las dos tocan el inventario y el estado del pedido.
 */
@Module({
  imports: [CatalogoModule, InventarioModule],
  controllers: [DevolucionesController, EnviosController],
  providers: [DevolucionesService, EnviosService],
})
export class PosventaModule {}
