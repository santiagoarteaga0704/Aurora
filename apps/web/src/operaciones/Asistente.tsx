import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { RespuestaAsistente, ResultadoReporte } from '@aurora/contratos'
import { PREGUNTAS_EJEMPLO } from '@aurora/contratos'
import { api, ErrorApi } from '../api/cliente'
import { Grafico } from './Grafico'
import { bs, clases, numero } from '../util/formato'

interface EstadoAsistente {
  interprete: boolean
  modelo: boolean
  nota: string
}

interface Turno {
  id: number
  rol: 'usuario' | 'asistente'
  texto: string
  reporte?: ResultadoReporte | null
  motivo?: string
  resueltoPor?: string
  sugerencias?: string[]
}

/**
 * Reconocimiento de voz del navegador.
 *
 * `SpeechRecognition` no esta en los tipos de TypeScript porque sigue siendo un
 * borrador; se declara lo minimo que se usa. Donde no exista —Firefox, por
 * ejemplo— el microfono directamente no se muestra, en vez de ofrecer un boton
 * que no hace nada.
 */
interface ReconocimientoVoz extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

function crearReconocimiento(): ReconocimientoVoz | null {
  const ventana = window as unknown as {
    SpeechRecognition?: new () => ReconocimientoVoz
    webkitSpeechRecognition?: new () => ReconocimientoVoz
  }
  const Constructor = ventana.SpeechRecognition ?? ventana.webkitSpeechRecognition
  if (!Constructor) return null

  const r = new Constructor()
  r.lang = 'es-BO'
  r.continuous = false
  r.interimResults = false
  return r
}

/**
 * Asistente conversacional.
 *
 * Es la segunda novedad que pide el enunciado: reportes bajo demanda **por chat
 * y voz**. La voz no es un adorno — en un mostrador, preguntar en voz alta
 * mientras se atiende a alguien es la unica forma de consultar algo sin soltar
 * lo que se esta haciendo.
 */
