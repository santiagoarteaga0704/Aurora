import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

/**
 * Global porque practicamente todos los modulos de negocio necesitan la base.
 * Declararlo una vez evita repetir el import en los doce modulos.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
