import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

/**
 * Cliente de base de datos.
 *
 * El modelo lo genera `prisma db pull` desde database/schema.postgres.sql, que
 * es la fuente de verdad. Importante: NO usar `prisma db push` ni
 * `prisma migrate` contra esta base. El esquema tiene tres cosas que Prisma no
 * sabe representar y que borraria al sincronizar:
 *
 *   - los CHECK de `inventario` (stock no negativo) y `resena` (1 a 5),
 *   - el indice GIN de busqueda de texto sobre `producto`,
 *   - las vistas v_stock_sucursal y v_ventas_detalle.
 *
 * Para cambiar el esquema se edita el script SQL, se recarga y se vuelve a
 * introspeccionar.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Prisma')

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    })
  }

  async onModuleInit(): Promise<void> {
    this.$on('warn' as never, (e: { message: string }) => this.log.warn(e.message))
    this.$on('error' as never, (e: { message: string }) => this.log.error(e.message))
    await this.$connect()
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }

  /** Lo usa /api/salud: el PWA decide con esto si esta realmente en linea. */
  async estaViva(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`
      return true
    } catch {
      return false
    }
  }
}