export function Asistente() {
  const [estado, setEstado] = useState<EstadoAsistente | null>(null)
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [texto, setTexto] = useState('')
  const [conversacion, setConversacion] = useState<string | null>(null)
  const [pensando, setPensando] = useState(false)
  const [escuchando, setEscuchando] = useState(false)
  const [hayVoz] = useState(() => crearReconocimiento() !== null)

  const [params] = useSearchParams()
  const yaPreguntado = useRef(false)

  const campo = useRef<HTMLInputElement>(null)
  const conversacionRef = useRef<HTMLDivElement>(null)
  const reconocimiento = useRef<ReconocimientoVoz | null>(null)

  useEffect(() => {
    void (async () => {
      setEstado(await api.obtener<EstadoAsistente>('/api/asistente/estado').catch(() => null))
      campo.current?.focus()
    })()
  }, [])

  // La conversacion se desplaza sola al ultimo mensaje.
  //
  // Se mueve `scrollTop` del contenedor a mano en vez de usar
  // `scrollIntoView`: ese desplaza el ancestro que pueda desplazarse, y cuando
  // una respuesta traia una tabla larga terminaba corriendo la pagina entera
  // —panel lateral incluido— en lugar de solo la conversacion.
  useEffect(() => {
    const caja = conversacionRef.current
    if (!caja) return
    caja.scrollTo({ top: caja.scrollHeight, behavior: 'smooth' })
  }, [turnos, pensando])

  const preguntar = useCallback(
    async (pregunta: string, entrada: 'texto' | 'voz' = 'texto') => {
      const limpia = pregunta.trim()
      if (limpia === '' || pensando) return

      setTexto('')
      setTurnos((t) => [...t, { id: Date.now(), rol: 'usuario', texto: limpia }])
      setPensando(true)

      try {
        const r = await api.enviar<RespuestaAsistente>('/api/asistente/preguntar', {
          texto: limpia,
          conversacion_id: conversacion ?? undefined,
          canal: 'web',
          entrada,
        })

        setConversacion(r.conversacion_id)
        setTurnos((t) => [
          ...t,
          {
            id: Date.now() + 1,
            rol: 'asistente',
            texto: r.respuesta,
            reporte: r.reporte as ResultadoReporte | null,
            motivo: r.interpretacion.motivo,
            resueltoPor: r.interpretacion.resuelto_por,
            sugerencias: r.sugerencias,
          },
        ])
      } catch (e) {
        setTurnos((t) => [
          ...t,
          { id: Date.now() + 1, rol: 'asistente', texto: (e as ErrorApi).message },
        ])
      } finally {
        setPensando(false)
        campo.current?.focus()
      }
    },
    [conversacion, pensando]
  )

  useEffect(() => {
    const inicial = params.get('p')
    if (!inicial || yaPreguntado.current || estado === null) return
    yaPreguntado.current = true
    void preguntar(inicial)
  }, [params, estado, preguntar])

  const dictar = () => {
    if (escuchando) {
      reconocimiento.current?.stop()
      return
    }

    const r = crearReconocimiento()
    if (!r) return

    reconocimiento.current = r
    setEscuchando(true)

    r.onresult = (e) => {
      const dicho = e.results[0][0].transcript
      setTexto(dicho)
      // Se manda sola: quien dicta tiene las manos ocupadas, que es justamente
      // el motivo por el que esta dictando.
      void preguntar(dicho, 'voz')
    }
    r.onerror = () => setEscuchando(false)
    r.onend = () => setEscuchando(false)

    r.start()
  }

  return (
    <div className="pantalla asistente">
      <header className="pantalla__cabecera">
        <div>
          <h1 className="pantalla__titulo">Asistente</h1>
          {estado && (
            <p className={clases('rotulo', !estado.modelo && 'asistente__sin-modelo')}>
              {estado.nota}
            </p>
          )}
        </div>
      </header>

      <div className="asistente__conversacion" ref={conversacionRef}>
        {turnos.length === 0 && (
          <div className="asistente__bienvenida">
            <p className="display asistente__saludo">¿Qué querés saber?</p>
            <p className="asistente__ayuda">
              Preguntá en tus palabras. Si tenés las manos ocupadas, dictalo.
            </p>
            <div className="asistente__ejemplos">
              {PREGUNTAS_EJEMPLO.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="asistente__ejemplo"
                  onClick={() => void preguntar(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {turnos.map((turno) => (
          <div key={turno.id} className={clases('turno', `turno--${turno.rol}`)}>
            <p className="turno__texto">{turno.texto}</p>

            {turno.motivo && (
              <p className="turno__motivo">
                {turno.motivo}
                {turno.resueltoPor === 'modelo' && (
                  <span className="marca marca--vino">modelo</span>
                )}
              </p>
            )}

            {turno.reporte && turno.reporte.filas.length > 0 && (
              <div className="turno__reporte">
                <div className="turno__reporte-cabecera">
                  <span className="rotulo">{turno.reporte.nombre}</span>
                  <span className="rotulo">
                    {numero(turno.reporte.total_filas)} fila
                    {turno.reporte.total_filas === 1 ? '' : 's'} · {turno.reporte.duracion_ms} ms
                  </span>
                </div>

                <Grafico
                  visual={turno.reporte.visual}
                  columnas={turno.reporte.columnas}
                  filas={turno.reporte.filas}
                />

                <div className="tabla-envoltorio">
                  <table className="tabla tabla--oscura tabla--compacta">
                    <thead>
                      <tr>
                        {turno.reporte.columnas.map((c) => (
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
                      {turno.reporte.filas.slice(0, 10).map((fila, n) => (
                        <tr key={n}>
                          {turno.reporte!.columnas.map((c) => {
                            const valor = fila[c.nombre]
                            const esDinero = /total|monto|subtotal|precio|reembolso/i.test(c.nombre)
                            return (
                              <td
                                key={c.nombre}
                                className={clases(c.tipo === 'numero' && 'cifra tabla__num')}
                              >
                                {valor === null
                                  ? '—'
                                  : c.tipo === 'numero' && esDinero
                                    ? bs(Number(valor))
                                    : c.tipo === 'numero'
                                      ? numero(Number(valor))
                                      : String(valor)}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {turno.sugerencias && turno.sugerencias.length > 0 && (
              <div className="asistente__ejemplos asistente__ejemplos--sugerencia">
                {turno.sugerencias.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    className="asistente__ejemplo"
                    onClick={() => void preguntar(sug)}
                  >
                    {sug}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {pensando && (
          <div className="turno turno--asistente">
            <p className="turno__pensando">
              <span />
              <span />
              <span />
            </p>
          </div>
        )}

      </div>

      <form
        className="asistente__barra"
        onSubmit={(e) => {
          e.preventDefault()
          void preguntar(texto)
        }}
      >
        {hayVoz && (
          <button
            type="button"
            className={clases('asistente__microfono', escuchando && 'asistente__microfono--activo')}
            onClick={dictar}
            aria-label={escuchando ? 'Dejar de dictar' : 'Dictar la pregunta'}
            title={escuchando ? 'Escuchando...' : 'Dictar'}
          >
            ●
          </button>
        )}

        <input
          ref={campo}
          className="asistente__campo"
          placeholder={escuchando ? 'Escuchando...' : 'Preguntá lo que necesites'}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={pensando}
        />

        <button
          type="submit"
          className="boton boton--vino"
          disabled={pensando || texto.trim() === ''}
        >
          Preguntar
        </button>
      </form>
    </div>
  )
}
