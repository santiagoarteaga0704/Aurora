import { Injectable } from '@nestjs/common'
import type { promocion_tipo } from '@prisma/client'
import type {
  DatosCampania,
  DatosConsultaPromociones,
  DatosPromocion,
  DescuentoAplicado,
  Promocion,
  TipoPromocion,
} from '@aurora/contratos'
import { salto } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import { PreciosService } from '../catalogo/precios.service'
import type { Tx } from '../inventario/stock.service'
import { aNumero } from '../../nucleo/util/decimal'

/**
 * El tipo "2x1" viaja distinto en la API y en Prisma.
 *
 * En PostgreSQL el valor del enum es literalmente `2x1`, pero un identificador
 * de TypeScript no puede empezar con un digito, asi que Prisma lo renombra a
 * `x1` (`x1 @map("2x1")` en el esquema). La API publica dice `2x1`, que es el
 * valor real y el que entiende cualquiera; la traduccion se hace aqui, en el
 * unico borde donde importa.
 */
const A_PRISMA = {
  porcentaje: 'porcentaje',
  monto_fijo: 'monto_fijo',
  '2x1': 'x1',
  envio_gratis: 'envio_gratis',
} as const satisfies Record<TipoPromocion, promocion_tipo>

const DE_PRISMA = {
  porcentaje: 'porcentaje',
  monto_fijo: 'monto_fijo',
  x1: '2x1',
  envio_gratis: 'envio_gratis',
} as const satisfies Record<promocion_tipo, TipoPromocion>

/** Lo que hace falta saber de un pedido para calcularle el descuento. */
export interface ContextoDescuento {
  lineas: { variante_id: number; cantidad: number; precio_unitario: number; subtotal: number }[]
  subtotal: number
  costo_envio: number
  canal: 'online' | 'tienda'
  modalidad: 'menudeo' | 'mayoreo'
  cupon?: string
}

