import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import type {
  DatosConsultaConversaciones,
  DatosPreguntar,
  Interpretacion,
  MensajeChat,
  RespuestaAsistente,
  ResultadoReporte,
} from '@aurora/contratos'
import { PERMISOS, PREGUNTAS_EJEMPLO, salto } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import { PermisosService } from '../../nucleo/autenticacion/permisos.service'
import { ReportesService } from '../reportes/reportes.service'
import { InterpreteService } from './interprete.service'
import { ModeloService } from './modelo.service'
import { bs } from '../../nucleo/util/decimal'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'

// Columnas que identifican sin nombrar: un SKU es unico por definicion, asi
// que siempre gana por variedad, y "encabeza VES-MIDI-01-01" no le dice nada a
// nadie. Se las descarta como etiqueta salvo que no quede otra.
const ES_CODIGO = /^(sku|codigo|numero|referencia)$|_(sku|codigo|id)$|^id$/i

/** Debajo de esto, el interprete propio no se considera seguro de si mismo. */
const CONFIANZA_MINIMA = 0.65

@Injectable()
export class AsistenteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportes: ReportesService,
    private readonly interprete: InterpreteService,
    private readonly modelo: ModeloService,
    private readonly permisos: PermisosService,
    private readonly bitacora: BitacoraService
  ) {}

  /**
   * Responde una pregunta.
   *
   * El orden importa: primero el interprete propio, que es instantaneo y
   * gratis. Solo si no queda convencido se consulta al modelo, y solo si hay
   * clave. Al reves se pagaria una llamada por cada "¿cuánto vendimos ayer?",
   * que es justo la pregunta que el interprete resuelve mejor.
   */
  async preguntar(
    datos: DatosPreguntar,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<RespuestaAsistente> {
    const conversacion = await this.abrirConversacion(datos, usuario)

    await this.guardarMensaje(conversacion.id, 'usuario', datos.texto)

    const plantillas = await this.reportes.plantillas(usuario)
    const sucursales = await this.prisma.sucursal.findMany({
      where: { activo: true },
      select: { id: true, nombre: true },
    })

    const ahora = new Date()
    let interpretacion: Interpretacion = this.interprete.interpretar(datos.texto, plantillas, {
      sucursales,
      sucursalPropia: this.permisos.restringeSucursal(usuario),
      ahora,
    })

    if (interpretacion.confianza < CONFIANZA_MINIMA && this.modelo.disponible) {
      const delModelo = await this.modelo.interpretar(datos.texto, plantillas, {
        sucursales,
        hoy: ahora.toISOString(),
      })
      // Se queda la del modelo solo si de verdad reconocio algo.
      if (delModelo && delModelo.codigo) interpretacion = delModelo
    }

    if (!interpretacion.codigo) {
      const respuesta = this.noEntendi(interpretacion)
      await this.guardarMensaje(conversacion.id, 'asistente', respuesta, null, { interpretacion })
      return {
        conversacion_id: conversacion.id.toString(),
        respuesta,
        interpretacion,
        reporte: null,
        sugerencias: [...PREGUNTAS_EJEMPLO],
      }
    }

    // A partir de aqui se pide un reporte, asi que hace falta el permiso.
    if (!this.permisos.puede(usuario.permisos, PERMISOS.REPORTE_DEMANDA)) {
      throw ExcepcionNegocio.sinPermiso(
        'Te falta el permiso para pedir reportes bajo demanda (reporte.demanda)'
      )
    }

    let reporte: ResultadoReporte
    try {
      reporte = await this.reportes.ejecutar(
        interpretacion.codigo,
        {
          parametros: interpretacion.parametros,
          pregunta: datos.texto,
          entrada: datos.entrada,
        },
        usuario,
        ctx
      )
    } catch (e) {
      const aviso = `Entendi que querias "${interpretacion.motivo}", pero el reporte no se pudo generar: ${(e as Error).message}`
      await this.guardarMensaje(conversacion.id, 'asistente', aviso, null, { interpretacion })
      return {
        conversacion_id: conversacion.id.toString(),
        respuesta: aviso,
        interpretacion,
        reporte: null,
        sugerencias: [...PREGUNTAS_EJEMPLO],
      }
    }

    const respuesta = this.redactar(reporte, interpretacion)

    await this.guardarMensaje(conversacion.id, 'herramienta', null, interpretacion.codigo, {
      parametros: interpretacion.parametros,
      filas: reporte.total_filas,
    })
    await this.guardarMensaje(conversacion.id, 'asistente', respuesta, null, { interpretacion })

    await this.prisma.conversacion.update({
      where: { id: conversacion.id },
      data: {
        actualizado_en: new Date(),
        titulo: conversacion.titulo ?? datos.texto.slice(0, 150),
      },
    })

    await this.bitacora.registrar(ctx, {
      accion: 'consultar',
      modulo: 'ia',
      entidad: 'conversacion',
      entidadId: conversacion.id.toString(),
      descripcion: `Asistente (${interpretacion.resuelto_por}): "${datos.texto}" -> ${interpretacion.codigo}`,
    })

    return {
      conversacion_id: conversacion.id.toString(),
      respuesta,
      interpretacion,
      reporte,
      sugerencias: [],
    }
  }

  /**
   * Redacta la respuesta en palabras.
   *
   * No basta con devolver la tabla: quien pregunta por voz necesita oir una
   * frase. Se arma con las columnas del propio reporte, asi que una plantilla
   * nueva se describe sola sin tocar este codigo.
   */
  private redactar(reporte: ResultadoReporte, interpretacion: Interpretacion): string {
    if (reporte.total_filas === 0) {
      return `No hubo movimientos para lo que preguntaste: ${interpretacion.motivo}.`
    }

    const numericas = reporte.columnas.filter((c) => c.tipo === 'numero')
    const primera = reporte.filas[0]

    // Que columna nombra a la fila: la no numerica con mas valores distintos.
    // La primera a secas decia "Encabeza Aurora Centro" en el reporte de stock
    // bajo, que es cierto y no sirve para nada —lo que hay que oir es que
    // prenda falta, no en que sucursal, si son todas la misma—.
    const variedad = (nombre: string) =>
      new Set(reporte.filas.map((f) => String(f[nombre]))).size

    const noNumericas = reporte.columnas.filter((c) => c.tipo !== 'numero')
    const nombrables = noNumericas.filter((c) => !ES_CODIGO.test(c.nombre))
    const candidatas = nombrables.length > 0 ? nombrables : noNumericas

    const etiqueta = candidatas.reduce<(typeof candidatas)[number] | undefined>(
      (mejor, c) => (!mejor || variedad(c.nombre) > variedad(mejor.nombre) ? c : mejor),
      undefined
    )

    const partes: string[] = []

    // Con una sola fila se lee el dato directo; con varias, el que encabeza.
    if (reporte.total_filas === 1) {
      const detalles = numericas
        .map((c) => `${c.nombre.replace(/_/g, ' ')}: ${this.formatear(c.nombre, primera[c.nombre])}`)
        .join(', ')
      partes.push(`${reporte.nombre} — ${detalles}.`)
    } else {
      if (etiqueta) {
        const lider = numericas[0]
          ? ` con ${this.formatear(numericas[0].nombre, primera[numericas[0].nombre])} ${numericas[0].nombre.replace(/_/g, ' ')}`
          : ''
        partes.push(
          `${reporte.total_filas} resultados. Encabeza ${primera[etiqueta.nombre]}${lider}.`
        )
      } else {
        partes.push(`${reporte.total_filas} resultados.`)
      }

      // El total de la columna de dinero, que es lo que se suele querer oir.
      const dinero = numericas.find((c) => /total|monto|importe/i.test(c.nombre))
      if (dinero) {
        const suma = reporte.filas.reduce((s, f) => s + Number(f[dinero.nombre] ?? 0), 0)
        partes.push(`En conjunto suman ${bs(suma)}.`)
      }
    }

    // El motivo NO se repite aqui: viaja aparte en `interpretacion.motivo` y
    // cada canal lo muestra como corresponde —la web en letra chica debajo, la
    // voz leyendolo solo si el usuario pregunta como lo entendio—. Pegarlo al
    // texto obligaba a escuchar "parecido a top de productos, este mes" en cada
    // respuesta hablada.
    return partes.join(' ')
  }

  private formatear(columna: string, valor: unknown): string {
    if (valor === null || valor === undefined) return 'sin dato'
    if (/total|monto|importe|precio|reembolso/i.test(columna)) return bs(Number(valor))
    return String(valor)
  }

  private noEntendi(interpretacion: Interpretacion): string {
    return [
      'No pude reconocer que reporte necesitas.',
      interpretacion.resuelto_por === 'ninguno' && !this.modelo.disponible
        ? 'Proba con alguna de las preguntas de ejemplo.'
        : 'Reformulalo de otra manera o proba con un ejemplo.',
    ].join(' ')
  }

  // ==========================================================================
  // Conversaciones
  // ==========================================================================

  private async abrirConversacion(datos: DatosPreguntar, usuario: UsuarioAutenticado) {
    if (datos.conversacion_id) {
      const existente = await this.prisma.conversacion.findUnique({
        where: { id: BigInt(datos.conversacion_id) },
      })
      // Nadie escribe en la conversacion de otro.
      if (!existente || existente.usuario_id !== usuario.id) {
        throw ExcepcionNegocio.noEncontrado('Esa conversacion no existe')
      }
      return existente
    }

    return this.prisma.conversacion.create({
      data: {
        usuario_id: usuario.id,
        session_token: randomUUID(),
        canal: datos.canal,
        tipo: 'reporte',
      },
    })
  }

  private async guardarMensaje(
    conversacionId: bigint,
    rol: 'usuario' | 'asistente' | 'sistema' | 'herramienta',
    contenido: string | null,
    herramienta: string | null = null,
    payload: Record<string, unknown> | null = null
  ): Promise<void> {
    await this.prisma.mensaje.create({
      data: {
        conversacion_id: conversacionId,
        rol,
        contenido,
        herramienta,
        payload: payload === null ? undefined : JSON.parse(JSON.stringify(payload)),
      },
    })
  }

  async conversaciones(filtros: DatosConsultaConversaciones, usuario: UsuarioAutenticado) {
    const where = { usuario_id: usuario.id, tipo: filtros.tipo }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.conversacion.count({ where }),
      this.prisma.conversacion.findMany({
        where,
        orderBy: { actualizado_en: 'desc' },
        skip: salto(filtros),
        take: filtros.por_pagina,
        include: { _count: { select: { mensaje: true } } },
      }),
    ])

    return {
      total,
      items: filas.map((c) => ({
        id: c.id.toString(),
        titulo: c.titulo,
        tipo: c.tipo,
        canal: c.canal,
        mensajes: c._count.mensaje,
        creado_en: c.creado_en.toISOString(),
        actualizado_en: c.actualizado_en.toISOString(),
      })),
    }
  }

  async mensajes(conversacionId: bigint, usuario: UsuarioAutenticado): Promise<MensajeChat[]> {
    const conversacion = await this.prisma.conversacion.findUnique({
      where: { id: conversacionId },
      select: { usuario_id: true },
    })
    if (!conversacion || conversacion.usuario_id !== usuario.id) {
      throw ExcepcionNegocio.noEncontrado('Esa conversacion no existe')
    }

    const filas = await this.prisma.mensaje.findMany({
      where: { conversacion_id: conversacionId },
      orderBy: { id: 'asc' },
    })

    return filas.map((m) => ({
      id: m.id.toString(),
      rol: m.rol,
      contenido: m.contenido,
      herramienta: m.herramienta,
      payload: m.payload as Record<string, unknown> | null,
      creado_en: m.creado_en.toISOString(),
    }))
  }
}
