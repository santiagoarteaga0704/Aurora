import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { TipoMovimiento } from '@aurora/contratos'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'

/** Transaccion de Prisma: el tipo del `tx` que recibe el callback. */
export type Tx = Prisma.TransactionClient

export interface MovimientoStock {
  variante_id: number
  almacen_id: number
  /** Positiva suma, negativa resta. */
  cantidad: number
  tipo: TipoMovimiento
  usuario_id: number | null
  motivo?: string
  /** De donde viene el movimiento: 'compra', 'pedido', 'transferencia'... */
  referencia_tipo?: string
  referencia_id?: bigint | number
}

/**
 * Primitiva de movimiento de stock. Todo lo que suma o resta existencias pasa
 * por aqui: compras, ventas, ajustes, transferencias y devoluciones.
 *
 * Tres razones para que sea una sola pieza y no codigo repetido en cada modulo:
 *
 *  1. **El kardex nunca se desincroniza.** Es imposible tocar `inventario` sin
 *     escribir su `movimiento_inventario`, porque las dos cosas ocurren aqui.
 *  2. **Concurrencia.** Dos cajas vendiendo la ultima unidad a la vez es un caso
 *     real, no teorico. La fila se bloquea con SELECT ... FOR UPDATE antes de
 *     leerla, asi que la segunda venta espera y ve el stock ya descontado.
 *  3. **Errores legibles.** Sin esto, quedarse sin stock se manifestaria como la
 *     violacion del CHECK `ck_inv_stock`, que no le dice nada al vendedor.
 *
 * Siempre se llama dentro de una transaccion. El CHECK de la base sigue siendo
 * la ultima linea de defensa: si algun camino se saltara esta funcion, la
 * transaccion falla en vez de dejar stock negativo.
 */
@Injectable()
export class StockService {
  async mover(tx: Tx, m: MovimientoStock): Promise<number> {
    if (m.cantidad === 0) {
      throw ExcepcionNegocio.validacion({ cantidad: 'Un movimiento de cero no tiene sentido' })
    }

    // Bloquea la fila si existe. Cualquier otra transaccion que quiera mover
    // este mismo par (variante, almacen) espera hasta que esta termine.
    const bloqueadas = await tx.$queryRaw<{ stock: number }[]>`
      SELECT stock FROM inventario
      WHERE variante_id = ${m.variante_id} AND almacen_id = ${m.almacen_id}
      FOR UPDATE
    `

    const stockActual = bloqueadas[0]?.stock ?? null

    if (stockActual === null && m.cantidad < 0) {
      throw ExcepcionNegocio.conflicto(
        'No hay stock de ese articulo en ese almacen',
        await this.detalle(tx, m, 0)
      )
    }

    const resultante = (stockActual ?? 0) + m.cantidad
    if (resultante < 0) {
      throw ExcepcionNegocio.conflicto(
        'No alcanza el stock disponible',
        await this.detalle(tx, m, stockActual ?? 0)
      )
    }

    if (stockActual === null) {
      await tx.inventario.create({
        data: { variante_id: m.variante_id, almacen_id: m.almacen_id, stock: m.cantidad },
      })
    } else {
      await tx.inventario.update({
        where: {
          variante_id_almacen_id: { variante_id: m.variante_id, almacen_id: m.almacen_id },
        },
        data: { stock: resultante, actualizado_en: new Date() },
      })
    }

    await tx.movimiento_inventario.create({
      data: {
        variante_id: m.variante_id,
        almacen_id: m.almacen_id,
        tipo: m.tipo,
        cantidad: m.cantidad,
        stock_resultante: resultante,
        referencia_tipo: m.referencia_tipo ?? null,
        referencia_id: m.referencia_id === undefined ? null : BigInt(m.referencia_id),
        usuario_id: m.usuario_id,
        motivo: m.motivo?.slice(0, 200) ?? null,
      },
    })

    return resultante
  }

  /**
   * Reserva stock sin sacarlo del almacen: lo que hace un pedido online al
   * confirmarse pero antes de que alguien lo prepare. La prenda sigue estando,
   * pero deja de ser vendible para otro cliente.
   */
  async reservar(tx: Tx, variante_id: number, almacen_id: number, cantidad: number): Promise<void> {
    const filas = await tx.$queryRaw<{ stock: number; stock_reservado: number }[]>`
      SELECT stock, stock_reservado FROM inventario
      WHERE variante_id = ${variante_id} AND almacen_id = ${almacen_id}
      FOR UPDATE
    `

    const fila = filas[0]
    const disponible = fila ? fila.stock - fila.stock_reservado : 0

    if (disponible < cantidad) {
      throw ExcepcionNegocio.conflicto('No alcanza el stock disponible para reservar', {
        variante_id: String(variante_id),
        disponible: String(disponible),
        solicitado: String(cantidad),
      })
    }

    await tx.inventario.update({
      where: { variante_id_almacen_id: { variante_id, almacen_id } },
      data: { stock_reservado: { increment: cantidad } },
    })
  }

  /** Libera una reserva: el pedido se cancelo o se vencio sin pagarse. */
  async liberar(tx: Tx, variante_id: number, almacen_id: number, cantidad: number): Promise<void> {
    const filas = await tx.$queryRaw<{ stock_reservado: number }[]>`
      SELECT stock_reservado FROM inventario
      WHERE variante_id = ${variante_id} AND almacen_id = ${almacen_id}
      FOR UPDATE
    `

    // Nunca liberar mas de lo reservado: dejaria el reservado en negativo y el
    // disponible inflado, que es peor que un articulo trabado.
    const aLiberar = Math.min(cantidad, filas[0]?.stock_reservado ?? 0)
    if (aLiberar <= 0) return

    await tx.inventario.update({
      where: { variante_id_almacen_id: { variante_id, almacen_id } },
      data: { stock_reservado: { decrement: aLiberar } },
    })
  }

  /**
   * Consume una reserva al despachar: baja el stock y la reserva a la vez. Si se
   * hiciera con liberar() + mover(), entre las dos operaciones el articulo
   * quedaria disponible y otra caja podria vendarlo.
   */
  async consumirReserva(tx: Tx, m: MovimientoStock): Promise<number> {
    const unidades = Math.abs(m.cantidad)

    await tx.inventario.update({
      where: {
        variante_id_almacen_id: { variante_id: m.variante_id, almacen_id: m.almacen_id },
      },
      data: { stock_reservado: { decrement: unidades } },
    })

    return this.mover(tx, { ...m, cantidad: -unidades })
  }

  /** Contexto para el mensaje de error: que articulo y cuanto habia. */
  private async detalle(
    tx: Tx,
    m: MovimientoStock,
    stock: number
  ): Promise<Record<string, string>> {
    const variante = await tx.variante.findUnique({
      where: { id: m.variante_id },
      select: { sku: true, producto: { select: { nombre: true } } },
    })
    const almacen = await tx.almacen.findUnique({
      where: { id: m.almacen_id },
      select: { nombre: true },
    })

    return {
      articulo: variante ? `${variante.producto.nombre} (${variante.sku})` : `#${m.variante_id}`,
      almacen: almacen?.nombre ?? `#${m.almacen_id}`,
      disponible: String(stock),
      solicitado: String(Math.abs(m.cantidad)),
    }
  }
}
