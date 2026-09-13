import { useCallback, useEffect, useState } from 'react'
import type { Envio, EstadoEnvio, MetaPagina } from '@aurora/contratos'
import { ESTADOS_ENVIO, PERMISOS, TRANSICIONES_ENVIO } from '@aurora/contratos'
import { api, consulta, ErrorApi } from '../api/cliente'
import { useSesion } from '../sesion/SesionContexto'
import { Cargando, ErrorCarga, Vacio } from '../componentes/Estados'
import { bs, clases, fecha } from '../util/formato'

const MARCA: Record<EstadoEnvio, string> = {
  preparando: 'marca--ojo',
  en_ruta: 'marca--vino',
  entregado: 'marca--bien',
  fallido: 'marca--mala',
  devuelto: 'marca--neutra',
}

const TEXTO: Record<EstadoEnvio, string> = {
  preparando: 'Preparando',
  en_ruta: 'En ruta',
  entregado: 'Entregado',
  fallido: 'No se pudo entregar',
  devuelto: 'Devuelto',
}

/** Que dice el boton que lleva a cada estado. */
const ACCION: Record<EstadoEnvio, string> = {
  preparando: 'Volver a preparación',
  en_ruta: 'Salir a ruta',
  entregado: 'Marcar entregado',
  fallido: 'No se pudo entregar',
  devuelto: 'Devolver al local',
}

/**
 * Hoja de ruta.
 *
 * Es la pantalla del repartidor, asi que esta pensada para usarse con una mano
 * y en la calle: cada envio es una tarjeta con la direccion grande y los
 * botones de lo que puede pasar. Una tabla con scroll horizontal, que es lo
 * natural en escritorio, seria inservible en un telefono a mitad de reparto.
 *
 * Los estados a los que se puede pasar salen de `TRANSICIONES_ENVIO`, el mismo
 * mapa que valida el servidor. Ofrecer un boton que despues va a dar 409 es
 * hacerle perder el viaje a alguien.
 */
