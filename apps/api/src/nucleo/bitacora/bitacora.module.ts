import { Global, Module } from '@nestjs/common'
import { BitacoraService } from './bitacora.service'

@Global()
@Module({
  providers: [BitacoraService],
  exports: [BitacoraService],
})
export class BitacoraModule {}
