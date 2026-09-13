import { Injectable } from '@nestjs/common'
import type { AnclajePrenda, PrendaRa } from '@aurora/contratos'
import { ANCLAJE_NEUTRO, ANCLAJE_POR_TIPO } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'

@Injectable()
export class RaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lo que el navegador necesita para dibujar una prenda sobre la camara.
   *
   * El anclaje sale de `producto_prenda_3d` cuando el producto lo tiene
   * cargado, y si no del tipo de prenda. Que sea opcional es a proposito: exigir
   * que alguien mida a mano el anclaje de cada uno de los productos antes de
   * que la RA funcione la dejaria apagada para siempre. Con el anclaje por tipo
   * anda con el catalogo tal como esta, y el dia que se cargue el fino de un
   * producto, ese gana sin tocar una linea.
   */
  async prenda(varianteId: number): Promise<PrendaRa> {
    const variante = await this.prisma.variante.findUnique({
      where: { id: varianteId },
      include: {
        producto: { select: { id: true, nombre: true, tipo_prenda: true } },
        color: { select: { id: true, nombre: true, hex: true } },
        talla: { select: { nombre: true } },
      },
    })

    if (!variante || !variante.activo) {
      throw ExcepcionNegocio.noEncontrado('Esa prenda no existe')
    }

    // El registro con el color exacto manda sobre el generico del producto: una
    // misma prenda en dos colores puede tener texturas distintas.
    const prenda3d = await this.prisma.producto_prenda_3d.findFirst({
      where: { producto_id: variante.producto.id, activo: true },
      orderBy: { color_id: 'desc' },
    })

    const propio = prenda3d?.anclaje_json as AnclajePrenda | null | undefined

    return {
      variante_id: variante.id,
      producto: variante.producto.nombre,
      color: variante.color.nombre,
      color_hex: variante.color.hex,
      talla: variante.talla.nombre,
      tipo_prenda: variante.producto.tipo_prenda,
      url_textura: prenda3d?.url_textura ?? null,
      anclaje: this.validar(propio) ?? ANCLAJE_POR_TIPO[variante.producto.tipo_prenda] ?? ANCLAJE_NEUTRO,
      escala_base: prenda3d === null ? 1 : Number(prenda3d.escala_base),
    }
  }

  /**
   * Comprueba que el anclaje guardado sea usable.
   *
   * `anclaje_json` es una columna JSONB: nada garantiza su forma, y un anclaje
   * a medio cargar dibujaria la prenda fuera del encuadre o del reves. Ante la
   * duda se cae al anclaje por tipo, que al menos se ve.
   */
  private validar(a: AnclajePrenda | null | undefined): AnclajePrenda | null {
    if (!a || typeof a !== 'object') return null

    const numero = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
    const completo =
      numero(a.hombros) &&
      numero(a.bajo) &&
      numero(a.ancho_hombros) &&
      numero(a.ancho_bajo) &&
      numero(a.entalle) &&
      numero(a.cintura)

    return completo && a.bajo > a.hombros ? a : null
  }
}
