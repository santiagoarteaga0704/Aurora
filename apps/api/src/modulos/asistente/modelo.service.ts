import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Anthropic from '@anthropic-ai/sdk'
import type { Interpretacion, PlantillaReporte } from '@aurora/contratos'

/**
 * La unica herramienta que el modelo puede usar.
 *
 * Recibe un codigo de plantilla y sus parametros. Nada mas. El modelo NO
 * escribe SQL y no tiene por donde: el esquema no tiene ningun campo donde
 * meterlo, y aunque devolviera un codigo inventado, el motor de reportes solo
 * ejecuta plantillas que existen en la base.
 *
 * Es la misma garantia que da la pantalla de reportes, y por eso el asistente
 * se pudo montar encima sin abrir ninguna puerta nueva.
 *
 * `strict: true` hace que la API valide la forma antes de devolverla, asi que
 * no hace falta revalidar el JSON de la herramienta aqui.
 */
const HERRAMIENTA_REPORTE: Anthropic.Tool = {
  name: 'pedir_reporte',
  description:
    'Ejecuta uno de los reportes disponibles. Usala siempre que la pregunta se pueda responder con alguno; si ninguno corresponde, pasa codigo en null.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      codigo: {
        type: ['string', 'null'],
        description: 'Codigo exacto de una de las plantillas ofrecidas, o null si ninguna sirve',
      },
      parametros: {
        type: 'object',
        description: 'Valores de los parametros que la plantilla declara',
        additionalProperties: true,
      },
      motivo: {
        type: 'string',
        description: 'En una frase corta y en espaniol, que se entendio de la pregunta',
      },
    },
    required: ['codigo', 'parametros', 'motivo'],
    additionalProperties: false,
  },
}

/** La forma que `strict: true` garantiza en `tool_use.input`. */
interface EntradaReporte {
  codigo: string | null
  parametros: Record<string, unknown>
  motivo: string
}

@Injectable()
export class ModeloService {
  private readonly log = new Logger('Modelo')
  private cliente: Anthropic | null = null

  constructor(private readonly config: ConfigService) {
    const clave = this.config.get<string>('ANTHROPIC_API_KEY')
    if (clave && clave.trim() !== '') {
      this.cliente = new Anthropic({ apiKey: clave })
      this.log.log('Asistente con modelo de lenguaje habilitado')
    } else {
      this.log.log('Sin ANTHROPIC_API_KEY: el asistente usa solo el interprete propio')
    }
  }

  get disponible(): boolean {
    return this.cliente !== null
  }

  /**
   * Le pide al modelo que elija plantilla y parametros.
   *
   * Devuelve `null` cuando no hay clave configurada o cuando la llamada falla.
   * Ese null no es un error: significa "el interprete propio tiene la ultima
   * palabra", que es el comportamiento normal de la aplicacion sin clave.
   *
   * Por eso tampoco se configuran los reintentos con respaldo de servidor que
   * se usarian en una aplicacion que depende del modelo: aqui el respaldo ya
   * existe y es mejor —es determinista y no cuesta nada—, asi que cualquier
   * fallo simplemente cae en el.
   */
  async interpretar(
    pregunta: string,
    plantillas: PlantillaReporte[],
    contexto: { sucursales: { id: number; nombre: string }[]; hoy: string }
  ): Promise<Interpretacion | null> {
    if (!this.cliente) return null

    const catalogo = plantillas
      .filter((p) => p.disponible)
      .map((p) => {
        const params = Object.entries(p.parametros)
          .map(([nombre, spec]) => {
            const opciones = spec.opciones ? ` (uno de: ${spec.opciones.join(', ')})` : ''
            return `    - ${nombre}: ${spec.tipo}${spec.requerido ? ', obligatorio' : ', opcional'}${opciones}`
          })
          .join('\n')
        return `- ${p.codigo}: ${p.nombre}. ${p.descripcion ?? ''}\n${params}`
      })
      .join('\n')

    const sucursales = contexto.sucursales.map((s) => `  - ${s.id}: ${s.nombre}`).join('\n')

    const instrucciones = [
      'Sos el asistente de AURORA, una tienda de ropa femenina en Bolivia.',
      'Traduci la pregunta del usuario a UNA de las plantillas de reporte disponibles.',
      '',
      'Plantillas:',
      catalogo,
      '',
      'Sucursales:',
      sucursales,
      '',
      `Hoy es ${contexto.hoy}. Las fechas van en formato ISO 8601 completo.`,
      'Si la pregunta no corresponde a ninguna plantilla, devolve codigo null.',
      'No inventes parametros que la plantilla no declare.',
    ].join('\n')

    try {
      const respuesta = await this.cliente.messages.create({
        model: 'claude-opus-5',
        max_tokens: 2048,
        system: instrucciones,
        messages: [{ role: 'user', content: pregunta }],
        tools: [HERRAMIENTA_REPORTE],
        // Se la obliga a usar la herramienta: sin esto puede contestar en prosa
        // "creo que queres ver las ventas", que no sirve para ejecutar nada.
        tool_choice: { type: 'tool', name: HERRAMIENTA_REPORTE.name },
        output_config: {
          // Es una clasificacion corta: no necesita razonamiento profundo, y
          // bajar el esfuerzo la hace mas barata y bastante mas rapida, que es
          // lo que importa cuando alguien espera en el mostrador.
          effort: 'low',
        },
      })

      const bloque = respuesta.content.find((b) => b.type === 'tool_use')
      if (!bloque || bloque.type !== 'tool_use') return null

      const salida = bloque.input as EntradaReporte

      // Un codigo que no existe se descarta: el modelo pudo haber alucinado uno.
      const existe = plantillas.some((p) => p.codigo === salida.codigo && p.disponible)

      return {
        codigo: existe ? salida.codigo : null,
        parametros: existe ? salida.parametros : {},
        confianza: existe ? 0.8 : 0,
        motivo: salida.motivo,
        resuelto_por: 'modelo',
      }
    } catch (e) {
      this.log.warn(`El modelo no pudo responder: ${(e as Error).message}`)
      return null
    }
  }
}
