import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type {
  Avatar,
  DatosMedidas,
  MedidasCliente,
  ParametrosAvatar,
  TipoCuerpo,
} from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'

/** Las tres medidas con las que se decide una talla. */
type Contorno = 'busto_cm' | 'cintura_cm' | 'cadera_cm'

/**
 * Proporciones con las que se completa lo que la clienta no midio.
 *
 * No son inventadas: son las que tiene la propia `guia_talla` sembrada. En la
 * talla M de vestidos, cintura 70-75 contra busto 88-93 y cadera 96-101 da
 * cintura/busto = 0.79 y cintura/cadera = 0.73. Usar esas mismas relaciones
 * mantiene la estimacion coherente con la tabla contra la que despues se
 * compara; con numeros de otra fuente, una clienta estimada caeria
 * sistematicamente en la talla de al lado.
 */
const CINTURA_SOBRE_BUSTO = 0.79
const CINTURA_SOBRE_CADERA = 0.73

/**
 * Cintura estimada a partir de altura y peso.
 *
 * El torso se trata como un cilindro: el peso crece con la altura por el area
 * de la seccion, o sea con el cuadrado del contorno. Despejando, el contorno va
 * con la raiz de (peso / altura). No es una regresion sobre una poblacion
 * —seria mas fino y no tenemos esos datos— pero se apoya en algo y no en una
 * constante elegida a dedo.
 *
 * La constante se calibra con una referencia comoda de comprobar: 165 cm y
 * 60 kg dan 70 cm de cintura.
 *
 *   k = 70 / raiz(60 / 1.65) = 11.6
 */
const K_CILINDRO = 11.6

const estimarCintura = (alturaCm: number, pesoKg: number) =>
  Math.round(K_CILINDRO * Math.sqrt(pesoKg / (alturaCm / 100)) * 10) / 10

