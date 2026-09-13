import { Module } from '@nestjs/common'
import { ClientesController, PublicoController } from './clientes.controller'
import { ClientesService } from './clientes.service'

@Module({
  controllers: [ClientesController, PublicoController],
  providers: [ClientesService],
})
export class ClientesModule {}
