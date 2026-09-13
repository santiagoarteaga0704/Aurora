import { useCallback, useEffect, useState } from 'react'
import type {
  Devolucion,
  DevolucionResumen,
  EstadoDevolucion,
  EstadoPrenda,
  MetaPagina,
} from '@aurora/contratos'
import { ESTADOS_DEVOLUCION, ESTADOS_PRENDA, PERMISOS } from '@aurora/contratos'
import { api, consulta, ErrorApi } from '../api/cliente'
import { useSesion } from '../sesion/SesionContexto'
import { Cargando, ErrorCarga, Vacio } from '../componentes/Estados'
import { bs, clases, fechaCompleta, numero } from '../util/formato'

const MARCA: Record<EstadoDevolucion, string> = {
  solicitada: 'marca--ojo',
  aprobada: 'marca--vino',
  rechazada: 'marca--mala',
  recibida: 'marca--vino',
  reembolsada: 'marca--bien',
}

const MOTIVO: Record<string, string> = {
  talla_incorrecta: 'Talla incorrecta',
  defecto: 'Vino con defecto',
  no_coincide: 'No es lo que esperaba',
  arrepentimiento: 'Se arrepintió',
  otro: 'Otro',
}

/**
 * Como se clasifica cada prenda al recibirla, y que pasa con ella.
 *
 * Esto no es una etiqueta: decide si la prenda vuelve a estar a la venta. Una
 * daniada que reingresa al stock vendible es una prenda rota que le llega a la
 * siguiente clienta.
 */
const QUE_PASA: Record<EstadoPrenda, { titulo: string; detalle: string; reingresa: boolean }> = {
  nueva: {
    titulo: 'Como nueva',
    detalle: 'Vuelve al piso de venta.',
    reingresa: true,
  },
  usada: {
    titulo: 'Usada',
    detalle: 'Va al almacén de devoluciones para revisarla antes de reofrecerla.',
    reingresa: true,
  },
  danada: {
    titulo: 'Dañada',
    detalle: 'No reingresa a ningún lado.',
    reingresa: false,
  },
}

/**
 * Devoluciones.
 *
 * El ciclo tiene cuatro pasos y cada uno hace algo distinto: se solicita, se
 * aprueba o se rechaza, se recibe la mercaderia —y ahi se decide prenda por
 * prenda que vuelve al stock— y se reembolsa.
 *
 * La clasificacion al recibir es el paso que importa y es el que suele hacerse
 * mal: aceptar todo como "nueva" para terminar rapido es lo que hace que una
 * prenda rota vuelva a la vitrina.
 */
