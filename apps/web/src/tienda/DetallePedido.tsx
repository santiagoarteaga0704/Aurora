import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Pago, Pedido } from '@aurora/contratos'
import { api, ErrorApi } from '../api/cliente'
import { Cargando, ErrorCarga } from '../componentes/Estados'
import { bs, clases, fechaCompleta } from '../util/formato'
import { ESTADO_PEDIDO } from '../util/estados'

interface MetodoPago {
  id: number
  codigo: string
  nombre: string
  tipo: string
  requiere_comprobante: boolean
}

interface PasoHistorial {
  estado: string
  comentario: string | null
  usuario: string | null
  fecha: string
}

/**
 * Detalle de un pedido para la clienta, con el pago.
 *
 * Un pedido admite varios pagos parciales, asi que la pantalla muestra el saldo
 * y no solo el total: es la cifra que le dice a la clienta si todavia debe algo.
 */
export function DetallePedido() {
  const { id = '' } = useParams()

  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [pagos, setPagos] = useState<Pago[]>([])
  const [historial, setHistorial] = useState<PasoHistorial[]>([])
  const [metodos, setMetodos] = useState<MetodoPago[]>([])
  const [error, setError] = useState<string | null>(null)

  const [metodoId, setMetodoId] = useState<number | null>(null)
  const [referencia, setReferencia] = useState('')
  const [pagando, setPagando] = useState(false)
  const [avisoPago, setAvisoPago] = useState<string | null>(null)
  const [errorPago, setErrorPago] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const [p, pg, h] = await Promise.all([
        api.obtener<Pedido>(`/api/pedidos/${id}`),
        api.obtener<Pago[]>(`/api/pedidos/${id}/pagos`).catch(() => []),
        api.obtener<PasoHistorial[]>(`/api/pedidos/${id}/historial`).catch(() => []),
      ])
      setPedido(p)
      setPagos(pg)
      setHistorial(h)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    void (async () => {
      const lista = await api.obtener<MetodoPago[]>('/api/pagos/metodos?canal=online').catch(() => [])
      setMetodos(lista)
      if (lista.length > 0) setMetodoId(lista[0].id)
    })()
  }, [])

  if (error) {
    return (
      <div className="contenedor-angosto seccion">
        <ErrorCarga mensaje={error} reintentar={() => void cargar()} />
      </div>
    )
  }
  if (!pedido) {
    return (
      <div className="contenedor-angosto seccion">
        <Cargando texto="Buscando el pedido" />
      </div>
    )
  }

  const estado = ESTADO_PEDIDO[pedido.estado]
  const metodo = metodos.find((m) => m.id === metodoId)
  const pagable = pedido.saldo > 0 && !['cancelado', 'devuelto'].includes(pedido.estado)

  const registrarPago = async () => {
    if (!metodoId) return
    setErrorPago(null)
    setAvisoPago(null)
    setPagando(true)
    try {
      const { mensaje } = await api.enviarConMensaje<Pago>(`/api/pedidos/${id}/pagos`, {
        metodo_pago_id: metodoId,
        monto: pedido.saldo,
        referencia_externa: referencia.trim() || undefined,
      })
      setAvisoPago(mensaje ?? 'Pago registrado')
      setReferencia('')
      await cargar()
    } catch (e) {
      setErrorPago((e as ErrorApi).message)
    } finally {
      setPagando(false)
    }
  }

  return (
    <div className="contenedor-angosto seccion surge">
      <nav className="migas">
        <Link to="/mis-pedidos">Mis pedidos</Link>
        <span aria-hidden>/</span>
        <span className="cifra">{pedido.numero}</span>
      </nav>

      <header className="pedido__cabecera">
        <div>
          <p className="rotulo">Pedido</p>
          <h1 className="cifra pedido__numero">{pedido.numero}</h1>
        </div>
        <span className={clases('marca', estado.marca)}>{estado.texto}</span>
      </header>

      {pedido.estado === 'pendiente' && pedido.saldo > 0 && (
        <p className="aviso aviso--ojo">
          Tu pedido quedo reservado. Registra el pago para que la tienda lo prepare.
        </p>
      )}

      <section className="bloque">
        <p className="rotulo">Articulos</p>
        <table className="tabla">
          <tbody>
            {pedido.items.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.descripcion}
                  <span className="tabla__sub cifra">{i.sku}</span>
                </td>
                <td className="cifra tabla__num">{i.cantidad}</td>
                <td className="cifra tabla__num">{bs(i.precio_unitario)}</td>
                <td className="cifra tabla__num">{bs(i.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="totales">
          <div>
            <dt>Subtotal</dt>
            <dd className="cifra">{bs(pedido.subtotal)}</dd>
          </div>
          {pedido.descuento > 0 && (
            <div className="totales--descuento">
              <dt>Descuento</dt>
              <dd className="cifra">−{bs(pedido.descuento)}</dd>
            </div>
          )}
          {pedido.costo_envio > 0 && (
            <div>
              <dt>Envio</dt>
              <dd className="cifra">{bs(pedido.costo_envio)}</dd>
            </div>
          )}
          <div className="totales__total">
            <dt>Total</dt>
            <dd className="cifra">{bs(pedido.total)}</dd>
          </div>
          {pedido.pagado > 0 && (
            <>
              <div>
                <dt>Pagado</dt>
                <dd className="cifra">{bs(pedido.pagado)}</dd>
              </div>
              <div className="totales__total">
                <dt>Saldo</dt>
                <dd className="cifra">{bs(pedido.saldo)}</dd>
              </div>
            </>
          )}
        </dl>
      </section>

      {pagable && (
        <section className="bloque">
          <p className="rotulo">Pagar {bs(pedido.saldo)}</p>

          <div className="metodos">
            {metodos.map((m) => (
              <button
                key={m.id}
                type="button"
                className={clases('metodo', metodoId === m.id && 'metodo--activo')}
                onClick={() => setMetodoId(m.id)}
              >
                <span className="metodo__nombre">{m.nombre}</span>
                {m.requiere_comprobante && (
                  <span className="metodo__nota">Necesita comprobante</span>
                )}
              </button>
            ))}
          </div>

          {metodo?.requiere_comprobante && (
            <label className="campo">
              <span className="campo__etiqueta">Numero de operacion o referencia</span>
              <input
                className="campo__control cifra"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="El codigo que te dio el banco"
              />
            </label>
          )}

          {errorPago && <p className="aviso aviso--error">{errorPago}</p>}
          {avisoPago && <p className="aviso aviso--bien">{avisoPago}</p>}

          <button
            type="button"
            className="boton boton--vino boton--ancho"
            disabled={pagando || !metodoId}
            onClick={() => void registrarPago()}
          >
            {pagando ? 'Registrando...' : `Registrar pago de ${bs(pedido.saldo)}`}
          </button>
        </section>
      )}

      {pagos.length > 0 && (
        <section className="bloque">
          <p className="rotulo">Pagos</p>
          <table className="tabla tabla--compacta">
            <tbody>
              {pagos.map((p) => (
                <tr key={p.id}>
                  <td>{p.metodo}</td>
                  <td className="cifra tabla__num">{bs(p.monto)}</td>
                  <td>
                    <span
                      className={clases(
                        'marca',
                        p.estado === 'confirmado'
                          ? 'marca--bien'
                          : p.estado === 'rechazado'
                            ? 'marca--mala'
                            : 'marca--ojo'
                      )}
                    >
                      {p.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {historial.length > 0 && (
        <section className="bloque">
          <p className="rotulo">Seguimiento</p>
          <ol className="linea-tiempo">
            {historial.map((h, n) => (
              <li key={n}>
                <span className="linea-tiempo__punto" aria-hidden />
                <div>
                  <p className="linea-tiempo__estado">
                    {ESTADO_PEDIDO[h.estado as keyof typeof ESTADO_PEDIDO]?.texto ?? h.estado}
                  </p>
                  {h.comentario && <p className="linea-tiempo__nota">{h.comentario}</p>}
                  <p className="linea-tiempo__fecha cifra">{fechaCompleta(h.fecha)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
