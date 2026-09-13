import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { OperacionRegistrada } from '@aurora/contratos'
import { api } from '../api/cliente'
import { conflictos as conflictosLocales, descartar, type OperacionEncolada } from '../offline/cola'
import { useConexion } from '../offline/ConexionContexto'
import { Cargando, Vacio } from '../componentes/Estados'
import { bs, clases, fechaCompleta, hace } from '../util/formato'

/**
 * Ventas que no se pudieron aplicar al volver la conexion.
 *
 * Hasta ahora la cola marcaba los conflictos y ninguna pantalla los mostraba:
 * una venta rechazada porque el stock ya no alcanzaba quedaba como un registro
 * invisible en el navegador. Alguien cobro esa prenda y el sistema no la tiene.
 *
 * La pantalla junta las dos fuentes a proposito:
 *
 *   - Lo que el SERVIDOR registro en `sync_operacion`. Es lo que se puede
 *     revisar desde cualquier equipo y sobrevive a que se limpie el navegador.
 *   - Lo que quedo marcado en la cola LOCAL. Es lo unico que se ve cuando el
 *     conflicto es de este equipo y todavia no se pudo consultar al servidor.
 *
 * Mostrar solo una de las dos dejaria un hueco: la primera no se ve sin
 * conexion, y la segunda no la ve nadie mas que quien vendio.
 */
export function Conflictos() {
  const { enLinea, sincronizarYa, sincronizando } = useConexion()

  const [delServidor, setDelServidor] = useState<OperacionRegistrada[] | null>(null)
  const [locales, setLocales] = useState<OperacionEncolada[]>([])
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    setLocales(await conflictosLocales())

    if (!enLinea) {
      setDelServidor([])
      return
    }

    try {
      const p = await api.pagina<OperacionRegistrada>(
        '/api/sync/operaciones?estado=conflicto&por_pagina=50'
      )
      const rechazadas = await api.pagina<OperacionRegistrada>(
        '/api/sync/operaciones?estado=rechazado&por_pagina=50'
      )
      setDelServidor(
        [...p.datos, ...rechazadas.datos].sort((a, b) =>
          b.recibido_en.localeCompare(a.recibido_en)
        )
      )
    } catch (e) {
      setError((e as Error).message)
      setDelServidor([])
    }
  }, [enLinea])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const quitar = async (id: number) => {
    await descartar(id)
    setLocales(await conflictosLocales())
  }

  if (delServidor === null) {
    return (
      <div className="pantalla">
        <Cargando texto="Buscando operaciones sin aplicar" />
      </div>
    )
  }

  // Las locales que el servidor ya registro no se repiten: seria la misma venta
  // contada dos veces, y quien mira no tendria como saber que es una sola.
  const clavesDelServidor = new Set(delServidor.map((o) => o.idempotency_key))
  const soloLocales = locales.filter((o) => !clavesDelServidor.has(o.idempotencia))

  const total = delServidor.length + soloLocales.length

  return (
    <div className="pantalla">
      <header className="pantalla__cabecera">
        <div>
          <h1 className="pantalla__titulo">Sin aplicar</h1>
          <p className="rotulo">
            Ventas registradas sin conexión que el servidor no pudo aceptar
          </p>
        </div>

        <button
          type="button"
          className="boton boton--linea"
          onClick={() => void sincronizarYa().then(cargar)}
          disabled={sincronizando || !enLinea}
        >
          {sincronizando ? 'Enviando' : 'Reintentar envío'}
        </button>
      </header>

      {error && <p className="aviso aviso--error">{error}</p>}

      {!enLinea && (
        <p className="aviso">
          Sin conexión solo se ve lo de este equipo. Al volver la señal aparecen también las de los
          demás.
        </p>
      )}

      {total === 0 ? (
        <Vacio
          titulo="No hay nada sin aplicar"
          detalle="Todas las ventas registradas sin conexión entraron al sistema."
          accion={
            <Link to="/op" className="boton boton--linea">
              Volver al punto de venta
            </Link>
          }
        />
      ) : (
        <ul className="conflictos">
          {delServidor.map((o) => (
            <li key={o.id} className={clases('conflicto', `conflicto--${o.estado}`)}>
              <div className="conflicto__cabecera">
                <p className="conflicto__resumen">{o.resumen}</p>
                <span className={clases('marca', o.estado === 'conflicto' ? 'marca--ojo' : 'marca--mala')}>
                  {o.estado === 'conflicto' ? 'No entró' : 'Rechazada'}
                </span>
              </div>

              <p className="conflicto__motivo">{o.error ?? 'Sin motivo registrado'}</p>

              <dl className="conflicto__datos">
                <div>
                  <dt className="rotulo">Registrada</dt>
                  <dd className="cifra">{fechaCompleta(o.creado_en_cliente)}</dd>
                </div>
                <div>
                  <dt className="rotulo">Recibida</dt>
                  <dd className="cifra">{fechaCompleta(o.recibido_en)}</dd>
                </div>
                {o.usuario && (
                  <div>
                    <dt className="rotulo">Quien vendió</dt>
                    <dd>{o.usuario}</dd>
                  </div>
                )}
                {o.dispositivo && (
                  <div>
                    <dt className="rotulo">Equipo</dt>
                    <dd className="cifra">{o.dispositivo}</dd>
                  </div>
                )}
              </dl>

              {/* Solo los conflictos se pueden rehacer. Un rechazo significa que
                  la operacion esta mal formada: volver a cobrarla no arregla
                  nada. */}
              {o.estado === 'conflicto' && (
                <p className="conflicto__que-hacer">
                  Volvé a cobrarla en el <Link to="/op">punto de venta</Link> con lo que sí haya en
                  stock, o devolvé el dinero.
                </p>
              )}
            </li>
          ))}

          {soloLocales.map((o) => (
            <li key={`local-${o.id}`} className="conflicto conflicto--local">
              <div className="conflicto__cabecera">
                <p className="conflicto__resumen">{o.resumen}</p>
                <span className="marca marca--ojo">Solo en este equipo</span>
              </div>

              <p className="conflicto__motivo">{o.motivo ?? 'No se pudo enviar'}</p>

              <dl className="conflicto__datos">
                <div>
                  <dt className="rotulo">Registrada</dt>
                  <dd className="cifra">{hace(o.creada_en)}</dd>
                </div>
                <div>
                  <dt className="rotulo">Monto</dt>
                  <dd className="cifra">{bs(o.monto)}</dd>
                </div>
                <div>
                  <dt className="rotulo">Intentos</dt>
                  <dd className="cifra">{o.intentos}</dd>
                </div>
              </dl>

              <div className="conflicto__acciones">
                <button
                  type="button"
                  className="boton boton--fantasma"
                  onClick={() => o.id !== undefined && void quitar(o.id)}
                >
                  Quitar de la lista
                </button>
                <span className="conflicto__que-hacer">
                  Quitarla no la registra: si la venta se cobró, hay que rehacerla o devolver el
                  dinero.
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
