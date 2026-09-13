import { Module } from '@nestjs/common'
import { VentasModule } from '../ventas/ventas.module'
import { SyncController } from './sync.controller'
import { SyncService } from './sync.service'

/**
 * Sincronizacion por lote.
 *
 * Depende de VentasModule y de nada mas: aplicar una venta sincronizada es
 * llamar al MISMO servicio que atiende una venta de mostrador. Es lo que
 * garantiza que no haya dos caminos para registrar una venta, con dos juegos de
 * reglas que en algun momento dejarian de coincidir.
 */
@Module({
  imports: [VentasModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
