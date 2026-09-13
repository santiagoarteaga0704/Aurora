import { Module } from '@nestjs/common'
import { InventarioController, TransferenciasController } from './inventario.controller'
import { InventarioService } from './inventario.service'
import { TransferenciasService } from './transferencias.service'
import { StockService } from './stock.service'

/**
 * StockService se exporta porque no es solo de este modulo: compras, ventas,
 * punto de venta y devoluciones mueven stock y tienen que hacerlo por la misma
 * puerta, para que el kardex quede completo.
 */
@Module({
  controllers: [InventarioController, TransferenciasController],
  providers: [InventarioService, TransferenciasService, StockService],
  exports: [StockService],
})
export class InventarioModule {}
