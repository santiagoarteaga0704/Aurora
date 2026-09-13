import { useCallback, useEffect, useState } from 'react'
import type { EstadoPedido, MetaPagina, Pedido } from '@aurora/contratos'
import { ESTADOS_PEDIDO, TRANSICIONES_PEDIDO } from '@aurora/contratos'
import { api, consulta, ErrorApi } from '../api/cliente'
import { Cargando, ErrorCarga, Vacio } from '../componentes/Estados'
import { bs, clases, fechaCompleta, numero } from '../util/formato'
import { ESTADO_PEDIDO } from '../util/estados'

interface FilaPedido {
  id: string
  numero: string
  estado: EstadoPedido
  canal: string
  cliente: string | null
  total: number
  pagado: number
  unidades: number
  creado_en: string
  creado_offline: boolean
}

/**
 * Pedidos de la sucursal.
 *
 * Los botones de avance se arman con TRANSICIONES_PEDIDO, la misma tabla que usa
 * el servidor para validar. Asi la pantalla no puede ofrecer un paso que el
 * backend va a rechazar: si manianía se agrega un estado, aparece solo.
 */
export function PedidosOperaciones() {
  const [pedidos, setPedidos] = useState<FilaPedido[] | null>(null)
  const [meta, setMeta] = useState<MetaPagina | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<string>('')
  const [pagina, setPagina] = useState(1)

  const [abierto, setAbierto] = useState<Pedido | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const r = await api.pagina<FilaPedido>(
        `/api/pedidos${consulta({ estado: filtroEstado || undefined, pagina, por_pagina: 25 })}`
      )
      setPedidos(r.datos)
      setMeta(r.meta)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [filtroEstado, pagina])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const abrir = async (id: string) => {
    setErrorAccion(null)
    try {
      setAbierto(await api.obtener<Pedido>(`/api/pedidos/${id}`))
    } catch (e) {
      setErrorAccion((e as Error).message)
    }
  }

  const avanzar = async (estado: EstadoPedido) => {
    if (!abierto) return
    setErrorAccion(null)
    setTrabajando(true)
    try {
      if (estado === 'cancelado') {
        const motivo = window.prompt('¿Por que se cancela el pedido?')
        if (!motivo) return
        const { mensaje } = await api.enviarConMensaje<Pedido>(
          `/api/pedidos/${abierto.id}/cancelar`,
          { motivo }
        )
        setAviso(mensaje ?? 'Pedido cancelado')
      } else {
        const { mensaje } = await api.enviarConMensaje<Pedido>(
          `/api/pedidos/${abierto.id}/estado`,
          { estado }
        )
        setAviso(mensaje ?? 'Pedido actualizado')
      }
      setAbierto(await api.obtener<Pedido>(`/api/pedidos/${abierto.id}`))
      await cargar()
    } catch (e) {
      setErrorAccion((e as ErrorApi).message)
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div className="pantalla">
      <header className="pantalla__cabecera">
        <div>
          <h1 className="pantalla__titulo">Pedidos</h1>
          {meta && <p className="rotulo">{numero(meta.total)} pedidos</p>}
        </div>

        <div className="pantalla__controles">
          <select
            className="campo__control"
            value={filtroEstado}
            onChange={(e) => {
              setFiltroEstado(e.target.value)
              setPagina(1)
            }}
          >
            <option value="">Todos los estados</option>
            {ESTADOS_PEDIDO.map((e) => (
              <option key={e} value={e}>
                {ESTADO_PEDIDO[e].texto}
              </option>
            ))}
          </select>
        </div>
      </header>

      {aviso && <p className="aviso aviso--bien">{aviso}</p>}

      {error ? (
        <ErrorCarga mensaje={error} reintentar={() => void cargar()} />
      ) : pedidos === null ? (
        <Cargando />
      ) : pedidos.length === 0 ? (
        <Vacio titulo="Sin pedidos" detalle="No hay pedidos que coincidan con el filtro." />
      ) : (
        <div className="tabla-envoltorio">
          <table className="tabla tabla--oscura tabla--clicable">
            <thead>
              <tr>
                <th>Numero</th>
                <th>Cliente</th>
                <th>Canal</th>
                <th className="tabla__num">Articulos</th>
                <th className="tabla__num">Total</th>
                <th className="tabla__num">Saldo</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} onClick={() => void abrir(p.id)}>
                  <td className="cifra">
                    {p.numero}
                    {p.creado_offline && <span className="marca marca--ojo">offline</span>}
                  </td>
                  <td>{p.cliente ?? <span className="tabla__sub">Sin identificar</span>}</td>
                  <td>{p.canal === 'tienda' ? 'Mostrador' : 'En linea'}</td>
                  <td className="cifra tabla__num">{p.unidades}</td>
                  <td className="cifra tabla__num">{bs(p.total)}</td>
                  <td className="cifra tabla__num">
                    {p.total - p.pagado > 0 ? bs(p.total - p.pagado) : '—'}
                  </td>
                  <td>
                    <span className={clases('marca', ESTADO_PEDIDO[p.estado].marca)}>
                      {ESTADO_PEDIDO[p.estado].texto}
                    </span>
                  </td>
                  <td className="cifra tabla__sub">{fechaCompleta(p.creado_en)}</td>
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

      {abierto && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal__caja modal__caja--ancha">
            <header className="modal__cabecera">
              <div>
                <p className="rotulo">Pedido</p>
                <h2 className="modal__titulo cifra">{abierto.numero}</h2>
                <p className="modal__sub">
                  {abierto.cliente ?? 'Sin identificar'} ·{' '}
                  {abierto.canal === 'tienda' ? 'Mostrador' : 'En linea'} · {abierto.sucursal}
                </p>
              </div>
              <button type="button" className="modal__cerrar" onClick={() => setAbierto(null)}>
                ×
              </button>
            </header>

            <table className="tabla tabla--oscura tabla--compacta">
              <tbody>
                {abierto.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {i.descripcion}
                      <span className="tabla__sub cifra">{i.sku}</span>
                    </td>
                    <td className="cifra tabla__num">{i.cantidad}</td>
                    <td className="cifra tabla__num">{bs(i.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <dl className="totales totales--oscuro">
              <div>
                <dt>Subtotal</dt>
                <dd className="cifra">{bs(abierto.subtotal)}</dd>
              </div>
              {abierto.descuento > 0 && (
                <div className="totales--descuento">
                  <dt>Descuento</dt>
                  <dd className="cifra">−{bs(abierto.descuento)}</dd>
                </div>
              )}
              <div className="totales__total">
                <dt>Total</dt>
                <dd className="cifra">{bs(abierto.total)}</dd>
              </div>
              <div>
                <dt>Pagado</dt>
                <dd className="cifra">{bs(abierto.pagado)}</dd>
              </div>
              {abierto.saldo > 0 && (
                <div className="totales__total totales--pendiente">
                  <dt>Saldo</dt>
                  <dd className="cifra">{bs(abierto.saldo)}</dd>
                </div>
              )}
            </dl>

            {errorAccion && <p className="aviso aviso--error">{errorAccion}</p>}

            <div className="modal__acciones modal__acciones--abierto">
              <span className={clases('marca', ESTADO_PEDIDO[abierto.estado].marca)}>
                {ESTADO_PEDIDO[abierto.estado].texto}
              </span>

              <div className="modal__botones">
                {TRANSICIONES_PEDIDO[abierto.estado].map((siguiente) => (
                  <button
                    key={siguiente}
                    type="button"
                    className={clases(
                      'boton',
                      siguiente === 'cancelado' ? 'boton--linea' : 'boton--vino'
                    )}
                    disabled={trabajando}
                    onClick={() => void avanzar(siguiente)}
                  >
                    {siguiente === 'cancelado'
                      ? 'Cancelar pedido'
                      : `Marcar ${ESTADO_PEDIDO[siguiente].texto.toLowerCase()}`}
                  </button>
                ))}
                {TRANSICIONES_PEDIDO[abierto.estado].length === 0 && (
                  <p className="modal__sub">Este pedido ya esta cerrado.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
