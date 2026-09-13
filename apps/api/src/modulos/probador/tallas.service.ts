import { Injectable } from '@nestjs/common'
import type { Ajuste, Recomendacion, RespuestaRecomendacion } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { MedidasService } from './medidas.service'

/** Las medidas de la clienta, ya resueltas. */
interface Cuerpo {
  busto_cm: number | null
  cintura_cm: number | null
  cadera_cm: number | null
  estimadas: boolean
}

/** Una fila de la guia, con los rangos que declara. */
interface FilaGuia {
  talla_id: number
  talla: string
  orden: number
  rangos: Partial<Record<'busto' | 'cintura' | 'cadera', { min: number; max: number }>>
}

interface Puntaje {
  fila: FilaGuia
  /** Centimetros que sobran o faltan, promediados entre las medidas comparadas. */
  desvio: number
  /** Donde cae dentro del rango: 0 en el minimo, 1 en el maximo. */
  posicion: number
  comparadas: number
}

/**
 * De cuantos centimetros de desvio para arriba se considera que la talla ya no
 * es la suya, sino la menos mala.
 *
 * Las tallas de la guia se llevan unos 5-6 cm entre si, asi que un desvio de
 * mas de 4 cm significa que el cuerpo quedo fuera de toda la tabla y no entre
 * dos tallas.
 */
const DESVIO_FUERA_DE_GUIA = 4