export function Envios() {
  const { puede, perfil } = useSesion()

  const [filas, setFilas] = useState<Envio[] | null>(null)
  const [meta, setMeta] = useState<MetaPagina | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [estado, setEstado] = useState('')
  const [soloMios, setSoloMios] = useState(false)
  const [pagina, setPagina] = useState(1)

  const [cambiando, setCambiando] = useState<{ envio: Envio; a: EstadoEnvio } | null>(null)
  const [comentario, setComentario] = useState('')
  const [trabajando, setTrabajando] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const r = await api.pagina<Envio>(
        `/api/envios${consulta({
          estado: estado || undefined,
          repartidor_id: soloMios ? perfil?.id : undefined,
          pagina,
          por_pagina: 30,
        })}`
      )
      setFilas(r.datos)
      setMeta(r.meta)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [estado, soloMios, pagina, perfil?.id])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const cambiar = async () => {
    if (!cambiando) return
    setTrabajando(true)
    try {
      await api.actualizar(`/api/envios/${cambiando.envio.id}`, {
        estado: cambiando.a,
        comentario: comentario.trim() || undefined,
      })
      setAviso(`Pedido ${cambiando.envio.pedido_numero}: ${TEXTO[cambiando.a].toLowerCase()}`)
      setCambiando(null)
      setComentario('')
      await cargar()
    } catch (e) {
      setAviso((e as ErrorApi).message)
    } finally {
      setTrabajando(false)
    }
  }

  if (error) return <ErrorCarga mensaje={error} reintentar={() => void cargar()} />

  const puedeDespachar = puede(PERMISOS.VENTA_DESPACHAR)

  return (
    <div className="pantalla">
      <header className="pantalla__cabecera">
        <div>
          <h1 className="pantalla__titulo">Envíos</h1>
          <p className="rotulo">
            {meta ? `${meta.total} envío${meta.total === 1 ? '' : 's'}` : 'Hoja de ruta'}
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
            <option value="">Todos</option>
            {ESTADOS_ENVIO.map((e) => (
              <option key={e} value={e}>
                {TEXTO[e]}
              </option>
            ))}
          </select>

          <label className="interruptor">
            <input
              type="checkbox"
              checked={soloMios}
              onChange={(e) => {
                setSoloMios(e.target.checked)
                setPagina(1)
              }}
            />
            <span>Solo los míos</span>
          </label>
        </div>
      </header>

      {aviso && <p className="aviso aviso--bien">{aviso}</p>}

      {filas === null ? (
        <Cargando texto="Armando la hoja de ruta" />
      ) : filas.length === 0 ? (
        <Vacio
          titulo="No hay envíos"
          detalle={
            soloMios
              ? 'No tenés envíos asignados.'
              : 'Cuando un pedido a domicilio se despache, aparece acá.'
          }
        />
      ) : (
        <ul className="ruta">
          {filas.map((e) => {
            const siguientes = TRANSICIONES_ENVIO[e.estado]
            return (
              <li key={e.id} className={clases('ruta__parada', `ruta__parada--${e.estado}`)}>
                <div className="ruta__cabecera">
                  <div>
                    <p className="cifra ruta__pedido">{e.pedido_numero}</p>
                    <p className="ruta__direccion">{e.direccion ?? 'Sin dirección cargada'}</p>
                  </div>
                  <span className={clases('marca', MARCA[e.estado])}>{TEXTO[e.estado]}</span>
                </div>

                <dl className="ruta__datos">
                  {e.repartidor && (
                    <div>
                      <dt className="rotulo">Reparte</dt>
                      <dd>{e.repartidor}</dd>
                    </div>
                  )}
                  {e.empresa && (
                    <div>
                      <dt className="rotulo">Empresa</dt>
                      <dd>{e.empresa}</dd>
                    </div>
                  )}
                  {e.tracking && (
                    <div>
                      <dt className="rotulo">Guía</dt>
                      <dd className="cifra">{e.tracking}</dd>
                    </div>
                  )}
                  {e.fecha_estimada && (
                    <div>
                      <dt className="rotulo">Estimada</dt>
                      <dd className="cifra">{fecha(e.fecha_estimada)}</dd>
                    </div>
                  )}
                  {e.entregado_en && (
                    <div>
                      <dt className="rotulo">Entregado</dt>
                      <dd className="cifra">{fecha(e.entregado_en)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="rotulo">Costo</dt>
                    <dd className="cifra">{bs(e.costo)}</dd>
                  </div>
                </dl>

                {puedeDespachar && siguientes.length > 0 && (
                  <div className="ruta__acciones">
                    {siguientes.map((a) => (
                      <button
                        key={a}
                        type="button"
                        className={clases(
                          'boton',
                          a === 'entregado' ? 'boton--vino' : 'boton--linea'
                        )}
                        onClick={() => {
                          setCambiando({ envio: e, a })
                          setComentario('')
                        }}
                      >
                        {ACCION[a]}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
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

      {cambiando && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal__caja">
            <h2 className="modal__titulo">{ACCION[cambiando.a]}</h2>
            <p className="modal__bajada">
              Pedido {cambiando.envio.pedido_numero} · {cambiando.envio.direccion ?? 'sin dirección'}
            </p>

            <label className="campo">
              <span className="campo__etiqueta">
                {cambiando.a === 'fallido' ? 'Qué pasó' : 'Comentario'}
              </span>
              <input
                className="campo__control"
                placeholder={
                  cambiando.a === 'fallido' ? 'No había nadie, dirección equivocada…' : 'Opcional'
                }
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
              />
              {cambiando.a === 'fallido' && (
                <span className="campo__ayuda">
                  Un intento fallido no cierra el envío: se puede volver a salir a ruta.
                </span>
              )}
            </label>

            <div className="modal__acciones">
              <button
                type="button"
                className="boton boton--fantasma"
                onClick={() => setCambiando(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="boton boton--vino"
                onClick={() => void cambiar()}
                disabled={trabajando}
              >
                {trabajando ? 'Guardando' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