@Injectable()
export class MedidasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resuelve el cliente de la sesion.
   *
   * En este esquema `cliente.usuario_id` ES la clave primaria del cliente, asi
   * que el id del cliente y el del usuario coinciden. Se consulta igual en vez
   * de asumirlo: el personal de la tienda tiene usuario pero no ficha de
   * cliente, y no tiene por que tener medidas.
   */
  private async clienteDe(usuario: UsuarioAutenticado): Promise<number> {
    const cliente = await this.prisma.cliente.findUnique({
      where: { usuario_id: usuario.id },
      select: { usuario_id: true },
    })
    if (!cliente) {
      throw ExcepcionNegocio.sinPermiso(
        'El probador es de la cuenta de cliente; el personal de tienda no tiene medidas'
      )
    }
    return cliente.usuario_id
  }

  /**
   * Completa las medidas que falten.
   *
   * Devuelve tambien cuales completo, porque la pantalla tiene que poder
   * decirlo: una talla calculada sobre una cintura que la clienta nunca midio
   * no merece la misma confianza que una medida de verdad, y ocultar la
   * diferencia seria el tipo de mentira que hace que despues devuelvan la
   * prenda.
   */
  private completar(datos: DatosMedidas): {
    medidas: Record<Contorno, number> & { entrepierna_cm: number | null; hombro_cm: number | null }
    estimadas: Contorno[]
  } {
    const estimadas: Contorno[] = []

    // La cintura manda: es la que se estima directo de altura y peso, y de ella
    // salen las otras dos por proporcion.
    let cintura = datos.cintura_cm ?? null
    if (cintura === null) {
      cintura = estimarCintura(datos.altura_cm, datos.peso_kg)
      estimadas.push('cintura_cm')
    }

    let busto = datos.busto_cm ?? null
    if (busto === null) {
      busto = Math.round((cintura / CINTURA_SOBRE_BUSTO) * 10) / 10
      estimadas.push('busto_cm')
    }

    let cadera = datos.cadera_cm ?? null
    if (cadera === null) {
      cadera = Math.round((cintura / CINTURA_SOBRE_CADERA) * 10) / 10
      estimadas.push('cadera_cm')
    }

    return {
      medidas: {
        busto_cm: busto,
        cintura_cm: cintura,
        cadera_cm: cadera,
        entrepierna_cm: datos.entrepierna_cm ?? null,
        hombro_cm: datos.hombro_cm ?? null,
      },
      estimadas,
    }
  }

  /**
   * Guarda las medidas y deja el avatar al dia.
   *
   * Van juntas en una transaccion porque el avatar se deriva de las medidas: si
   * se guardara una sin la otra, el dibujo quedaria mostrando un cuerpo que ya
   * no corresponde a la talla que se recomienda, y no hay nada mas confuso que
   * eso.
   */
  async guardar(datos: DatosMedidas, usuario: UsuarioAutenticado): Promise<MedidasCliente> {
    const clienteId = await this.clienteDe(usuario)
    const { medidas, estimadas } = this.completar(datos)

    // `escaneo_camara` lo pone el flujo de camara, no este: aqui solo se
    // distingue lo que la clienta midio de lo que completo el servidor.
    const origen = estimadas.length > 0 ? 'estimado' : 'manual'

    const fila = {
      altura_cm: new Prisma.Decimal(datos.altura_cm),
      peso_kg: new Prisma.Decimal(datos.peso_kg),
      busto_cm: new Prisma.Decimal(medidas.busto_cm),
      cintura_cm: new Prisma.Decimal(medidas.cintura_cm),
      cadera_cm: new Prisma.Decimal(medidas.cadera_cm),
      entrepierna_cm:
        medidas.entrepierna_cm === null ? null : new Prisma.Decimal(medidas.entrepierna_cm),
      hombro_cm: medidas.hombro_cm === null ? null : new Prisma.Decimal(medidas.hombro_cm),
      origen,
      actualizado_en: new Date(),
    } as const

    const parametros = this.parametrosAvatar(datos.altura_cm, medidas)
    const tipo = this.tipoCuerpo(medidas)

    const [guardada] = await this.prisma.$transaction([
      this.prisma.medida_cliente.upsert({
        where: { cliente_id: clienteId },
        create: { cliente_id: clienteId, ...fila },
        update: fila,
      }),
      this.prisma.avatar.upsert({
        where: { cliente_id: clienteId },
        create: {
          cliente_id: clienteId,
          tipo_cuerpo: tipo,
          parametros: parametros as unknown as Prisma.InputJsonValue,
        },
        update: {
          tipo_cuerpo: tipo,
          parametros: parametros as unknown as Prisma.InputJsonValue,
          actualizado_en: new Date(),
        },
      }),
    ])

    return this.aContrato(guardada, estimadas)
  }

  async mias(usuario: UsuarioAutenticado): Promise<MedidasCliente | null> {
    const clienteId = await this.clienteDe(usuario)
    const fila = await this.prisma.medida_cliente.findUnique({ where: { cliente_id: clienteId } })
    if (!fila) return null

    // Cuales fueron estimadas no se guarda columna por columna —la tabla tiene
    // un solo `origen`—, asi que al releer solo se puede decir que hubo
    // estimacion, no exactamente en cual. Se informa lo que se sabe.
    return this.aContrato(fila, fila.origen === 'estimado' ? ['cintura_cm'] : [])
  }

  async avatar(usuario: UsuarioAutenticado): Promise<Avatar | null> {
    const clienteId = await this.clienteDe(usuario)
    const fila = await this.prisma.avatar.findUnique({ where: { cliente_id: clienteId } })
    if (!fila) return null

    return {
      tipo_cuerpo: fila.tipo_cuerpo,
      parametros: fila.parametros as unknown as ParametrosAvatar,
      actualizado_en: fila.actualizado_en.toISOString(),
    }
  }

  /** Las medidas que usa el recomendador, o null si la clienta no cargo ninguna. */
  async paraRecomendar(clienteId: number) {
    const fila = await this.prisma.medida_cliente.findUnique({ where: { cliente_id: clienteId } })
    if (!fila) return null

    return {
      altura_cm: Number(fila.altura_cm),
      busto_cm: fila.busto_cm === null ? null : Number(fila.busto_cm),
      cintura_cm: fila.cintura_cm === null ? null : Number(fila.cintura_cm),
      cadera_cm: fila.cadera_cm === null ? null : Number(fila.cadera_cm),
      estimadas: fila.origen === 'estimado',
    }
  }

  /** Igual que `clienteDe`, para los servicios del modulo. */
  async exigirCliente(usuario: UsuarioAutenticado): Promise<number> {
    return this.clienteDe(usuario)
  }

  // ==========================================================================
  // Avatar
  // ==========================================================================

  /**
   * Proporciones para dibujar el avatar.
   *
   * Se normalizan contra la altura en lugar de mandar centimetros: asi el
   * navegador dibuja en un lienzo de cualquier tamanio multiplicando, sin tener
   * que pedirle nada mas al servidor. El contorno se divide por PI para pasar
   * de perimetro a ancho, que es lo que se dibuja.
   */
  private parametrosAvatar(
    alturaCm: number,
    m: Record<Contorno, number>
  ): ParametrosAvatar {
    const ancho = (contorno: number) => Math.round((contorno / Math.PI / alturaCm) * 1000) / 1000

    return {
      // El hombro no siempre se mide; se deriva del busto, que es la medida
      // cercana que si esta siempre.
      hombros: ancho(m.busto_cm * 1.06),
      busto: ancho(m.busto_cm),
      cintura: ancho(m.cintura_cm),
      cadera: ancho(m.cadera_cm),
      torso: 0.32,
    }
  }

  /**
   * Tipo de cuerpo segun la relacion entre los tres contornos.
   *
   * Es la clasificacion que usa la industria de la ropa, y sirve para algo
   * concreto: a un triangulo le conviene guiarse por la cadera y a un triangulo
   * invertido por el busto. El umbral del 5% evita que una diferencia de un
   * centimetro cambie la categoria.
   */
  private tipoCuerpo(m: Record<Contorno, number>): TipoCuerpo {
    const { busto_cm: busto, cintura_cm: cintura, cadera_cm: cadera } = m
    const parecidos = Math.abs(busto - cadera) / Math.max(busto, cadera) <= 0.05
    const cinturaMarcada = cintura <= Math.min(busto, cadera) * 0.8

    if (parecidos) return cinturaMarcada ? 'reloj_arena' : 'rectangulo'
    if (cadera > busto) return 'triangulo'
    if (busto > cadera) return 'triangulo_invertido'
    return cintura >= busto ? 'ovalado' : 'rectangulo'
  }

  // ==========================================================================

  private aContrato(
    fila: {
      altura_cm: Prisma.Decimal
      peso_kg: Prisma.Decimal
      busto_cm: Prisma.Decimal | null
      cintura_cm: Prisma.Decimal | null
      cadera_cm: Prisma.Decimal | null
      entrepierna_cm: Prisma.Decimal | null
      hombro_cm: Prisma.Decimal | null
      origen: string
      actualizado_en: Date
    },
    estimadas: string[]
  ): MedidasCliente {
    const n = (d: Prisma.Decimal | null) => (d === null ? null : Number(d))

    return {
      altura_cm: Number(fila.altura_cm),
      peso_kg: Number(fila.peso_kg),
      busto_cm: n(fila.busto_cm),
      cintura_cm: n(fila.cintura_cm),
      cadera_cm: n(fila.cadera_cm),
      entrepierna_cm: n(fila.entrepierna_cm),
      hombro_cm: n(fila.hombro_cm),
      origen: fila.origen as MedidasCliente['origen'],
      actualizado_en: fila.actualizado_en.toISOString(),
      estimadas,
    }
  }
}
