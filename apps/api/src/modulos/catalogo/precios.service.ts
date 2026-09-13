import { Injectable } from '@nestjs/common'
import type { Modalidad } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { aNumero } from '../../nucleo/util/decimal'

export interface PrecioResuelto {
  variante_id: number
  sku: string
  descripcion: string
  precio_unitario: number
  modalidad: Modalidad
  /** Con que escala de mayoreo se calculo, si aplico alguna. */
  escala_aplicada: number | null
}

/**
 * Calcula el precio de una variante.
 *
 * Es el unico lugar donde se decide cuanto cuesta algo, y vive en el servidor.
 * El carrito, el checkout y el punto de venta lo consultan; ninguno acepta un
 * precio enviado por el cliente. Si el precio viajara en la peticion, cualquiera
 * podria comprar un vestido en un boliviano cambiandolo en el navegador.
 *
 * La regla:
 *
 *   minorista            -> precio_menor, siempre
 *   mayorista aprobado   -> la escala que corresponda a la cantidad; si no hay
 *                           escala para esa cantidad, precio_mayor
 *
 * Un mayorista con el NIT todavia sin validar paga como minorista: la cuenta
 * existe, pero el beneficio se habilita a mano.
 */
@Injectable()
export class PreciosService {
  constructor(private readonly prisma: PrismaService) {}

  /** Modalidad que le corresponde a un cliente. */
  async modalidadDe(clienteId: number | null | undefined): Promise<Modalidad> {
    if (!clienteId) return 'menudeo'

    const cliente = await this.prisma.cliente.findUnique({
      where: { usuario_id: clienteId },
      select: { tipo: true, mayorista_aprobado: true },
    })

    return cliente?.tipo === 'mayorista' && cliente.mayorista_aprobado ? 'mayoreo' : 'menudeo'
  }

  /**
   * Resuelve el precio de varias variantes a la vez.
   *
   * Se hace en lote y no una por una porque un checkout con diez articulos
   * dispararia diez idas a la base, y el precio tiene que quedar congelado sobre
   * la misma foto de datos para todas las lineas del pedido.
   */
  async resolver(
    pedidos: readonly { variante_id: number; cantidad: number }[],
    modalidad: Modalidad
  ): Promise<PrecioResuelto[]> {
    const ids = [...new Set(pedidos.map((p) => p.variante_id))]

    const variantes = await this.prisma.variante.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        sku: true,
        activo: true,
        precio_menor: true,
        precio_mayor: true,
        producto: { select: { nombre: true, activo: true } },
        talla: { select: { nombre: true } },
        color: { select: { nombre: true } },
        escala_precio: { orderBy: { cantidad_min: 'desc' } },
      },
    })

    const porId = new Map(variantes.map((v) => [v.id, v]))

    return pedidos.map((p) => {
      const v = porId.get(p.variante_id)
      if (!v) {
        throw ExcepcionNegocio.validacion({
          variante_id: `La variante ${p.variante_id} no existe`,
        })
      }
      if (!v.activo || !v.producto.activo) {
        throw ExcepcionNegocio.conflicto(
          `${v.producto.nombre} (${v.sku}) ya no esta a la venta`
        )
      }

      let precio = aNumero(v.precio_menor)
      let escalaAplicada: number | null = null

      if (modalidad === 'mayoreo') {
        precio = aNumero(v.precio_mayor)
        // Las escalas vienen de mayor a menor cantidad, asi que la primera que
        // cubre la cantidad pedida es la mejor que le corresponde.
        const escala = v.escala_precio.find((e) => p.cantidad >= e.cantidad_min)
        if (escala) {
          precio = aNumero(escala.precio_unitario)
          escalaAplicada = escala.cantidad_min
        }
      }

      return {
        variante_id: v.id,
        sku: v.sku,
        descripcion: `${v.producto.nombre} - ${v.talla.nombre} / ${v.color.nombre}`,
        precio_unitario: precio,
        modalidad,
        escala_aplicada: escalaAplicada,
      }
    })
  }

  /** Redondeo a centavos, para que los totales cierren contra DECIMAL(12,2). */
  static centavos(n: number): number {
    return Math.round(n * 100) / 100
  }
}
