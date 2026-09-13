import { Injectable, Logger } from '@nestjs/common'
import type {
  ColumnaReporte,
  DatosConsultaHistorial,
  DatosEjecutarReporte,
  EspecificacionParametro,
  PlantillaReporte,
  ResultadoReporte,
  Visual,
} from '@aurora/contratos'
import { PERMISOS, salto, TOPE_FILAS } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import { PermisosService } from '../../nucleo/autenticacion/permisos.service'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'

type Especificaciones = Record<string, EspecificacionParametro>

@Injectable()
export class ReportesService {
  private readonly log = new Logger('Reportes')

  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly bitacora: BitacoraService
  ) {}

  // ==========================================================================
  // Catalogo de plantillas
  // ==========================================================================

  async plantillas(usuario: UsuarioAutenticado): Promise<PlantillaReporte[]> {
    const filas = await this.prisma.plantilla_reporte.findMany({
      where: { activo: true },
      orderBy: { id: 'asc' },
      include: { permiso: { select: { codigo: true } } },
    })

    const restringido = this.permisos.restringeSucursal(usuario) !== null

    return filas.map((p) => {
      const especificaciones = p.parametros as unknown as Especificaciones
      let disponible = true
      let motivo: string | undefined

      if (p.permiso && !this.permisos.puede(usuario.permisos, p.permiso.codigo)) {
        disponible = false
        motivo = `Necesita el permiso '${p.permiso.codigo}'`
      } else if (restringido && !('sucursal_id' in especificaciones)) {
        // Ver la explicacion completa en acotarASucursal().
        disponible = false
        motivo = 'Este reporte compara todas las sucursales'
      }

      return {
        codigo: p.codigo,
        nombre: p.nombre,
        descripcion: p.descripcion,
        visual: p.visual_default as Visual,
        parametros: especificaciones,
        disponible,
        motivo,
      }
    })
  }

  // ==========================================================================
  // Ejecucion
  // ==========================================================================

  /**
   * Ejecuta una plantilla.
   *
   * El SQL sale de la base y lo escribimos nosotros; los VALORES vienen de quien
   * pide el reporte. Por eso los valores nunca se pegan al texto de la consulta:
   * los `:nombre` de la plantilla se convierten en parametros posicionales de
   * PostgreSQL y se mandan aparte. Interpolarlos seria abrir la puerta que toda
   * esta arquitectura existe para cerrar.
   */
  async ejecutar(
    codigo: string,
    datos: DatosEjecutarReporte,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<ResultadoReporte> {
    const plantilla = await this.prisma.plantilla_reporte.findUnique({
      where: { codigo },
      include: { permiso: { select: { codigo: true } } },
    })

    if (!plantilla || !plantilla.activo) {
      throw ExcepcionNegocio.noEncontrado('Ese reporte no existe')
    }

    // Una plantilla puede exigir un permiso propio ademas de reporte.ver.
    if (plantilla.permiso && !this.permisos.puede(usuario.permisos, plantilla.permiso.codigo)) {
      throw ExcepcionNegocio.sinPermiso(
        `Este reporte necesita el permiso '${plantilla.permiso.codigo}'`
      )
    }

    const especificaciones = plantilla.parametros as unknown as Especificaciones
    const valores = this.validarParametros(especificaciones, datos.parametros)
    this.acotarASucursal(especificaciones, valores, usuario)

    const arranque = Date.now()
    let filas: Record<string, unknown>[] = []
    let error: string | null = null
    let sqlEjecutado = ''

    try {
      const { sql, orden } = this.aPosicionales(plantilla.sql_plantilla, especificaciones)
      sqlEjecutado = sql

      // Tope de filas: un reporte de tres anios sin filtros puede traer cientos
      // de miles y tumbar al servidor y al navegador. Se pide una fila de mas
      // para saber si quedo cortado y poder decirlo.
      const acotado = `SELECT * FROM (${sql}) AS _reporte LIMIT ${TOPE_FILAS + 1}`

      filas = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        acotado,
        ...orden.map((nombre) => valores[nombre] ?? null)
      )
    } catch (e) {
      error = (e as Error).message
      this.log.error(`Reporte ${codigo} fallo: ${error}`)
    }

    const duracion = Date.now() - arranque
    const truncado = filas.length > TOPE_FILAS
    if (truncado) filas = filas.slice(0, TOPE_FILAS)

    // Toda ejecucion queda registrada, haya salido bien o mal. El historial es
    // lo que despues permite ver quien consulto que, y es la misma tabla donde
    // el asistente de IA va a dejar sus preguntas.
    await this.registrar({
      usuarioId: usuario.id,
      plantillaId: plantilla.id,
      pregunta: datos.pregunta ?? plantilla.nombre,
      entrada: datos.entrada,
      parametros: valores,
      sql: sqlEjecutado,
      filas: filas.length,
      exito: error === null,
      error,
      duracion,
    })

    if (error !== null) {
      // El mensaje crudo de PostgreSQL filtra nombres de tablas y columnas.
      throw new ExcepcionNegocio(500, 'El reporte no se pudo generar')
    }

    const normalizadas = filas.map((f) => this.normalizarFila(f))

    await this.bitacora.registrar(ctx, {
      accion: 'consultar',
      modulo: 'reporte',
      entidad: 'plantilla_reporte',
      entidadId: plantilla.id,
      descripcion: `Reporte ${plantilla.nombre}: ${normalizadas.length} fila(s) en ${duracion} ms`,
      datosNuevos: valores,
    })

    return {
      codigo: plantilla.codigo,
      nombre: plantilla.nombre,
      visual: plantilla.visual_default as Visual,
      columnas: this.deducirColumnas(normalizadas),
      filas: normalizadas,
      total_filas: normalizadas.length,
      truncado,
      parametros_usados: valores,
      duracion_ms: duracion,
      generado_en: new Date().toISOString(),
    }
  }

  /** Mismo reporte, servido como CSV. */
  async exportarCsv(
    codigo: string,
    datos: DatosEjecutarReporte,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<{ nombre: string; csv: string }> {
    const resultado = await this.ejecutar(codigo, datos, usuario, ctx)

    const escapar = (valor: unknown): string => {
      if (valor === null || valor === undefined) return ''
      const texto = String(valor)
      // Una descripcion con coma, comilla o salto de linea rompe el CSV si no
      // se entrecomilla; Excel abre el archivo corrido y nadie entiende por que.
      return /[",\n\r;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
    }

    const cabecera = resultado.columnas.map((c) => escapar(c.nombre)).join(';')
    const cuerpo = resultado.filas
      .map((fila) => resultado.columnas.map((c) => escapar(fila[c.nombre])).join(';'))
      .join('\n')

    // El separador es punto y coma y lleva BOM: es lo que necesita el Excel en
    // español para no meter todo en una sola columna ni romper los acentos.
    return {
      nombre: `${resultado.codigo}-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: `﻿${cabecera}\n${cuerpo}\n`,
    }
  }

  // ==========================================================================
  // Historial
  // ==========================================================================

  async historial(filtros: DatosConsultaHistorial, usuario: UsuarioAutenticado) {
    /**
     * Quien ve el historial de los demas.
     *
     * Hace falta `bitacora.ver` Y no estar limitado a una sucursal. Un gerente
     * tiene ese permiso, pero `consulta_reporte` no guarda a que sucursal
     * pertenece una consulta: dejarlo ver todo le mostraria lo que consultan las
     * otras sucursales y la administracion central. Como no se puede acotar, se
     * le muestra lo suyo.
     */
    const puedeAuditar =
      this.permisos.puede(usuario.permisos, PERMISOS.BITACORA_VER) &&
      this.permisos.restringeSucursal(usuario) === null

    const where = {
      plantilla_id: filtros.plantilla_id,
      ...(puedeAuditar ? {} : { usuario_id: usuario.id }),
      ...(filtros.solo_errores === 'true' ? { exito: false } : {}),
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.consulta_reporte.count({ where }),
      this.prisma.consulta_reporte.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: salto(filtros),
        take: filtros.por_pagina,
        include: {
          plantilla_reporte: { select: { nombre: true } },
          usuario: { select: { nombre: true, apellido: true } },
        },
      }),
    ])

    return {
      total,
      items: filas.map((c) => ({
        id: c.id.toString(),
        plantilla: c.plantilla_reporte?.nombre ?? null,
        pregunta: c.pregunta,
        entrada: c.entrada,
        parametros: c.parametros as Record<string, unknown> | null,
        filas: c.filas,
        exito: c.exito,
        error: c.error,
        duracion_ms: c.duracion_ms,
        usuario: `${c.usuario.nombre} ${c.usuario.apellido}`,
        creado_en: c.creado_en.toISOString(),
      })),
    }
  }

  // ==========================================================================
  // Motor
  // ==========================================================================

  /** Tipo de PostgreSQL con el que se anota cada parametro. */
  private static readonly TIPO_SQL: Record<string, string> = {
    int: 'int',
    datetime: 'timestamptz',
    date: 'date',
    texto: 'text',
    enum: 'text',
    booleano: 'boolean',
  }

  /**
   * Convierte los `:nombre` de la plantilla en `$1::tipo, $2::tipo, ...`.
   *
   * Tres cosas que hay que resolver:
   *
   *  1. Los casteos de PostgreSQL usan dos puntos dobles: `creado_en::date`. Sin
   *     cuidado, `::date` se leeria como un parametro llamado `date`. Por eso la
   *     expresion descarta los dos puntos precedidos de otro.
   *
   *  2. Un mismo parametro aparece varias veces (`:sucursal_id IS NULL OR
   *     sucursal_id = :sucursal_id`). Todas sus apariciones tienen que apuntar
   *     al MISMO numero, o el valor viajaria dos veces y el orden se correria.
   *
   *  3. **Cada parametro se anota con su tipo.** Sin eso, un filtro opcional
   *     rompe: PostgreSQL ve `$1 IS NULL` y no tiene de donde deducir de que
   *     tipo es `$1`, asi que rechaza la consulta entera con "could not
   *     determine data type of parameter". El tipo lo sabe la plantilla, que lo
   *     declara en `parametros`; solo hay que decirselo.
   */
  private aPosicionales(
    plantilla: string,
    especificaciones: Especificaciones
  ): { sql: string; orden: string[] } {
    const encontrados = [...plantilla.matchAll(/(?<!:):([a-z_][a-z0-9_]*)/gi)].map((m) => m[1])
    const orden = [...new Set(encontrados)]

    // De mayor a menor largo: asi `:sucursal_id` se reemplaza antes que
    // `:sucursal` y no queda un `_id` suelto colgando de un `$2`.
    const porLargo = [...orden].sort((a, b) => b.length - a.length)

    let sql = plantilla
    for (const nombre of porLargo) {
      const posicion = orden.indexOf(nombre) + 1
      const tipo = ReportesService.TIPO_SQL[especificaciones[nombre]?.tipo ?? 'texto'] ?? 'text'
      sql = sql.replace(new RegExp(`(?<!:):${nombre}\\b`, 'gi'), `$${posicion}::${tipo}`)
    }

    return { sql, orden }
  }

  /**
   * Valida los valores recibidos contra lo que declara la plantilla.
   *
   * Un parametro que no esta declarado se descarta en silencio en vez de
   * pasarse: si llegara al SQL no tendria donde entrar, y aceptarlo daria la
   * impresion de que el filtro se aplico.
   */
  private validarParametros(
    especificaciones: Especificaciones,
    recibidos: Record<string, unknown>
  ): Record<string, unknown> {
    const valores: Record<string, unknown> = {}
    const errores: Record<string, string> = {}

    for (const [nombre, spec] of Object.entries(especificaciones)) {
      const crudo = recibidos[nombre]
      const vacio = crudo === undefined || crudo === null || crudo === ''

      if (vacio) {
        if (spec.requerido) {
          errores[nombre] = 'Este parametro es obligatorio'
        } else {
          valores[nombre] = spec.defecto ?? null
        }
        continue
      }

      try {
        valores[nombre] = this.convertir(crudo, spec)
      } catch (e) {
        errores[nombre] = (e as Error).message
      }
    }

    if (Object.keys(errores).length > 0) {
      throw ExcepcionNegocio.validacion(errores, 'Revisa los parametros del reporte')
    }

    return valores
  }

  private convertir(crudo: unknown, spec: EspecificacionParametro): unknown {
    switch (spec.tipo) {
      case 'int': {
        const n = Number(crudo)
        if (!Number.isInteger(n)) throw new Error('Tiene que ser un numero entero')
        return n
      }
      case 'datetime':
      case 'date': {
        const fecha = new Date(crudo as string)
        if (Number.isNaN(fecha.getTime())) throw new Error('Fecha invalida')
        return fecha
      }
      case 'enum': {
        const texto = String(crudo)
        if (spec.opciones && !spec.opciones.includes(texto)) {
          throw new Error(`Tiene que ser uno de: ${spec.opciones.join(', ')}`)
        }
        return texto
      }
      case 'booleano':
        return crudo === true || crudo === 'true' || crudo === 1 || crudo === '1'
      case 'texto':
      default:
        return String(crudo).slice(0, 200)
    }
  }

  /**
   * Encierra el reporte en la sucursal del usuario.
   *
   * Un gerente o un vendedor solo ven lo suyo, y eso no se negocia con un
   * parametro: si mandan otra sucursal, se ignora y se usa la propia.
   *
   * Cuando la plantilla no acepta `sucursal_id` es porque compara todas las
   * sucursales entre si — el ranking, por ejemplo. Ese reporte no se puede
   * "acotar", asi que a quien esta restringido simplemente no se le entrega.
   * Filtrarlo a una sola fila seria peor: daria un ranking de un solo elemento
   * que parece completo y no lo es.
   */
  private acotarASucursal(
    especificaciones: Especificaciones,
    valores: Record<string, unknown>,
    usuario: UsuarioAutenticado
  ): void {
    const propia = this.permisos.restringeSucursal(usuario)
    if (propia === null) return

    if (!('sucursal_id' in especificaciones)) {
      throw ExcepcionNegocio.sinPermiso(
        'Este reporte compara todas las sucursales y tu acceso esta limitado a la tuya'
      )
    }

    valores.sucursal_id = propia
  }

  /**
   * Deja los valores en tipos que sobrevivan al JSON.
   *
   * PostgreSQL devuelve los agregados como numeric, y el driver los entrega
   * como cadena o como Decimal para no perder precision; los conteos vienen
   * como BigInt. Sin esto, el front recibiria "1234.50" y un BigInt que
   * JSON.stringify no sabe serializar.
   */
  private normalizarFila(fila: Record<string, unknown>): Record<string, unknown> {
    const salida: Record<string, unknown> = {}

    for (const [clave, valor] of Object.entries(fila)) {
      if (valor === null || valor === undefined) {
        salida[clave] = null
      } else if (typeof valor === 'bigint') {
        salida[clave] = Number(valor)
      } else if (valor instanceof Date) {
        salida[clave] = valor.toISOString()
      } else if (typeof valor === 'object' && 'toNumber' in valor) {
        salida[clave] = (valor as { toNumber(): number }).toNumber()
      } else if (typeof valor === 'string' && /^-?\d+(\.\d+)?$/.test(valor)) {
        // Un numeric que llego como cadena. Se convierte solo si entra entero en
        // un numero de JavaScript; si no, se deja el texto antes que redondearlo.
        const n = Number(valor)
        salida[clave] = Number.isSafeInteger(n) || valor.includes('.') ? n : valor
      } else {
        salida[clave] = valor
      }
    }

    return salida
  }

  /** Tipo de cada columna, para que el front alinee y formatee. */
  private deducirColumnas(filas: Record<string, unknown>[]): ColumnaReporte[] {
    if (filas.length === 0) return []

    return Object.keys(filas[0]).map((nombre) => {
      // Se mira la primera fila con dato: la primera puede tener nulos.
      const muestra = filas.find((f) => f[nombre] !== null)?.[nombre]

      if (typeof muestra === 'number') return { nombre, tipo: 'numero' as const }
      if (typeof muestra === 'string' && /^\d{4}-\d{2}-\d{2}/.test(muestra)) {
        return { nombre, tipo: 'fecha' as const }
      }
      return { nombre, tipo: 'texto' as const }
    })
  }

  private async registrar(datos: {
    usuarioId: number
    plantillaId: number
    pregunta: string
    entrada: 'texto' | 'voz'
    parametros: Record<string, unknown>
    sql: string
    filas: number
    exito: boolean
    error: string | null
    duracion: number
  }): Promise<void> {
    try {
      await this.prisma.consulta_reporte.create({
        data: {
          usuario_id: datos.usuarioId,
          plantilla_id: datos.plantillaId,
          pregunta: datos.pregunta.slice(0, 500),
          entrada: datos.entrada,
          // Las fechas se guardan como texto para que el JSON quede legible al
          // revisar el historial.
          parametros: JSON.parse(JSON.stringify(datos.parametros)),
          sql_ejecutado: datos.sql,
          filas: datos.filas,
          exito: datos.exito,
          error: datos.error?.slice(0, 255) ?? null,
          duracion_ms: datos.duracion,
        },
      })
    } catch (e) {
      // Igual que la bitacora: registrar no puede tumbar la operacion.
      this.log.error(`No se pudo guardar la consulta: ${(e as Error).message}`)
    }
  }
}
