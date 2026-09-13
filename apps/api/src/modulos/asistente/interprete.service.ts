import { Injectable } from '@nestjs/common'
import type { Interpretacion, PlantillaReporte } from '@aurora/contratos'
import { SINONIMOS_REPORTE } from '@aurora/contratos'

/** Lo que hace falta saber del entorno para resolver "en la Ventura". */
export interface ContextoInterprete {
  sucursales: { id: number; nombre: string }[]
  /** Sucursal del usuario, si esta limitado a una. */
  sucursalPropia: number | null
  ahora: Date
}

/**
 * Interprete determinista de preguntas en español.
 *
 * Traduce "¿cuánto vendimos ayer en la Ventura?" a
 * `{ codigo: 'ventas_por_rango', parametros: { desde, hasta, sucursal_id } }`.
 *
 * Por que existe, si hay un modelo de lenguaje disponible: porque el modelo
 * puede no estarlo. Una clave sin saldo, un corte de internet o una cuota
 * agotada dejarian al asistente mudo justo el dia de la demostracion. Este
 * interprete cubre las preguntas que la gente de una tienda hace de verdad —que
 * son pocas y repetidas— y el modelo se ocupa del resto.
 *
 * No intenta entender lenguaje natural en general. Hace tres cosas y las hace
 * bien: reconocer de que reporte se habla, en que periodo, y de que sucursal.
 */
