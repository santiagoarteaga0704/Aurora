import { useCallback, useEffect, useState } from 'react'
import type { FilaInventario, MetaPagina } from '@aurora/contratos'
import { PERMISOS } from '@aurora/contratos'
import { api, consulta, ErrorApi } from '../api/cliente'
import { useSesion } from '../sesion/SesionContexto'
import { Cargando, ErrorCarga, Vacio } from '../componentes/Estados'
import { clases, numero } from '../util/formato'

/**
 * Inventario de la sucursal.
 *
 * El ajuste pide el stock CONTADO, no la diferencia, que es como se trabaja un
 * inventario fisico: alguien cuenta 18 y escribe 18. El sistema calcula la
 * diferencia y la registra con el motivo, que es lo que despues permite auditar
 * los faltantes.
 */
export function Inventario() {
  const { puede } = useSesion()

  const [filas, setFilas] = useState<FilaInventario[] | null>(null)
  const [meta, setMeta] = useState<MetaPagina | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [soloBajo, setSoloBajo] = useState(false)
  const [pagina, setPagina] = useState(1)

  const [ajustando, setAjustando] = useState<FilaInventario | null>(null)
  const [contado, setContado] = useState('')
  const [minimo, setMinimo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorAjuste, setErrorAjuste] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const r = await api.pagina<FilaInventario>(
        `/api/inventario${consulta({
          q: busqueda.trim() || undefined,
          solo_bajo_minimo: soloBajo ? 'true' : undefined,
          pagina,
          por_pagina: 30,
        })}`
      )
      setFilas(r.datos)
      setMeta(r.meta)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [busqueda, soloBajo, pagina])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const abrirAjuste = (fila: FilaInventario) => {
    setAjustando(fila)
    setContado(String(fila.stock))
    setMinimo(String(fila.stock_minimo))
    setMotivo('')
    setErrorAjuste(null)
  }

  const guardarAjuste = async () => {
    if (!ajustando) return
    setErrorAjuste(null)
    setGuardando(true)
    try {
      const { mensaje } = await api.enviarConMensaje<{ diferencia: number }>(
        '/api/inventario/ajuste',
        {
          variante_id: ajustando.variante_id,
          almacen_id: ajustando.almacen_id,
          stock_contado: Number(contado),
          stock_minimo: minimo === '' ? undefined : Number(minimo),
          motivo,
        }
      )
      setAviso(mensaje ?? 'Ajuste registrado')
      setAjustando(null)
      await cargar()
    } catch (e) {
      setErrorAjuste((e as ErrorApi).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="pantalla">
      <header className="pantalla__cabecera">
        <div>
          <h1 className="pantalla__titulo">Inventario</h1>
          {meta && <p className="rotulo">{numero(meta.total)} registros</p>}
        </div>

        <div className="pantalla__controles">
          <input
            className="campo__control"
            placeholder="Buscar por producto o SKU"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value)
              setPagina(1)
            }}
          />
          <label className="interruptor">
            <input
              type="checkbox"
              checked={soloBajo}
              onChange={(e) => {
                setSoloBajo(e.target.checked)
                setPagina(1)
              }}
            />
            <span>Solo bajo minimo</span>
          </label>
        </div>
      </header>

      {aviso && <p className="aviso aviso--bien">{aviso}</p>}

      {error ? (
        <ErrorCarga mensaje={error} reintentar={() => void cargar()} />
      ) : filas === null ? (
        <Cargando />
      ) : filas.length === 0 ? (
        <Vacio
          titulo="Sin registros"
          detalle={
            soloBajo
              ? 'No hay articulos por debajo del minimo. Buena noticia.'
              : 'Todavia no hay stock cargado en esta sucursal.'
          }
        />
      ) : (
        <div className="tabla-envoltorio">
          <table className="tabla tabla--oscura">
            <thead>
              <tr>
                <th>Articulo</th>
                <th>SKU</th>
                <th>Almacen</th>
                <th className="tabla__num">Stock</th>
                <th className="tabla__num">Reservado</th>
                <th className="tabla__num">Disponible</th>
                <th className="tabla__num">Minimo</th>
                {puede(PERMISOS.INVENTARIO_AJUSTAR) && <th />}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr
                  key={`${f.variante_id}-${f.almacen_id}`}
                  className={clases(f.bajo_minimo && 'tabla__fila--alerta')}
                >
                  <td>
                    {f.producto}
                    <span className="tabla__sub">
                      {f.talla} · {f.color}
                    </span>
                  </td>
                  <td className="cifra">{f.sku}</td>
                  <td>
                    {f.almacen}
                    <span className="tabla__sub">{f.sucursal}</span>
                  </td>
                  <td className="cifra tabla__num">{numero(f.stock)}</td>
                  <td className="cifra tabla__num">{numero(f.reservado)}</td>
                  <td className="cifra tabla__num">
                    <strong>{numero(f.disponible)}</strong>
                  </td>
                  <td className="cifra tabla__num">{numero(f.stock_minimo)}</td>
                  {puede(PERMISOS.INVENTARIO_AJUSTAR) && (
                    <td className="tabla__num">
                      <button
                        type="button"
                        className="boton boton--fantasma"
                        onClick={() => abrirAjuste(f)}
                      >
                        Ajustar
                      </button>
                    </td>
                  )}
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

      {ajustando && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal__caja">
            <header className="modal__cabecera">
              <div>
                <p className="rotulo">Ajuste por conteo</p>
                <h2 className="modal__titulo">{ajustando.producto}</h2>
                <p className="cifra modal__sub">
                  {ajustando.sku} · {ajustando.almacen}
                </p>
              </div>
              <button type="button" className="modal__cerrar" onClick={() => setAjustando(null)}>
                ×
              </button>
            </header>

            <div className="formulario">
              <p className="modal__contexto">
                El sistema tiene <strong className="cifra">{numero(ajustando.stock)}</strong>{' '}
                unidades. Escribi lo que contaste de verdad.
              </p>

              <label className="campo">
                <span className="campo__etiqueta">Stock contado</span>
                <input
                  type="number"
                  min={0}
                  className="campo__control cifra"
                  value={contado}
                  onChange={(e) => setContado(e.target.value)}
                  autoFocus
                />
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Stock minimo</span>
                <input
                  type="number"
                  min={0}
                  className="campo__control cifra"
                  value={minimo}
                  onChange={(e) => setMinimo(e.target.value)}
                />
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Motivo</span>
                <input
                  className="campo__control"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Conteo semanal, rotura, merma..."
                />
              </label>

              {Number(contado) !== ajustando.stock && (
                <p className="aviso aviso--ojo">
                  Se va a registrar una diferencia de{' '}
                  <strong className="cifra">
                    {Number(contado) > ajustando.stock ? '+' : ''}
                    {Number(contado) - ajustando.stock}
                  </strong>{' '}
                  unidades.
                </p>
              )}

              {errorAjuste && <p className="aviso aviso--error">{errorAjuste}</p>}

              <div className="modal__acciones">
                <button
                  type="button"
                  className="boton boton--linea"
                  onClick={() => setAjustando(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="boton boton--vino"
                  disabled={guardando || motivo.trim().length < 3}
                  onClick={() => void guardarAjuste()}
                >
                  {guardando ? 'Guardando...' : 'Registrar ajuste'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