export function Devoluciones() {
  const { puede } = useSesion()

  const [filas, setFilas] = useState<DevolucionResumen[] | null>(null)
  const [meta, setMeta] = useState<MetaPagina | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [estado, setEstado] = useState('')
  const [pagina, setPagina] = useState(1)

  const [detalle, setDetalle] = useState<Devolucion | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [comentario, setComentario] = useState('')

  const [recibiendo, setRecibiendo] = useState<Devolucion | null>(null)
  const [clasificacion, setClasificacion] = useState<Record<number, EstadoPrenda>>({})

  const [reembolsando, setReembolsando] = useState<Devolucion | null>(null)
  const [monto, setMonto] = useState('')

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const r = await api.pagina<DevolucionResumen>(
        `/api/devoluciones${consulta({ estado: estado || undefined, pagina, por_pagina: 20 })}`
      )
      setFilas(r.datos)
      setMeta(r.meta)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [estado, pagina])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const abrirDetalle = async (id: string) => {
    setComentario('')
    setDetalle(await api.obtener<Devolucion>(`/api/devoluciones/${id}`).catch(() => null))
  }

  const resolver = async (aprobada: boolean) => {
    if (!detalle) return
    setTrabajando(true)
    try {
      await api.enviar(`/api/devoluciones/${detalle.id}/resolver`, {
        aprobada,
        comentario: comentario.trim() || undefined,
      })
      setAviso(
        aprobada
          ? `Devolución ${detalle.numero} aprobada. La clienta ya fue avisada.`
          : `Devolución ${detalle.numero} rechazada. La clienta ya fue avisada.`
      )
      setDetalle(null)
      await cargar()
    } catch (e) {
      setAviso((e as ErrorApi).message)
    } finally {
      setTrabajando(false)
    }
  }

  const abrirRecepcion = (d: Devolucion) => {
    // Nada preseleccionado: quien recibe tiene que mirar cada prenda. Proponer
    // "nueva" seria invitar a aceptar todo sin abrir la bolsa.
    setClasificacion({})
    setRecibiendo(d)
    setDetalle(null)
  }

  const recibir = async () => {
    if (!recibiendo) return
    setTrabajando(true)
    try {
      await api.enviar(`/api/devoluciones/${recibiendo.id}/recibir`, {
        items: recibiendo.items.map((i) => ({
          variante_id: i.variante_id,
          estado_prenda: clasificacion[i.variante_id],
          reingresa_stock: QUE_PASA[clasificacion[i.variante_id]].reingresa,
        })),
      })
      setAviso(`Devolución ${recibiendo.numero} recibida`)
      setRecibiendo(null)
      await cargar()
    } catch (e) {
      setAviso((e as ErrorApi).message)
    } finally {
      setTrabajando(false)
    }
  }

  const abrirReembolso = (d: Devolucion) => {
    setMonto(String(d.monto_estimado))
    setReembolsando(d)
    setDetalle(null)
  }

  const reembolsar = async () => {
    if (!reembolsando) return
    setTrabajando(true)
    try {
      await api.enviar(`/api/devoluciones/${reembolsando.id}/reembolsar`, {
        monto: Number(monto),
        comentario: comentario.trim() || undefined,
      })
      setAviso(`Reembolso de ${bs(Number(monto))} registrado`)
      setReembolsando(null)
      await cargar()
    } catch (e) {
      setAviso((e as ErrorApi).message)
    } finally {
      setTrabajando(false)
    }
  }

  if (error) return <ErrorCarga mensaje={error} reintentar={() => void cargar()} />

  const puedeGestionar = puede(PERMISOS.DEVOLUCION_GESTIONAR)
  const faltaClasificar =
    recibiendo !== null && recibiendo.items.some((i) => !clasificacion[i.variante_id])

  return (
    <div className="pantalla">
      <header className="pantalla__cabecera">
        <div>
          <h1 className="pantalla__titulo">Devoluciones</h1>
          <p className="rotulo">
            {meta ? `${meta.total} devolución${meta.total === 1 ? '' : 'es'}` : 'Posventa'}
          </p>
        </div>

        <div className="pantalla__controles">
          <select
            className="campo__control"
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value)
              setPagina(1)
            }}
          >
            <option value="">Todos los estados</option>
            {ESTADOS_DEVOLUCION.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
      </header>

      {aviso && <p className="aviso aviso--bien">{aviso}</p>}

      {filas === null ? (
        <Cargando texto="Buscando devoluciones" />
      ) : filas.length === 0 ? (
        <Vacio
          titulo="No hay devoluciones"
          detalle={estado ? `Ninguna está ${estado}.` : 'Buena señal: nadie devolvió nada.'}
        />
      ) : (
        <div className="tabla-envoltorio">
          <table className="tabla tabla--oscura tabla--clicable">
            <thead>
              <tr>
                <th>Número</th>
                <th>Pedido</th>
                <th>Clienta</th>
                <th>Motivo</th>
                <th className="tabla__num">Prendas</th>
                <th className="tabla__num">Reembolso</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((d) => (
                <tr key={d.id} onClick={() => void abrirDetalle(d.id)}>
                  <td className="cifra">{d.numero}</td>
                  <td className="cifra">{d.pedido_numero}</td>
                  <td>{d.cliente ?? '—'}</td>
                  <td>{MOTIVO[d.motivo] ?? d.motivo}</td>
                  <td className="cifra tabla__num">{numero(d.unidades)}</td>
                  <td className="cifra tabla__num">
                    {d.monto_reembolso > 0 ? bs(d.monto_reembolso) : '—'}
                  </td>
                  <td>
                    <span className={clases('marca', MARCA[d.estado])}>{d.estado}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.paginas > 1 && (
        <nav className="paginador">
          <button
            type="button"
            className="boton boton--linea"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </button>
          <span className="cifra paginador__posicion">
            {meta.pagina} / {meta.paginas}
          </span>
          <button
            type="button"
            className="boton boton--linea"
            disabled={pagina >= meta.paginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Siguiente
          </button>
        </nav>
      )}

      {/* --- Detalle --- */}
      {detalle && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal__caja modal__caja--ancha">
            <header className="modal__cabecera">
              <div>
                <h2 className="modal__titulo">{detalle.numero}</h2>
                <p className="modal__sub">
                  Pedido {detalle.pedido_numero} · {detalle.cliente ?? 'sin clienta'} ·{' '}
                  {MOTIVO[detalle.motivo] ?? detalle.motivo}
                </p>
              </div>
              <button type="button" className="modal__cerrar" onClick={() => setDetalle(null)}>
                ✕
              </button>
            </header>

            {detalle.detalle && <p className="modal__contexto">«{detalle.detalle}»</p>}

            <div className="tabla-envoltorio">
              <table className="tabla tabla--oscura tabla--compacta">
                <thead>
                  <tr>
                    <th>Prenda</th>
                    <th className="tabla__num">Cantidad</th>
                    <th className="tabla__num">Precio</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.items.map((i) => (
                    <tr key={i.variante_id}>
                      <td>
                        {i.descripcion}
                        <span className="tabla__sub cifra">{i.sku}</span>
                      </td>
                      <td className="cifra tabla__num">{numero(i.cantidad)}</td>
                      <td className="cifra tabla__num">{bs(i.precio_unitario)}</td>
                      <td>
                        {detalle.estado === 'solicitada' ? (
                          <span className="rotulo">sin revisar</span>
                        ) : (
                          <>
                            <span className="marca">{i.estado_prenda}</span>
                            {!i.reingresa_stock && (
                              <span className="marca marca--mala">no reingresó</span>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="modal__contexto">
              Solicitada {fechaCompleta(detalle.creado_en)}
              {detalle.gestiona && ` · gestiona ${detalle.gestiona}`} ·{' '}
              <strong>Estimado {bs(detalle.monto_estimado)}</strong>
              {detalle.monto_reembolso > 0 && ` · reembolsado ${bs(detalle.monto_reembolso)}`}
            </p>

            {puedeGestionar && detalle.estado === 'solicitada' && (
              <>
                <label className="campo">
                  <span className="campo__etiqueta">Comentario</span>
                  <input
                    className="campo__control"
                    placeholder="Por qué se aprueba o se rechaza"
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                  />
                  <span className="campo__ayuda">
                    Al rechazar, el comentario le llega a la clienta: «rechazada» a secas no le dice
                    qué puede hacer.
                  </span>
                </label>

                <div className="modal__acciones">
                  <button
                    type="button"
                    className="boton boton--fantasma"
                    onClick={() => void resolver(false)}
                    disabled={trabajando}
                  >
                    Rechazar
                  </button>
                  <button
                    type="button"
                    className="boton boton--vino"
                    onClick={() => void resolver(true)}
                    disabled={trabajando}
                  >
                    Aprobar
                  </button>
                </div>
              </>
            )}

            {puedeGestionar && detalle.estado === 'aprobada' && (
              <div className="modal__acciones">
                <button
                  type="button"
                  className="boton boton--vino"
                  onClick={() => abrirRecepcion(detalle)}
                >
                  Recibir la mercadería
                </button>
              </div>
            )}

            {puedeGestionar && detalle.estado === 'recibida' && (
              <div className="modal__acciones">
                <button
                  type="button"
                  className="boton boton--vino"
                  onClick={() => abrirReembolso(detalle)}
                >
                  Registrar reembolso
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- Recepcion y clasificacion --- */}
      {recibiendo && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal__caja modal__caja--ancha">
            <header className="modal__cabecera">
              <div>
                <h2 className="modal__titulo">Recibir {recibiendo.numero}</h2>
                <p className="modal__sub">{recibiendo.cliente ?? 'sin clienta'}</p>
              </div>
              <button type="button" className="modal__cerrar" onClick={() => setRecibiendo(null)}>
                ✕
              </button>
            </header>

            <p className="modal__contexto">
              Mirá cada prenda antes de clasificarla. De esto depende si vuelve a estar a la venta.
            </p>

            <ul className="clasificar">
              {recibiendo.items.map((i) => (
                <li key={i.variante_id} className="clasificar__prenda">
                  <div>
                    <p className="clasificar__nombre">{i.descripcion}</p>
                    <p className="rotulo cifra">
                      {i.sku} · {i.cantidad} unidad{i.cantidad === 1 ? '' : 'es'}
                    </p>
                  </div>

                  <div className="clasificar__opciones">
                    {ESTADOS_PRENDA.map((e) => (
                      <button
                        key={e}
                        type="button"
                        className={clases(
                          'clasificar__opcion',
                          clasificacion[i.variante_id] === e && 'clasificar__opcion--activa'
                        )}
                        onClick={() =>
                          setClasificacion((c) => ({ ...c, [i.variante_id]: e }))
                        }
                      >
                        <span className="clasificar__titulo">{QUE_PASA[e].titulo}</span>
                        <span className="clasificar__detalle">{QUE_PASA[e].detalle}</span>
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>

            <div className="modal__acciones">
              <button
                type="button"
                className="boton boton--fantasma"
                onClick={() => setRecibiendo(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="boton boton--vino"
                onClick={() => void recibir()}
                disabled={trabajando || faltaClasificar}
              >
                {faltaClasificar ? 'Falta clasificar alguna' : 'Confirmar recepción'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Reembolso --- */}
      {reembolsando && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal__caja">
            <h2 className="modal__titulo">Reembolsar {reembolsando.numero}</h2>
            <p className="modal__bajada">
              {reembolsando.cliente ?? 'sin clienta'} · estimado{' '}
              {bs(reembolsando.monto_estimado)}
            </p>

            <div className="modal__campos">
              <label className="campo">
                <span className="campo__etiqueta">Monto</span>
                <input
                  className="campo__control"
                  type="number"
                  min="0"
                  step="1"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                />
                <span className="campo__ayuda">
                  Puede ser menos que el estimado si alguna prenda volvió dañada.
                </span>
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Comentario</span>
                <input
                  className="campo__control"
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                />
              </label>
            </div>

            <div className="modal__acciones">
              <button
                type="button"
                className="boton boton--fantasma"
                onClick={() => setReembolsando(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="boton boton--vino"
                onClick={() => void reembolsar()}
                disabled={trabajando}
              >
                Registrar reembolso
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
