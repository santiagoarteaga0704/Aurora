import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type {
  DatosAjusteInventario,
  DatosConsultaInventario,
  DatosConsultaMovimientos,
  FilaInventario,
  FilaStockSucursal,
} from '@aurora/contratos'
import { salto } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import { PERMISOS } from '@aurora/contratos'
import { NotificacionesService } from '../../nucleo/notificaciones/notificaciones.service'
import { PermisosService } from '../../nucleo/autenticacion/permisos.service'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'
import { StockService } from './stock.service'

@Injectable()
export class InventarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly permisos: PermisosService,
    private readonly notificaciones: NotificacionesService,
    private readonly bitacora: BitacoraService
  ) {}

  // ==========================================================================
  // Consultas
  // ==========================================================================

  /**
   * Stock por variante y almacen.
   *
   * El filtro por sucursal no es opcional para todo el mundo: un gerente o un
   * vendedor solo ven la suya. Se aplica en el servidor y no en el front, porque
   * un filtro de pantalla no es un control de acceso.
   */
  async consultar(filtros: DatosConsultaInventario, usuario: UsuarioAutenticado) {
    const sucursal = this.sucursalPermitida(usuario, filtros.sucursal_id)

    const condiciones: Prisma.Sql[] = []
    if (sucursal !== null) condiciones.push(Prisma.sql`s.id = ${sucursal}`)
    if (filtros.almacen_id) condiciones.push(Prisma.sql`a.id = ${filtros.almacen_id}`)
    if (filtros.variante_id) condiciones.push(Prisma.sql`v.id = ${filtros.variante_id}`)
    if (filtros.producto_id) condiciones.push(Prisma.sql`p.id = ${filtros.producto_id}`)
    if (filtros.solo_bajo_minimo) {
      condiciones.push(Prisma.sql`(i.stock - i.stock_reservado) <= i.stock_minimo`)
    }
    if (filtros.q) {
      const patron = `%${filtros.q}%`
      condiciones.push(Prisma.sql`(p.nombre ILIKE ${patron} OR v.sku ILIKE ${patron})`)
    }

    const donde =
      condiciones.length > 0 ? Prisma.sql`WHERE ${Prisma.join(condiciones, ' AND ')}` : Prisma.empty

    const desde = Prisma.sql`
      FROM inventario i
      JOIN almacen  a ON a.id = i.almacen_id
      JOIN sucursal s ON s.id = a.sucursal_id
      JOIN variante v ON v.id = i.variante_id
      JOIN producto p ON p.id = v.producto_id
      JOIN talla    t ON t.id = v.talla_id
      JOIN color    c ON c.id = v.color_id
      ${donde}
    `

    const [{ total }] = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*)::bigint AS total ${desde}
    `

    const items = await this.prisma.$queryRaw<FilaInventario[]>`
      SELECT v.id AS variante_id, v.sku, p.nombre AS producto,
             t.nombre AS talla, c.nombre AS color,
             a.id AS almacen_id, a.nombre AS almacen,
             s.id AS sucursal_id, s.nombre AS sucursal,
             i.stock, i.stock_reservado AS reservado,
             (i.stock - i.stock_reservado) AS disponible,
             i.stock_minimo,
             ((i.stock - i.stock_reservado) <= i.stock_minimo) AS bajo_minimo,
             i.ubicacion
      ${desde}
      ORDER BY s.nombre, a.nombre, p.nombre, t.orden, c.nombre
      LIMIT ${filtros.por_pagina} OFFSET ${salto(filtros)}
    `

    return { items, total: Number(total) }
  }

  /**
   * Stock consolidado por sucursal, sumando sus almacenes.
   *
   * Sale de la vista `v_stock_sucursal` del esquema. Es la consulta que responde
   * "en que sucursal queda esta talla", que es lo que pregunta una vendedora
   * cuando la clienta tiene la prenda en la mano y no hay su talle.
   */
  async porSucursal(
    filtros: DatosConsultaInventario,
    usuario: UsuarioAutenticado
  ): Promise<{ items: FilaStockSucursal[]; total: number }> {
    const sucursal = this.sucursalPermitida(usuario, filtros.sucursal_id)

    const condiciones: Prisma.Sql[] = []
    if (sucursal !== null) condiciones.push(Prisma.sql`sucursal_id = ${sucursal}`)
    if (filtros.variante_id) condiciones.push(Prisma.sql`variante_id = ${filtros.variante_id}`)
    if (filtros.producto_id) condiciones.push(Prisma.sql`producto_id = ${filtros.producto_id}`)
    if (filtros.q) {
      const patron = `%${filtros.q}%`
      condiciones.push(Prisma.sql`(producto ILIKE ${patron} OR sku ILIKE ${patron})`)
    }

    const donde =
      condiciones.length > 0 ? Prisma.sql`WHERE ${Prisma.join(condiciones, ' AND ')}` : Prisma.empty

    const [{ total }] = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*)::bigint AS total FROM v_stock_sucursal ${donde}
    `

    const items = await this.prisma.$queryRaw<FilaStockSucursal[]>`
      SELECT sucursal_id, sucursal, variante_id, sku, producto_id, producto,
             talla, color, stock_total::int, reservado::int, disponible::int
      FROM v_stock_sucursal
      ${donde}
      ORDER BY producto, talla, color, sucursal
      LIMIT ${filtros.por_pagina} OFFSET ${salto(filtros)}
    `

    return { items, total: Number(total) }
  }

  /** Kardex: la historia de movimientos de una variante. */
  async movimientos(filtros: DatosConsultaMovimientos, usuario: UsuarioAutenticado) {
    const sucursal = this.permisos.restringeSucursal(usuario)

    const where: Prisma.movimiento_inventarioWhereInput = {
      variante_id: filtros.variante_id,
      almacen_id: filtros.almacen_id,
      tipo: filtros.tipo,
      ...(sucursal !== null ? { almacen: { sucursal_id: sucursal } } : {}),
      ...(filtros.desde || filtros.hasta
        ? { creado_en: { gte: filtros.desde, lte: filtros.hasta } }
        : {}),
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.movimiento_inventario.count({ where }),
      this.prisma.movimiento_inventario.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: salto(filtros),
        take: filtros.por_pagina,
        include: {
          variante: { select: { sku: true, producto: { select: { nombre: true } } } },
          almacen: { select: { nombre: true } },
          usuario: { select: { nombre: true, apellido: true } },
        },
      }),
    ])

    return {
      total,
      items: filas.map((m) => ({
        id: m.id.toString(),
        fecha: m.creado_en,
        tipo: m.tipo,
        sku: m.variante.sku,
        producto: m.variante.producto.nombre,
        almacen: m.almacen.nombre,
        cantidad: m.cantidad,
        stock_resultante: m.stock_resultante,
        motivo: m.motivo,
        referencia: m.referencia_tipo
          ? `${m.referencia_tipo}:${m.referencia_id?.toString() ?? ''}`
          : null,
        usuario: m.usuario ? `${m.usuario.nombre} ${m.usuario.apellido}` : null,
      })),
    }
  }

  // ==========================================================================
  // Ajuste
  // ==========================================================================

  /**
   * Ajuste por conteo fisico. Se recibe lo que se conto y el sistema calcula la
   * diferencia; el movimiento queda con el motivo y el usuario, que es lo que
   * despues permite auditar los faltantes.
   */
  async ajustar(datos: DatosAjusteInventario, usuario: UsuarioAutenticado, ctx: ContextoPeticion) {
    const almacen = await this.prisma.almacen.findUnique({
      where: { id: datos.almacen_id },
      select: { id: true, nombre: true, sucursal_id: true },
    })
    if (!almacen) throw ExcepcionNegocio.validacion({ almacen_id: 'Ese almacen no existe' })
    this.verificarAlcanceSucursal(usuario, almacen.sucursal_id)

    const variante = await this.prisma.variante.findUnique({
      where: { id: datos.variante_id },
      select: { id: true, sku: true },
    })
    if (!variante) throw ExcepcionNegocio.validacion({ variante_id: 'Esa variante no existe' })

    return this.prisma.$transaction(async (tx) => {
      const actual = await tx.inventario.findUnique({
        where: {
          variante_id_almacen_id: {
            variante_id: datos.variante_id,
            almacen_id: datos.almacen_id,
          },
        },
      })

      const stockPrevio = actual?.stock ?? 0
      const diferencia = datos.stock_contado - stockPrevio

      if (diferencia !== 0) {
        await this.stock.mover(tx, {
          variante_id: datos.variante_id,
          almacen_id: datos.almacen_id,
          cantidad: diferencia,
          tipo: 'ajuste',
          usuario_id: usuario.id,
          motivo: datos.motivo,
        })
      }

      // El minimo y la ubicacion se guardan aunque el conteo no cambie nada:
      // muchas veces el ajuste es justamente para corregirlos.
      if (datos.stock_minimo !== undefined || datos.ubicacion !== undefined) {
        await tx.inventario.upsert({
          where: {
            variante_id_almacen_id: {
              variante_id: datos.variante_id,
              almacen_id: datos.almacen_id,
            },
          },
          create: {
            variante_id: datos.variante_id,
            almacen_id: datos.almacen_id,
            stock: datos.stock_contado,
            stock_minimo: datos.stock_minimo ?? 0,
            ubicacion: datos.ubicacion ?? null,
          },
          update: {
            stock_minimo: datos.stock_minimo,
            ubicacion: datos.ubicacion,
          },
        })
      }

      await this.bitacora.registrar(ctx, {
        accion: 'ajustar',
        modulo: 'inventario',
        entidad: 'inventario',
        entidadId: datos.variante_id,
        descripcion: `Ajuste de ${variante.sku} en ${almacen.nombre}: ${stockPrevio} -> ${datos.stock_contado}`,
        datosPrevios: { stock: stockPrevio },
        datosNuevos: { stock: datos.stock_contado, motivo: datos.motivo },
      })

      return {
        variante_id: datos.variante_id,
        almacen_id: datos.almacen_id,
        sku: variante.sku,
        almacen: almacen.nombre,
        stock_previo: stockPrevio,
        stock_actual: datos.stock_contado,
        diferencia,
        minimo: datos.stock_minimo,
      }
    })
      .then(async (resultado) => {
        await this.avisarSiQuedoBajo(resultado, almacen)
        return resultado
      })
  }

  /**
   * Avisa a quien pueda reponer que una prenda quedo bajo el minimo.
   *
   * Va despues de la transaccion y no dentro: si el aviso fallara dentro, se
   * desharia un conteo de inventario que ya es correcto. El stock es el dato
   * real; el aviso es una cortesia.
   *
   * Se avisa a quien tenga el permiso de ajustar inventario, resuelto por
   * permiso y no por rol: el dia que alguien cree un rol nuevo que pueda
   * reponer, se entera sin tocar este codigo.
   */
  private async avisarSiQuedoBajo(
    resultado: { variante_id: number; sku: string; stock_actual: number; minimo?: number },
    almacen: { nombre: string; sucursal_id: number }
  ): Promise<void> {
    const inventario = await this.prisma.inventario.findFirst({
      where: { variante_id: resultado.variante_id },
      select: { stock_minimo: true },
    })

    const minimo = resultado.minimo ?? inventario?.stock_minimo ?? 0
    if (minimo <= 0 || resultado.stock_actual > minimo) return

    const destinatarios = await this.notificaciones.quienPuede(
      PERMISOS.INVENTARIO_AJUSTAR,
      almacen.sucursal_id
    )

    await this.notificaciones.crearVarios(destinatarios, {
      tipo: 'stock',
      titulo: 'Stock bajo el minimo',
      mensaje: `${resultado.sku} quedo en ${resultado.stock_actual} en ${almacen.nombre} (minimo ${minimo}).`,
      url: '/op/inventario',
    })
  }

  // ==========================================================================
  // Alcance por sucursal
  // ==========================================================================

  /**
   * Resuelve que sucursal se puede consultar. Si el usuario esta restringido, se
   * ignora lo que haya pedido y se le devuelve la suya: pedir otra no es un
   * error del formulario, es un intento de mirar donde no corresponde.
   */
  private sucursalPermitida(usuario: UsuarioAutenticado, pedida?: number): number | null {
    const propia = this.permisos.restringeSucursal(usuario)
    if (propia !== null) return propia
    return pedida ?? null
  }

  private verificarAlcanceSucursal(usuario: UsuarioAutenticado, sucursalId: number): void {
    const propia = this.permisos.restringeSucursal(usuario)
    if (propia !== null && propia !== sucursalId) {
      throw ExcepcionNegocio.sinPermiso('Solo puedes operar sobre el inventario de tu sucursal')
    }
  }
}
