import { Module } from '@nestjs/common'
import { CatalogoModule } from '../catalogo/catalogo.module'
import { InventarioModule } from '../inventario/inventario.module'
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
 */
@Module({
  imports: [CatalogoModule, InventarioModule],
  controllers: [CarritoController, PedidosController, PagosController],
  providers: [CarritoService, PedidosService, PagosService],
  exports: [PedidosService],
})
export class VentasModule {}