@Injectable()
export class TallasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly medidas: MedidasService
  ) {}

  /**
   * Que talla le corresponde a esta clienta en esta categoria.
   *
   * La guia esta cargada por categoria porque cada tipo de prenda se decide con
   * medidas distintas: un pantalon con cintura y cadera, una blusa con busto y
   * cintura, un vestido con las tres. Eso no es un detalle de implementacion —es
   * la razon por la que una misma persona usa M de blusa y L de pantalon, y por
   * la que una talla unica por clienta seria una respuesta incorrecta.
   */
  async recomendar(
    clienteId: number,
    categoriaId: number,
    productoId?: number
  ): Promise<RespuestaRecomendacion> {
    const cuerpo = await this.medidas.paraRecomendar(clienteId)
    if (!cuerpo) {
      return {
        talla_id: null,
        falta: 'medidas',
        motivo: 'Todavia no cargaste tus medidas',
      }
    }

    const guia = await this.cargarGuia(categoriaId)
    if (guia.length === 0) {
      return {
        talla_id: null,
        falta: 'guia',
        motivo: 'Esta categoria todavia no tiene guia de tallas cargada',
      }
    }

    const puntajes = guia
      .map((fila) => this.puntuar(fila, cuerpo))
      .filter((p): p is Puntaje => p !== null)

    if (puntajes.length === 0) {
      return {
        talla_id: null,
        falta: 'medidas',
        motivo: 'Te faltan las medidas que esta categoria necesita para decidir la talla',
      }
    }

    // Menor desvio gana. A igual desvio gana la talla mas chica: si el cuerpo
    // esta justo entre dos, la mas chica queda ajustada y la mas grande
    // holgada, y es mas facil ver que algo queda grande que darse cuenta de que
    // hubiera entrado en la de al lado.
    puntajes.sort((a, b) => a.desvio - b.desvio || a.fila.orden - b.fila.orden)
    const mejor = puntajes[0]

    const fuera = mejor.desvio > DESVIO_FUERA_DE_GUIA
    const ajuste = this.ajuste(mejor, cuerpo)

    // La alternativa solo tiene sentido si el cuerpo no entro limpio en una
    // talla: si entro, ofrecer una segunda opcion solo siembra la duda.
    const segunda = mejor.desvio > 0 ? puntajes[1] : undefined

    const stock = productoId ? await this.stockDe(productoId, mejor.fila.talla_id) : null

    return {
      talla_id: mejor.fila.talla_id,
      talla: mejor.fila.talla,
      ajuste,
      confianza: this.confianza(mejor, cuerpo, fuera),
      motivo: this.motivo(mejor, cuerpo, ajuste, fuera),
      alternativa:
        segunda === undefined
          ? null
          : {
              talla_id: segunda.fila.talla_id,
              talla: segunda.fila.talla,
              ajuste: this.ajuste(segunda, cuerpo),
            },
      hay_stock: stock === null ? null : stock.hay,
      variante_id: stock?.variante_id ?? null,
    }
  }

  // ==========================================================================

  private async cargarGuia(categoriaId: number): Promise<FilaGuia[]> {
    const filas = await this.prisma.guia_talla.findMany({
      where: { categoria_id: categoriaId },
      include: { talla: { select: { nombre: true, orden: true } } },
    })

    return filas
      .map((f) => {
        const rango = (min: unknown, max: unknown) =>
          min === null || max === null ? undefined : { min: Number(min), max: Number(max) }

        return {
          talla_id: f.talla_id,
          talla: f.talla.nombre,
          orden: f.talla.orden ?? f.talla_id,
          rangos: {
            busto: rango(f.busto_min, f.busto_max),
            cintura: rango(f.cintura_min, f.cintura_max),
            cadera: rango(f.cadera_min, f.cadera_max),
          },
        }
      })
      .sort((a, b) => a.orden - b.orden)
  }

  /**
   * Que tan bien le queda esta talla.
   *
   * Solo se comparan las medidas que la fila declara Y la clienta tiene. El
   * desvio se promedia por la cantidad comparada, no se suma: si no, una
   * categoria que mira tres medidas siempre daria un desvio mayor que una que
   * mira dos, y las confianzas no serian comparables entre categorias.
   */
  private puntuar(fila: FilaGuia, cuerpo: Cuerpo): Puntaje | null {
    const valores: { rango: { min: number; max: number }; valor: number }[] = []

    const tomar = (clave: 'busto' | 'cintura' | 'cadera', valor: number | null) => {
      const rango = fila.rangos[clave]
      if (rango && valor !== null) valores.push({ rango, valor })
    }

    tomar('busto', cuerpo.busto_cm)
    tomar('cintura', cuerpo.cintura_cm)
    tomar('cadera', cuerpo.cadera_cm)

    if (valores.length === 0) return null

    let desvio = 0
    let posicion = 0

    for (const { rango, valor } of valores) {
      if (valor < rango.min) desvio += rango.min - valor
      else if (valor > rango.max) desvio += valor - rango.max

      const ancho = rango.max - rango.min
      // Con el rango degenerado se toma el centro: no hay donde ubicarse.
      const dentro = ancho <= 0 ? 0.5 : (valor - rango.min) / ancho
      posicion += Math.min(1, Math.max(0, dentro))
    }

    return {
      fila,
      desvio: desvio / valores.length,
      posicion: posicion / valores.length,
      comparadas: valores.length,
    }
  }

  /**
   * Como le va a quedar.
   *
   * Dentro del rango se mira donde cae: en el tercio alto la prenda queda
   * ajustada, en el bajo holgada. Fuera del rango no hay que pensarlo —si su
   * medida supera el maximo, aprieta—.
   */
  private ajuste(p: Puntaje, _cuerpo: Cuerpo): Ajuste {
    if (p.desvio > 0) return p.posicion >= 0.5 ? 'ajustado' : 'holgado'
    if (p.posicion >= 0.67) return 'ajustado'
    if (p.posicion <= 0.33) return 'holgado'
    return 'justo'
  }

  /**
   * Cuanto se puede confiar en esta recomendacion.
   *
   * Baja por tres motivos distintos y acumulables: medidas que la clienta no
   * midio, un cuerpo que no entra limpio en ninguna talla, y una categoria que
   * decide con menos medidas. El numero se muestra: prometer una talla exacta
   * cuando el dato es flojo es lo que llena el mostrador de devoluciones.
   */
  private confianza(p: Puntaje, cuerpo: Cuerpo, fuera: boolean): number {
    let c = 1

    if (cuerpo.estimadas) c *= 0.7
    if (fuera) c *= 0.45
    else if (p.desvio > 0) c *= 1 - Math.min(0.5, p.desvio / (DESVIO_FUERA_DE_GUIA * 2))

    // Una sola medida comparada es una pista, no una medicion.
    if (p.comparadas === 1) c *= 0.8

    return Math.round(Math.max(0.1, c) * 100) / 100
  }

  private motivo(p: Puntaje, cuerpo: Cuerpo, ajuste: Ajuste, fuera: boolean): string {
    const partes: string[] = []

    if (fuera) {
      partes.push(
        `Tus medidas quedan fuera de la guia de esta categoria; ${p.fila.talla} es la mas cercana`
      )
    } else if (p.desvio > 0) {
      partes.push(`Estas entre dos tallas y ${p.fila.talla} es la que mejor entra`)
    } else {
      partes.push(`Tus medidas caen dentro de la talla ${p.fila.talla}`)
    }

    if (ajuste !== 'justo') partes.push(`te va a quedar ${ajuste === 'ajustado' ? 'al cuerpo' : 'holgada'}`)
    if (cuerpo.estimadas) partes.push('con medidas estimadas a partir de tu altura y peso')

    return partes.join(', ')
  }

  /**
   * Si esa talla existe y tiene stock en el producto que se esta mirando.
   *
   * Recomendar una M que no hay es peor que no recomendar nada: manda a la
   * clienta a buscar algo que no va a encontrar. Se responde `hay: false` y la
   * pantalla lo dice.
   */
  private async stockDe(productoId: number, tallaId: number) {
    const variantes = await this.prisma.variante.findMany({
      where: { producto_id: productoId, talla_id: tallaId, activo: true },
      select: { id: true, inventario: { select: { stock: true, stock_reservado: true } } },
    })

    if (variantes.length === 0) return { hay: false, variante_id: null }

    const conStock = variantes.find((v) =>
      v.inventario.some((i) => i.stock - i.stock_reservado > 0)
    )

    return {
      hay: conStock !== undefined,
      variante_id: (conStock ?? variantes[0]).id,
    }
  }
}
