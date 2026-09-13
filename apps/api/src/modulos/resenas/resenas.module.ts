import { Module } from '@nestjs/common'
import { ResenasController } from './resenas.controller'
import { ResenasService } from './resenas.service'

/**
 * Resenias de producto.
 *
 * No depende del modulo de ventas aunque consulte pedidos: lo unico que
 * necesita es leer si un pedido esta entregado y que contenia, y eso se
 * pregunta directo a la base. Importar VentasModule para eso ataria dos
 * modulos por una consulta de lectura.
 */
@Module({
  controllers: [ResenasController],
  providers: [ResenasService],
  exports: [ResenasService],
})
export class ResenasModule {}
