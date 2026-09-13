import { Module } from '@nestjs/common'
import { CatalogoModule } from '../catalogo/catalogo.module'
import { InventarioModule } from '../inventario/inventario.module'
import { CajaModule } from '../caja/caja.module'
import { PromocionesModule } from '../promociones/promociones.module'
import { ProbadorModule } from '../probador/probador.module'
import { CarritoController, PagosController, PedidosController } from './ventas.controller'
import { CarritoService } from './carrito.service'
import { PedidosService } from './pedidos.service'
import { PagosService } from './pagos.service'

/**
 * Cadena de venta: carrito, pedido y pago.
 *
 * Depende de CatalogoModule por PreciosService (el precio lo decide el servidor)
 * y de InventarioModule por StockService (toda existencia se mueve por la misma
 * puerta, para que el kardex quede completo).
 *
 * Y de ProbadorModule para avisarle que prendas probadas terminaron en compra.
 */
@Module({
  imports: [CatalogoModule, InventarioModule, CajaModule, PromocionesModule, ProbadorModule],
  controllers: [CarritoController, PedidosController, PagosController],
  providers: [CarritoService, PedidosService, PagosService],
  exports: [PedidosService, PagosService],
})
export class VentasModule {}
