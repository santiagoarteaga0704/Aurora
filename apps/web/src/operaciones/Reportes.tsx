import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type {
  EspecificacionParametro,
  PlantillaReporte,
  RangoRapido,
  ResultadoReporte,
} from '@aurora/contratos'
import { PERMISOS, RANGOS_RAPIDOS, rangoAFechas } from '@aurora/contratos'
import { almacen, api, ErrorApi } from '../api/cliente'
import { useSesion } from '../sesion/SesionContexto'
import { Cargando, ErrorCarga, Vacio } from '../componentes/Estados'
import { Grafico } from './Grafico'
import { bs, clases, fecha, fechaCompleta, numero } from '../util/formato'

interface Sucursal {
  id: number
  nombre: string
}

/** Para que el <input type="datetime-local"> entienda una fecha. */
const aInputLocal = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Reportes.
 *
 * El formulario se arma solo a partir de lo que la plantilla declara en
 * `parametros`. No hay un formulario por reporte: si manianía se agrega una
 * plantilla nueva a la base, aparece aca con sus campos y sin tocar el front.
 * Es la misma propiedad que va a hacer que el asistente de IA pueda usar
 * cualquier reporte sin que nadie lo programe.
 */
export function Reportes() {
  const { puede } = useSesion()

  const [plantillas, setPlantillas] = useState<PlantillaReporte[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elegida, setElegida] = useState<PlantillaReporte | null>(null)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [sucursales, setSucursales] = useState<Sucursal[]>([])

  const [resultado, setResultado] = useState<ResultadoReporte | null>(null)
  const [corriendo, setCorriendo] = useState(false)
  const [autoCorrer, setAutoCorrer] = useState(false)
  const [errorCorrida, setErrorCorrida] = useState<string | null>(null)
  const [erroresCampo, setErroresCampo] = useState<Record<string, string>>({})

  const [params, setParams] = useSearchParams()

  useEffect(() => {
    void (async () => {
      try {
        const [p, s] = await Promise.all([
          api.obtener<PlantillaReporte[]>('/api/reportes/plantillas'),
          api.obtener<Sucursal[]>('/api/sucursales').catch(() => []),
        ])
        setPlantillas(p)
        setSucursales(s)
      } catch (e) {
        setError((e as Error).message)
      }
    })()
  }, [])

  /** Al elegir una plantilla se precargan los valores por defecto. */
  const elegir = useCallback((p: PlantillaReporte) => {
    setElegida(p)
    setParams({ codigo: p.codigo }, { replace: true })
    setResultado(null)
    setErrorCorrida(null)
    setErroresCampo({})

    const iniciales: Record<string, string> = {}
    for (const [nombre, spec] of Object.entries(p.parametros)) {
      if (spec.defecto !== undefined) iniciales[nombre] = String(spec.defecto)
    }
    // Un rango de un mes es lo que se mira el 90% de las veces.
    if ('desde' in p.parametros && 'hasta' in p.parametros) {
      const { desde, hasta } = rangoAFechas('mes')
      iniciales.desde = aInputLocal(desde)
      iniciales.hasta = aInputLocal(hasta)
    }
    setValores(iniciales)
  }, [setParams])

  /**
   * Si la URL trae un codigo, se abre ese reporte y se corre solo. Asi un
   * reporte se puede mandar por enlace y el que lo recibe ve el resultado, no un
   * formulario en blanco.
   */
  const yaAbierto = useRef(false)
  useEffect(() => {
    if (yaAbierto.current || plantillas === null) return
    const codigo = params.get('codigo')
    if (!codigo) return
    const encontrada = plantillas.find((p) => p.codigo === codigo && p.disponible)
    if (encontrada) {
      yaAbierto.current = true
      elegir(encontrada)
      setAutoCorrer(true)
    }
  }, [plantillas, params, elegir])

  const aplicarRango = (rango: RangoRapido) => {
    const { desde, hasta } = rangoAFechas(rango)
    setValores((v) => ({ ...v, desde: aInputLocal(desde), hasta: aInputLocal(hasta) }))
  }

  const correr = useCallback(async () => {
    if (!elegida) return
    setErrorCorrida(null)
    setErroresCampo({})
    setCorriendo(true)
    try {
      setResultado(
        await api.enviar<ResultadoReporte>(`/api/reportes/${elegida.codigo}`, {
          parametros: valores,
          pregunta: elegida.nombre,
        })
      )
    } catch (e) {
      const fallo = e as ErrorApi
      setErrorCorrida(fallo.message)
      if (fallo.errores) setErroresCampo(fallo.errores)
      setResultado(null)
    } finally {
      setCorriendo(false)
    }
  }, [elegida, valores])

  // El reporte que vino por enlace se corre una vez que ya estan cargados sus
  // valores por defecto; si no, saldria pidiendo los parametros obligatorios.
  useEffect(() => {
    if (!autoCorrer || !elegida) return
    setAutoCorrer(false)
    void correr()
  }, [autoCorrer, elegida, correr])

  /**
   * Descarga el CSV.
   *
   * Va con fetch directo y no por el cliente de la API porque la respuesta es un
   * archivo, no el sobre JSON de siempre.
   */
  const descargar = async () => {
    if (!elegida) return
    try {
      const res = await fetch(`/api/reportes/${elegida.codigo}/csv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${almacen.token()}`,
        },
        body: JSON.stringify({ parametros: valores, pregunta: elegida.nombre }),
      })
      if (!res.ok) throw new Error('No se pudo generar el archivo')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = `${elegida.codigo}.csv`
      enlace.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErrorCorrida((e as Error).message)
    }
  }

  const campos = useMemo(
    () => Object.entries(elegida?.parametros ?? {}) as [string, EspecificacionParametro][],
    [elegida]
  )

  const tieneRango = elegida !== null && 'desde' in elegida.parametros

  if (error) {
    return (
      <div className="pantalla">
        <ErrorCarga mensaje={error} />
      </div>
    )
  }

  if (plantillas === null) {
    return (
      <div className="pantalla">
        <Cargando texto="Cargando reportes" />
      </div>
    )
  }

  return (
    <div className="pantalla">
      <header className="pantalla__cabecera">
        <div>
          <h1 className="pantalla__titulo">Reportes</h1>
          <p className="rotulo">{plantillas.length} disponibles</p>
        </div>
      </header>

      <div className="reportes">
        <aside className="reportes__lista">
          {plantillas.map((p) => (
            <button
              key={p.codigo}
              type="button"
              className={clases(
                'reporte-ficha',
                elegida?.codigo === p.codigo && 'reporte-ficha--activa',
                !p.disponible && 'reporte-ficha--bloqueada'
              )}
              onClick={() => p.disponible && elegir(p)}
              disabled={!p.disponible}
              title={p.motivo}
            >
              <span className="reporte-ficha__nombre">{p.nombre}</span>
              {p.descripcion && <span className="reporte-ficha__nota">{p.descripcion}</span>}
              {!p.disponible && <span className="marca marca--neutra">{p.motivo}</span>}
            </button>
          ))}
        </aside>

        <section className="reportes__panel">
          {!elegida ? (
            <Vacio
              titulo="Elegi un reporte"
              detalle="Cada uno pide sus propios datos y se dibuja como corresponda."
            />
          ) : (
            <>
              <div className="reportes__parametros">
                <div className="reportes__parametros-cabecera">
                  <div>
                    <h2 className="reportes__titulo">{elegida.nombre}</h2>
                    {elegida.descripcion && (
                      <p className="reportes__descripcion">{elegida.descripcion}</p>
                    )}
                  </div>
                </div>

                {tieneRango && (
                  <div className="rangos">
                    {(Object.keys(RANGOS_RAPIDOS) as RangoRapido[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        className="rangos__boton"
                        onClick={() => aplicarRango(r)}
                      >
                        {RANGOS_RAPIDOS[r]}
                      </button>
                    ))}
                  </div>
                )}

                <div className="reportes__campos">
                  {campos.map(([nombre, spec]) => (
                    <label
                      key={nombre}
                      className={clases('campo', erroresCampo[nombre] && 'campo--malo')}
                    >
                      <span className="campo__etiqueta">
                        {nombre.replace(/_/g, ' ')}
                        {spec.requerido && ' *'}
                      </span>

                      {nombre === 'sucursal_id' && sucursales.length > 0 ? (
                        <select
                          className="campo__control"
                          value={valores[nombre] ?? ''}
                          onChange={(e) => setValores({ ...valores, [nombre]: e.target.value })}
                        >
                          <option value="">Todas</option>
                          {sucursales.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nombre}
                            </option>
                          ))}
                        </select>
                      ) : spec.tipo === 'enum' ? (
                        <select
                          className="campo__control"
                          value={valores[nombre] ?? ''}
                          onChange={(e) => setValores({ ...valores, [nombre]: e.target.value })}
                        >
                          <option value="">Todos</option>
                          {(spec.opciones ?? []).map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={
                            spec.tipo === 'datetime'
                              ? 'datetime-local'
                              : spec.tipo === 'date'
                                ? 'date'
                                : spec.tipo === 'int'
                                  ? 'number'
                                  : 'text'
                          }
                          className={clases('campo__control', spec.tipo === 'int' && 'cifra')}
                          value={valores[nombre] ?? ''}
                          onChange={(e) => setValores({ ...valores, [nombre]: e.target.value })}
                        />
                      )}

                      {erroresCampo[nombre] && (
                        <span className="campo__error">{erroresCampo[nombre]}</span>
                      )}
                    </label>
                  ))}
                </div>

                <div className="reportes__acciones">
                  <button
                    type="button"
                    className="boton boton--vino"
                    onClick={() => void correr()}
                    disabled={corriendo}
                  >
                    {corriendo ? 'Generando...' : 'Generar'}
                  </button>

                  {resultado && puede(PERMISOS.REPORTE_EXPORTAR) && (
                    <button type="button" className="boton boton--linea" onClick={() => void descargar()}>
                      Descargar CSV
                    </button>
                  )}
                </div>

                {errorCorrida && <p className="aviso aviso--error">{errorCorrida}</p>}
              </div>

              {corriendo && <Cargando texto="Consultando" />}

              {resultado && !corriendo && (
                <div className="reportes__resultado">
                  <div className="reportes__meta">
                    <span className="rotulo">
                      {numero(resultado.total_filas)} fila{resultado.total_filas === 1 ? '' : 's'} ·{' '}
                      {resultado.duracion_ms} ms
                    </span>
                    <span className="rotulo">{fechaCompleta(resultado.generado_en)}</span>
                  </div>

                  {resultado.truncado && (
                    <p className="aviso aviso--ojo">
                      El reporte se corto en {numero(resultado.total_filas)} filas. Acota el rango
                      para verlo completo.
                    </p>
                  )}

                  {resultado.filas.length === 0 ? (
                    <Vacio
                      titulo="Sin datos"
                      detalle="No hay movimientos que coincidan con esos parametros."
                    />
                  ) : (
                    <>
                      <Grafico
                        visual={resultado.visual}
                        columnas={resultado.columnas}
                        filas={resultado.filas}
                      />

                      <div className="tabla-envoltorio">
                        <table className="tabla tabla--oscura tabla--compacta">
                          <thead>
                            <tr>
                              {resultado.columnas.map((c) => (
                                <th
                                  key={c.nombre}
                                  className={clases(c.tipo === 'numero' && 'tabla__num')}
                                >
                                  {c.nombre.replace(/_/g, ' ')}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {resultado.filas.map((fila, n) => (
                              <tr key={n}>
                                {resultado.columnas.map((c) => {
                                  const valor = fila[c.nombre]
                                  const esDinero = /total|monto|subtotal|precio|reembolso/i.test(
                                    c.nombre
                                  )
                                  return (
                                    <td
                                      key={c.nombre}
                                      className={clases(
                                        c.tipo === 'numero' && 'cifra tabla__num'
                                      )}
                                    >
                                      {valor === null
                                        ? '—'
                                        : c.tipo === 'numero' && esDinero
                                          ? bs(Number(valor))
                                          : c.tipo === 'numero'
                                            ? numero(Number(valor))
                                            : c.tipo === 'fecha'
                                              ? fecha(String(valor))
                                              : String(valor)}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