@Injectable()
export class InterpreteService {
  /**
   * Quita tildes y baja a minusculas.
   *
   * La gente escribe "cuánto" y "cuanto" indistintamente, y en un teclado de
   * celular casi siempre sin tilde. Comparar sin normalizar haria que la mitad
   * de las preguntas no encuentren su sinonimo.
   */
  private normalizar(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[¿?¡!.,;:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  interpretar(
    pregunta: string,
    plantillas: PlantillaReporte[],
    ctx: ContextoInterprete
  ): Interpretacion {
    const texto = this.normalizar(pregunta)

    const reporte = this.reconocerReporte(texto, plantillas)
    if (!reporte) {
      return {
        codigo: null,
        parametros: {},
        confianza: 0,
        motivo: 'No reconoci de que reporte se trata',
        resuelto_por: 'ninguno',
      }
    }

    const plantilla = plantillas.find((p) => p.codigo === reporte.codigo)!
    const parametros: Record<string, unknown> = {}
    const reconocido: string[] = [reporte.comoSeReconocio]

    // --- Periodo --------------------------------------------------------
    if ('desde' in plantilla.parametros) {
      const periodo = this.reconocerPeriodo(texto, ctx.ahora)
      parametros.desde = periodo.desde.toISOString()
      parametros.hasta = periodo.hasta.toISOString()
      reconocido.push(periodo.comoSeReconocio)
    }

    // --- Sucursal -------------------------------------------------------
    if ('sucursal_id' in plantilla.parametros) {
      if (ctx.sucursalPropia !== null) {
        // El servidor la fuerza igual; decirlo evita que el usuario crea que
        // su filtro se ignoro por un error.
        parametros.sucursal_id = ctx.sucursalPropia
        reconocido.push('acotado a tu sucursal')
      } else {
        const sucursal = this.reconocerSucursal(texto, ctx.sucursales)
        if (sucursal) {
          parametros.sucursal_id = sucursal.id
          reconocido.push(`en ${sucursal.nombre}`)
        }
      }
    }

    // --- Cantidad, para los rankings ------------------------------------
    if ('limite' in plantilla.parametros) {
      const limite = this.reconocerLimite(texto)
      if (limite !== null) {
        parametros.limite = limite
        reconocido.push(`los ${limite} primeros`)
      }
    }

    return {
      codigo: reporte.codigo,
      parametros,
      confianza: reporte.confianza,
      motivo: reconocido.join(' · '),
      resuelto_por: 'interprete',
    }
  }

  // ==========================================================================
  // De que reporte se habla
  // ==========================================================================

  private reconocerReporte(
    texto: string,
    plantillas: PlantillaReporte[]
  ): { codigo: string; confianza: number; comoSeReconocio: string } | null {
    let mejor: { codigo: string; confianza: number; comoSeReconocio: string } | null = null

    for (const plantilla of plantillas) {
      if (!plantilla.disponible) continue

      const sinonimos = SINONIMOS_REPORTE[plantilla.codigo] ?? []
      for (const sinonimo of sinonimos) {
        const frase = this.normalizar(sinonimo)

        // Frase completa: es lo mas fiable que puede pasar.
        if (texto.includes(frase)) {
          const confianza = 0.9
          if (!mejor || confianza > mejor.confianza) {
            mejor = { codigo: plantilla.codigo, confianza, comoSeReconocio: `"${sinonimo}"` }
          }
          continue
        }

        // Si no esta la frase entera, cuantas de sus palabras significativas
        // aparecen. Las palabras de menos de cuatro letras no cuentan: "que",
        // "por" y "mas" estan en cualquier pregunta y solo agregan ruido.
        const palabras = frase.split(' ').filter((p) => p.length >= 4)
        if (palabras.length === 0) continue

        const presentes = palabras.filter((p) => texto.includes(p)).length
        const proporcion = presentes / palabras.length

        if (proporcion >= 0.6) {
          const confianza = 0.5 + proporcion * 0.35
          if (!mejor || confianza > mejor.confianza) {
            mejor = {
              codigo: plantilla.codigo,
              confianza,
              comoSeReconocio: `parecido a "${sinonimo}"`,
            }
          }
        }
      }
    }

    return mejor
  }

  // ==========================================================================
  // De que periodo
  // ==========================================================================

  private inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  private finDelDia = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

  private diasAtras(ahora: Date, dias: number): Date {
    const d = new Date(ahora)
    d.setDate(d.getDate() - dias)
    return d
  }

  /**
   * Reconoce el periodo del que se habla.
   *
   * Sin periodo explicito se asume el mes: es lo que la gente quiere decir con
   * "¿cómo venimos?", y devolver todo el historico daria un numero que no sirve
   * para decidir nada.
   */
  private reconocerPeriodo(
    texto: string,
    ahora: Date
  ): { desde: Date; hasta: Date; comoSeReconocio: string } {
    if (/\bhoy\b/.test(texto)) {
      return {
        desde: this.inicioDelDia(ahora),
        hasta: this.finDelDia(ahora),
        comoSeReconocio: 'hoy',
      }
    }

    if (/\bayer\b/.test(texto)) {
      const ayer = this.diasAtras(ahora, 1)
      return {
        desde: this.inicioDelDia(ayer),
        hasta: this.finDelDia(ayer),
        comoSeReconocio: 'ayer',
      }
    }

    if (/\banteayer\b|\bantes de ayer\b/.test(texto)) {
      const dia = this.diasAtras(ahora, 2)
      return {
        desde: this.inicioDelDia(dia),
        hasta: this.finDelDia(dia),
        comoSeReconocio: 'anteayer',
      }
    }

    if (/semana pasada|ultima semana|semana anterior/.test(texto)) {
      return {
        desde: this.inicioDelDia(this.diasAtras(ahora, 7)),
        hasta: this.finDelDia(ahora),
        comoSeReconocio: 'la semana pasada',
      }
    }

    if (/esta semana|de la semana/.test(texto)) {
      // Semana corrida de lunes a hoy, que es como se mira en una tienda.
      const diaSemana = (ahora.getDay() + 6) % 7
      return {
        desde: this.inicioDelDia(this.diasAtras(ahora, diaSemana)),
        hasta: this.finDelDia(ahora),
        comoSeReconocio: 'esta semana',
      }
    }

    if (/mes pasado|ultimo mes|mes anterior/.test(texto)) {
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
      const fin = new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59, 999)
      return { desde: inicio, hasta: fin, comoSeReconocio: 'el mes pasado' }
    }

    if (/este mes|del mes/.test(texto)) {
      return {
        desde: new Date(ahora.getFullYear(), ahora.getMonth(), 1),
        hasta: this.finDelDia(ahora),
        comoSeReconocio: 'este mes',
      }
    }

    if (/este anio|este año|del anio|del año/.test(texto)) {
      return {
        desde: new Date(ahora.getFullYear(), 0, 1),
        hasta: this.finDelDia(ahora),
        comoSeReconocio: 'este anio',
      }
    }

    // "los ultimos 15 dias"
    const ultimos = texto.match(/ultimos?\s+(\d{1,3})\s+dias?/)
    if (ultimos) {
      const dias = Math.min(Number(ultimos[1]), 730)
      return {
        desde: this.inicioDelDia(this.diasAtras(ahora, dias - 1)),
        hasta: this.finDelDia(ahora),
        comoSeReconocio: `los ultimos ${dias} dias`,
      }
    }

    return {
      desde: this.inicioDelDia(this.diasAtras(ahora, 29)),
      hasta: this.finDelDia(ahora),
      comoSeReconocio: 'los ultimos 30 dias (no dijiste el periodo)',
    }
  }

  // ==========================================================================
  // De que sucursal
  // ==========================================================================

  /**
   * Reconoce la sucursal por cualquier palabra distintiva de su nombre.
   *
   * Nadie dice "Aurora Ventura Mall": dicen "la Ventura". Por eso se compara
   * palabra por palabra y se descarta "aurora", que esta en todas y no
   * distingue nada.
   */
  private reconocerSucursal(
    texto: string,
    sucursales: { id: number; nombre: string }[]
  ): { id: number; nombre: string } | null {
    const genericas = new Set(['aurora', 'sucursal', 'tienda', 'local', 'mall', 'centro', 'de'])

    for (const sucursal of sucursales) {
      const palabras = this.normalizar(sucursal.nombre)
        .split(' ')
        .filter((p) => p.length >= 4 && !genericas.has(p))

      if (palabras.some((p) => texto.includes(p))) return sucursal
    }

    // "Centro" es generica porque aparece en dos sucursales, pero si se nombra
    // sola y sin "distribucion" al lado, es la de Aurora Centro.
    if (/\bcentro\b/.test(texto) && !/distribucion/.test(texto)) {
      const centro = sucursales.find((s) => this.normalizar(s.nombre).includes('centro'))
      if (centro) return centro
    }

    return null
  }

  private reconocerLimite(texto: string): number | null {
    const top = texto.match(/\b(?:top|primeros?|mejores?)\s+(\d{1,3})\b/)
    if (top) return Math.min(Number(top[1]), 100)

    const cuantos = texto.match(/\b(\d{1,3})\s+(?:productos?|prendas?|vendedor|mas vendidos?)/)
    if (cuantos) return Math.min(Number(cuantos[1]), 100)

    return null
  }
}