@Injectable()
export class PromocionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitacora: BitacoraService
  ) {}

  // ==========================================================================
  // Calculo del descuento
  // ==========================================================================

  /**
   * Calcula el mejor descuento aplicable.
   *
   * Se aplica UNA sola promocion, la que mas le conviene al cliente. Acumular
   * varias es como se terminan regalando productos: dos promociones del 40% que
   * se suman dejan la prenda al 20% de su precio, y nadie lo nota hasta el
   * cierre de mes.
   *
   * Las promociones con cupon solo entran si el cliente escribio el codigo; las
   * demas se aplican solas.
   */
  async calcular(ctx: ContextoDescuento): Promise<DescuentoAplicado> {
    const ahora = new Date()
    const cupon = ctx.cupon?.trim().toUpperCase()

    const candidatas = await this.prisma.promocion.findMany({
      where: {
        activo: true,
        fecha_inicio: { lte: ahora },
        fecha_fin: { gte: ahora },
        canal: { in: ['todos', ctx.canal] },
        modalidad: { in: ['todas', ctx.modalidad === 'mayoreo' ? 'mayoreo' : 'menudeo'] },
        // Sin cupon escrito solo compiten las promociones abiertas.
        ...(cupon ? { OR: [{ codigo_cupon: null }, { codigo_cupon: cupon }] } : { codigo_cupon: null }),
      },
    })

    if (candidatas.length === 0) {
      return { promocion_id: null, nombre: null, descuento: 0, descuento_envio: 0 }
    }

    // Un cupon escrito que no corresponde a nada no puede fallar en silencio: el
    // cliente cree que le hicieron el descuento y despues reclama.
    if (cupon && !candidatas.some((c) => c.codigo_cupon === cupon)) {
      throw ExcepcionNegocio.validacion({
        cupon: 'Ese cupon no existe, ya vencio o no aplica a esta compra',
      })
    }

    const clasificacion = await this.clasificarLineas(ctx.lineas)
    let mejor: DescuentoAplicado = {
      promocion_id: null,
      nombre: null,
      descuento: 0,
      descuento_envio: 0,
    }

    for (const p of candidatas) {
      if (p.usos_max !== null && p.usos_actuales >= p.usos_max) continue
      if (ctx.subtotal < aNumero(p.min_compra)) continue

      const alcanzadas = ctx.lineas.filter((l) =>
        this.alcanza(p.aplica_a, p.aplica_id, clasificacion.get(l.variante_id))
      )
      if (alcanzadas.length === 0) continue

      const baseAlcanzada = PreciosService.centavos(
        alcanzadas.reduce((s, l) => s + l.subtotal, 0)
      )

      let descuento = 0
      let descuentoEnvio = 0

      switch (p.tipo) {
        case 'porcentaje':
          descuento = PreciosService.centavos((baseAlcanzada * aNumero(p.valor)) / 100)
          break

        case 'monto_fijo':
          // Nunca mas que lo que alcanza: un descuento de 100 sobre una compra
          // de 60 no puede dejar el pedido en negativo.
          descuento = Math.min(aNumero(p.valor), baseAlcanzada)
          break

        case 'x1':
          // Por cada dos unidades del MISMO articulo, una gratis. Se cuenta por
          // linea y no sobre el total: dos prendas distintas de 100 y 300 no son
          // un 2x1, o el cliente se llevaria gratis la cara.
          descuento = PreciosService.centavos(
            alcanzadas.reduce(
              (s, l) => s + Math.floor(l.cantidad / 2) * l.precio_unitario,
              0
            )
          )
          break

        case 'envio_gratis':
          descuentoEnvio = ctx.costo_envio
          break
      }

      const beneficio = descuento + descuentoEnvio
      if (beneficio > mejor.descuento + mejor.descuento_envio) {
        mejor = {
          promocion_id: p.id,
          nombre: p.nombre,
          descuento: Math.min(descuento, ctx.subtotal),
          descuento_envio: descuentoEnvio,
        }
      }
    }

    return mejor
  }

  /** Suma un uso a la promocion aplicada, dentro de la transaccion del pedido. */
  async registrarUso(tx: Tx, promocionId: number): Promise<void> {
    await tx.promocion.update({
      where: { id: promocionId },
      data: { usos_actuales: { increment: 1 } },
    })
  }

  /**
   * A que categoria y producto pertenece cada variante del pedido. Se resuelve
   * en una sola consulta para no ir a la base una vez por linea.
   */
  private async clasificarLineas(lineas: readonly { variante_id: number }[]) {
    const variantes = await this.prisma.variante.findMany({
      where: { id: { in: lineas.map((l) => l.variante_id) } },
      select: {
        id: true,
        producto_id: true,
        producto: { select: { categoria_id: true } },
      },
    })

    return new Map(
      variantes.map((v) => [
        v.id,
        { variante_id: v.id, producto_id: v.producto_id, categoria_id: v.producto.categoria_id },
      ])
    )
  }

  private alcanza(
    aplicaA: string,
    aplicaId: number | null,
    linea?: { variante_id: number; producto_id: number; categoria_id: number }
  ): boolean {
    if (aplicaA === 'todo') return true
    if (!linea || aplicaId === null) return false

    switch (aplicaA) {
      case 'variante':
        return linea.variante_id === aplicaId
      case 'producto':
        return linea.producto_id === aplicaId
      case 'categoria':
        return linea.categoria_id === aplicaId
      default:
        return false
    }
  }

  // ==========================================================================
  // Campanias
  // ==========================================================================

  async campanias(soloVigentes = false) {
    const ahora = new Date()
    return this.prisma.campania.findMany({
      where: soloVigentes
        ? { activo: true, fecha_inicio: { lte: ahora }, fecha_fin: { gte: ahora } }
        : {},
      orderBy: { fecha_inicio: 'desc' },
      include: { _count: { select: { promocion: true } } },
    })
  }

  async crearCampania(datos: DatosCampania, ctx: ContextoPeticion) {
    const campania = await this.prisma.campania.create({
      data: {
        nombre: datos.nombre,
        descripcion: datos.descripcion ?? null,
        tipo: datos.tipo,
        banner_url: datos.banner_url ?? null,
        fecha_inicio: datos.fecha_inicio,
        fecha_fin: datos.fecha_fin,
      },
    })

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'promocion',
      entidad: 'campania',
      entidadId: campania.id,
      descripcion: `Campania ${datos.nombre}`,
    })

    return campania
  }

  // ==========================================================================
  // Promociones
  // ==========================================================================

  async listar(filtros: DatosConsultaPromociones) {
    const ahora = new Date()
    const where = {
      campania_id: filtros.campania_id,
      tipo: filtros.tipo ? A_PRISMA[filtros.tipo] : undefined,
      ...(filtros.vigentes === 'true'
        ? { activo: true, fecha_inicio: { lte: ahora }, fecha_fin: { gte: ahora } }
        : {}),
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.promocion.count({ where }),
      this.prisma.promocion.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: salto(filtros),
        take: filtros.por_pagina,
        include: { campania: { select: { nombre: true } } },
      }),
    ])

    return { total, items: filas.map((p) => this.formatear(p, ahora)) }
  }

  async crear(datos: DatosPromocion, ctx: ContextoPeticion): Promise<Promocion> {
    if (datos.campania_id !== undefined) {
      const campania = await this.prisma.campania.findUnique({
        where: { id: datos.campania_id },
        select: { id: true },
      })
      if (!campania) {
        throw ExcepcionNegocio.validacion({ campania_id: 'Esa campania no existe' })
      }
    }

    await this.verificarAlcance(datos.aplica_a, datos.aplica_id)

    if (datos.codigo_cupon) {
      const ocupado = await this.prisma.promocion.findUnique({
        where: { codigo_cupon: datos.codigo_cupon },
        select: { id: true },
      })
      if (ocupado) {
        throw ExcepcionNegocio.validacion({ codigo_cupon: 'Ese cupon ya esta en uso' })
      }
    }

    const promocion = await this.prisma.promocion.create({
      data: {
        campania_id: datos.campania_id ?? null,
        nombre: datos.nombre,
        tipo: A_PRISMA[datos.tipo],
        valor: datos.valor,
        codigo_cupon: datos.codigo_cupon ?? null,
        min_compra: datos.min_compra,
        aplica_a: datos.aplica_a,
        aplica_id: datos.aplica_id ?? null,
        canal: datos.canal,
        modalidad: datos.modalidad,
        usos_max: datos.usos_max ?? null,
        fecha_inicio: datos.fecha_inicio,
        fecha_fin: datos.fecha_fin,
      },
      include: { campania: { select: { nombre: true } } },
    })

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'promocion',
      entidad: 'promocion',
      entidadId: promocion.id,
      descripcion: `Promocion ${datos.nombre} (${datos.tipo})`,
    })

    return this.formatear(promocion, new Date())
  }

  async desactivar(id: number, ctx: ContextoPeticion): Promise<Promocion> {
    const previa = await this.prisma.promocion.findUnique({ where: { id } })
    if (!previa) throw ExcepcionNegocio.noEncontrado('Esa promocion no existe')

    const promocion = await this.prisma.promocion.update({
      where: { id },
      data: { activo: false },
      include: { campania: { select: { nombre: true } } },
    })

    await this.bitacora.registrar(ctx, {
      accion: 'eliminar',
      modulo: 'promocion',
      entidad: 'promocion',
      entidadId: id,
      descripcion: `Promocion ${previa.nombre} desactivada`,
    })

    return this.formatear(promocion, new Date())
  }

  private async verificarAlcance(aplicaA: string, aplicaId?: number): Promise<void> {
    if (aplicaA === 'todo' || aplicaId === undefined) return

    const existe =
      aplicaA === 'categoria'
        ? await this.prisma.categoria.count({ where: { id: aplicaId } })
        : aplicaA === 'producto'
          ? await this.prisma.producto.count({ where: { id: aplicaId } })
          : await this.prisma.variante.count({ where: { id: aplicaId } })

    if (existe === 0) {
      throw ExcepcionNegocio.validacion({
        aplica_id: `No existe ${aplicaA === 'categoria' ? 'esa categoria' : aplicaA === 'producto' ? 'ese producto' : 'esa variante'}`,
      })
    }
  }

  private formatear(
    p: {
      id: number
      nombre: string
      tipo: string
      valor: unknown
      codigo_cupon: string | null
      min_compra: unknown
      aplica_a: string
      aplica_id: number | null
      canal: string
      modalidad: string
      usos_max: number | null
      usos_actuales: number
      fecha_inicio: Date
      fecha_fin: Date
      activo: boolean
      campania?: { nombre: string } | null
    },
    ahora: Date
  ): Promocion {
    const agotada = p.usos_max !== null && p.usos_actuales >= p.usos_max
    return {
      id: p.id,
      campania: p.campania?.nombre ?? null,
      nombre: p.nombre,
      tipo: DE_PRISMA[p.tipo as promocion_tipo],
      valor: aNumero(p.valor as never),
      codigo_cupon: p.codigo_cupon,
      min_compra: aNumero(p.min_compra as never),
      aplica_a: p.aplica_a as Promocion['aplica_a'],
      aplica_id: p.aplica_id,
      canal: p.canal,
      modalidad: p.modalidad,
      usos_max: p.usos_max,
      usos_actuales: p.usos_actuales,
      fecha_inicio: p.fecha_inicio.toISOString(),
      fecha_fin: p.fecha_fin.toISOString(),
      activo: p.activo,
      vigente: p.activo && !agotada && p.fecha_inicio <= ahora && p.fecha_fin >= ahora,
    }
  }
}
