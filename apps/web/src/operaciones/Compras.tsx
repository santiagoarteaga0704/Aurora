import { useCallback, useEffect, useState } from 'react'
import type { Compra, CompraResumen, EstadoCompra, MetaPagina } from '@aurora/contratos'
import { ESTADOS_COMPRA, PERMISOS } from '@aurora/contratos'
import { api, consulta, ErrorApi } from '../api/cliente'
import { useSesion } from '../sesion/SesionContexto'
import { Cargando, ErrorCarga, Vacio } from '../componentes/Estados'
import { bs, clases, fecha, numero } from '../util/formato'

interface Proveedor {
  id: number
  nombre: string
  nit: string | null
  contacto: string | null
  telefono: string | null
  email: string | null
  activo: boolean
}

interface Almacen {
  id: number
  nombre: string
  tipo: string
  sucursal: string
}

/** Una variante del catalogo, para poder elegirla al armar la compra. */
interface VarianteCatalogo {
  id: number
  sku: string
  descripcion: string
  costo: number
}

interface LineaNueva {
  variante_id: number
  sku: string
  descripcion: string
  cantidad: string
  costo_unitario: string
}

/** Como se pinta cada estado. El color dice si hay algo que hacer. */
const MARCA: Record<EstadoCompra, string> = {
  borrador: 'marca--ojo',
  confirmada: 'marca--vino',
  recibida: 'marca--bien',
  anulada: 'marca--mala',
}

/**
 * Compras a proveedores.
 *
 * El ciclo tiene tres momentos y la pantalla los respeta: se arma en borrador,
 * se confirma —queda comprometida con el proveedor— y se recibe, que es el
 * unico paso que toca el inventario.
 *
 * Al recibir se cuenta lo que llego de verdad, no lo que decia el pedido. Es
 * lo normal que lleguen 18 de 20, y dar por recibidas las 20 mete dos unidades
 * fantasma en el stock que despues nadie encuentra.
 */
export function Compras() {
  const { puede } = useSesion()

  const [filas, setFilas] = useState<CompraResumen[] | null>(null)
  const [meta, setMeta] = useState<MetaPagina | null>(null)
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [almacenes, setAlmacenes] = useState<Almacen[]>([])
  const [catalogo, setCatalogo] = useState<VarianteCatalogo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [estado, setEstado] = useState<string>('')
  const [pagina, setPagina] = useState(1)

  const [detalle, setDetalle] = useState<Compra | null>(null)
  const [recibiendo, setRecibiendo] = useState<Compra | null>(null)
  const [contado, setContado] = useState<Record<number, string>>({})
  const [trabajando, setTrabajando] = useState(false)

  const [alta, setAlta] = useState(false)
  const [nueva, setNueva] = useState({ proveedor_id: '', almacen_id: '', descuento: '0' })
  const [lineas, setLineas] = useState<LineaNueva[]>([])
  const [buscado, setBuscado] = useState('')
  const [errorAlta, setErrorAlta] = useState<string | null>(null)

  const [verProveedores, setVerProveedores] = useState(false)
  const [altaProveedor, setAltaProveedor] = useState(false)
  const [proveedor, setProveedor] = useState({ nombre: '', nit: '', contacto: '', telefono: '', email: '' })
  const [errorProveedor, setErrorProveedor] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const r = await api.pagina<CompraResumen>(
        `/api/compras${consulta({ estado: estado || undefined, pagina, por_pagina: 20 })}`
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

  useEffect(() => {
    void api.obtener<Proveedor[]>('/api/proveedores?todos=true').then(setProveedores).catch(() => [])
    void api.obtener<Almacen[]>('/api/inventario/almacenes').then(setAlmacenes).catch(() => [])
  }, [])

  /**
   * El catalogo entero, una sola vez.
   *
   * Son unas decenas de variantes y se busca con el teclado mientras se arma la
   * compra: una peticion por tecla seria peor para todos. El mismo criterio que
   * usa el punto de venta, y por el mismo motivo.
   */
  useEffect(() => {
    if (!alta || catalogo.length > 0) return

    void api
      .pagina<{
        id: number
        nombre: string
        variantes: { id: number; sku: string; talla: string; color: string; precio: number }[]
      }>('/api/catalogo/productos?por_pagina=100')
      .then((r) =>
        setCatalogo(
          r.datos.flatMap((prod) =>
            (prod.variantes ?? []).map((v) => ({
              id: v.id,
              sku: v.sku,
              descripcion: `${prod.nombre} · ${v.talla} / ${v.color}`,
              // El costo se propone como la mitad del precio de venta: es un
              // punto de partida razonable que quien compra corrige, no un dato
              // que el sistema pretenda saber.
              costo: Math.round(v.precio * 0.5),
            }))
          )
        )
      )
      .catch(() => setCatalogo([]))
  }, [alta, catalogo.length])

  // --- Acciones sobre una compra -------------------------------------------

  /**
   * Abre el detalle pidiendolo al servidor.
   *
   * El listado no trae las lineas —veinte compras con todos sus articulos son
   * cientos de filas que nadie va a mirar— asi que se piden al abrir, que es
   * cuando se necesitan.
   */
  const abrirDetalle = async (id: string) => {
    setDetalle(await api.obtener<Compra>(`/api/compras/${id}`).catch(() => null))
  }

  const confirmar = async (c: Compra) => {
    setTrabajando(true)
    try {
      await api.enviar(`/api/compras/${c.id}/confirmar`)
      setAviso(`Compra ${c.numero} confirmada. Falta recibir la mercadería.`)
      setDetalle(null)
      await cargar()
    } catch (e) {
      setAviso((e as ErrorApi).message)
    } finally {
      setTrabajando(false)
    }
  }

  const anular = async (c: Compra) => {
    setTrabajando(true)
    try {
      await api.enviar(`/api/compras/${c.id}/anular`)
      setAviso(`Compra ${c.numero} anulada`)
      setDetalle(null)
      await cargar()
    } catch (e) {
      setAviso((e as ErrorApi).message)
    } finally {
      setTrabajando(false)
    }
  }

  const abrirRecepcion = (c: Compra) => {
    // Se propone lo pedido, que es lo que suele llegar; quien recibe corrige
    // las lineas que vinieron distintas.
    setContado(Object.fromEntries(c.items.map((i) => [i.variante_id, String(i.cantidad)])))
    setRecibiendo(c)
    setDetalle(null)
  }

  const recibir = async () => {
    if (!recibiendo) return
    setTrabajando(true)
    try {
      await api.enviar(`/api/compras/${recibiendo.id}/recibir`, {
        items: recibiendo.items.map((i) => ({
          variante_id: i.variante_id,
          cantidad_recibida: Number(contado[i.variante_id] ?? 0),
        })),
      })
      setAviso(`Compra ${recibiendo.numero} recibida. El stock ya está actualizado.`)
      setRecibiendo(null)
      await cargar()
    } catch (e) {
      setAviso((e as ErrorApi).message)
    } finally {
      setTrabajando(false)
    }
  }

  const abrirAlta = () => {
    setNueva({ proveedor_id: '', almacen_id: '', descuento: '0' })
    setLineas([])
    setBuscado('')
    setErrorAlta(null)
    setAlta(true)
  }

  const agregarLinea = (v: VarianteCatalogo) => {
    setBuscado('')
    setLineas((ls) =>
      ls.some((l) => l.variante_id === v.id)
        ? // Repetir una variante en dos lineas es lo que el servidor rechaza:
          // se le suma una unidad a la que ya esta.
          ls.map((l) =>
            l.variante_id === v.id ? { ...l, cantidad: String(Number(l.cantidad) + 1) } : l
          )
        : [
            ...ls,
            {
              variante_id: v.id,
              sku: v.sku,
              descripcion: v.descripcion,
              cantidad: '1',
              costo_unitario: String(v.costo),
            },
          ]
    )
  }

  const guardarCompra = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorAlta(null)

    if (lineas.length === 0) {
      setErrorAlta('La compra necesita al menos un articulo')
      return
    }

    setTrabajando(true)
    try {
      const compra = await api.enviar<Compra>('/api/compras', {
        proveedor_id: Number(nueva.proveedor_id),
        almacen_id: Number(nueva.almacen_id),
        descuento: Number(nueva.descuento || 0),
        items: lineas.map((l) => ({
          variante_id: l.variante_id,
          cantidad: Number(l.cantidad),
          costo_unitario: Number(l.costo_unitario),
        })),
      })
      setAlta(false)
      setAviso(`Compra ${compra.numero} creada en borrador. Confirmala para comprometerla.`)
      await cargar()
    } catch (err) {
      setErrorAlta((err as ErrorApi).message)
    } finally {
      setTrabajando(false)
    }
  }

  const crearProveedor = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorProveedor(null)
    try {
      await api.enviar('/api/proveedores', {
        nombre: proveedor.nombre,
        nit: proveedor.nit || undefined,
        contacto: proveedor.contacto || undefined,
        telefono: proveedor.telefono || undefined,
        email: proveedor.email || undefined,
      })
      setAltaProveedor(false)
      setProveedor({ nombre: '', nit: '', contacto: '', telefono: '', email: '' })
      setProveedores(await api.obtener<Proveedor[]>('/api/proveedores?todos=true'))
      setAviso('Proveedor agregado')
    } catch (err) {
      setErrorProveedor((err as ErrorApi).message)
    }
  }

  // --- Pantalla -------------------------------------------------------------

  if (error) return <ErrorCarga mensaje={error} reintentar={() => void cargar()} />

  const puedeGestionar = puede(PERMISOS.COMPRA_GESTIONAR)

  return (
    <div className="pantalla">
      <header className="pantalla__cabecera">
        <div>
          <h1 className="pantalla__titulo">Compras</h1>
          <p className="rotulo">
            {meta ? `${meta.total} compra${meta.total === 1 ? '' : 's'}` : 'Pedidos a proveedores'}
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
            {ESTADOS_COMPRA.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="boton boton--linea"
            onClick={() => setVerProveedores(true)}
          >
            Proveedores ({proveedores.filter((p) => p.activo).length})
          </button>

          {puede(PERMISOS.COMPRA_GESTIONAR) && (
            <button type="button" className="boton boton--vino" onClick={abrirAlta}>
              Nueva compra
            </button>
          )}
        </div>
      </header>

      {aviso && <p className="aviso aviso--bien">{aviso}</p>}

      {filas === null ? (
        <Cargando texto="Buscando compras" />
      ) : filas.length === 0 ? (
        <Vacio
          titulo="No hay compras"
          detalle={
            estado
              ? `Ninguna compra está ${estado}.`
              : 'Cuando se registre una compra a proveedor, aparece acá.'
          }
        />
      ) : (
        <div className="tabla-envoltorio">
          <table className="tabla tabla--oscura tabla--clicable">
            <thead>
              <tr>
                <th>Número</th>
                <th>Proveedor</th>
                <th>Almacén</th>
                <th>Fecha</th>
                <th className="tabla__num">Artículos</th>
                <th className="tabla__num">Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => (
                <tr key={c.id} onClick={() => void abrirDetalle(c.id)}>
                  <td className="cifra">{c.numero}</td>
                  <td>{c.proveedor}</td>
                  <td>
                    {c.almacen}
                    <span className="tabla__sub">{c.sucursal}</span>
                  </td>
                  <td className="cifra">{fecha(c.fecha)}</td>
                  <td className="cifra tabla__num">
                    {numero(c.unidades)}
                    <span className="tabla__sub">
                      {c.articulos} línea{c.articulos === 1 ? '' : 's'}
                    </span>
                  </td>
                  <td className="cifra tabla__num">{bs(c.total)}</td>
                  <td>
                    <span className={clases('marca', MARCA[c.estado])}>{c.estado}</span>
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
                <p className="modal__sub cifra">
                  {detalle.proveedor} · {fecha(detalle.fecha)} · {detalle.almacen}
                </p>
              </div>
              <button type="button" className="modal__cerrar" onClick={() => setDetalle(null)}>
                ✕
              </button>
            </header>

            <div className="tabla-envoltorio">
              <table className="tabla tabla--oscura tabla--compacta">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Artículo</th>
                    <th className="tabla__num">Cantidad</th>
                    <th className="tabla__num">Costo</th>
                    <th className="tabla__num">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.items.map((i) => (
                    <tr key={i.variante_id}>
                      <td className="cifra">{i.sku}</td>
                      <td>{i.descripcion}</td>
                      <td className="cifra tabla__num">{numero(i.cantidad)}</td>
                      <td className="cifra tabla__num">{bs(i.costo_unitario)}</td>
                      <td className="cifra tabla__num">{bs(i.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="modal__contexto">
              Subtotal {bs(detalle.subtotal)} · Descuento {bs(detalle.descuento)} ·{' '}
              <strong>Total {bs(detalle.total)}</strong>
            </p>

            {puedeGestionar && (
              <div className="modal__acciones">
                {detalle.estado === 'borrador' && (
                  <>
                    <button
                      type="button"
                      className="boton boton--fantasma"
                      onClick={() => void anular(detalle)}
                      disabled={trabajando}
                    >
                      Anular
                    </button>
                    <button
                      type="button"
                      className="boton boton--vino"
                      onClick={() => void confirmar(detalle)}
                      disabled={trabajando}
                    >
                      Confirmar
                    </button>
                  </>
                )}

                {detalle.estado === 'confirmada' && (
                  <button
                    type="button"
                    className="boton boton--vino"
                    onClick={() => abrirRecepcion(detalle)}
                  >
                    Recibir mercadería
                  </button>
                )}

                {detalle.estado === 'recibida' && (
                  <p className="rotulo">Ya entró al stock. No hay nada más que hacer.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- Recepcion --- */}
      {recibiendo && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal__caja modal__caja--ancha">
            <header className="modal__cabecera">
              <div>
                <h2 className="modal__titulo">Recibir {recibiendo.numero}</h2>
                <p className="modal__sub">{recibiendo.proveedor}</p>
              </div>
              <button type="button" className="modal__cerrar" onClick={() => setRecibiendo(null)}>
                ✕
              </button>
            </header>

            <p className="modal__contexto">
              Contá lo que llegó de verdad. Es normal que vengan menos de las pedidas; darlas por
              recibidas mete unidades fantasma en el stock que después nadie encuentra.
            </p>

            <div className="tabla-envoltorio">
              <table className="tabla tabla--oscura tabla--compacta">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th className="tabla__num">Pedido</th>
                    <th className="tabla__num">Llegó</th>
                  </tr>
                </thead>
                <tbody>
                  {recibiendo.items.map((i) => {
                    const cuantas = Number(contado[i.variante_id] ?? 0)
                    return (
                      <tr key={i.variante_id}>
                        <td>
                          {i.descripcion}
                          <span className="tabla__sub cifra">{i.sku}</span>
                        </td>
                        <td className="cifra tabla__num">{numero(i.cantidad)}</td>
                        <td className="tabla__num">
                          <input
                            className="campo__control campo__control--corto"
                            type="number"
                            min="0"
                            max={i.cantidad}
                            value={contado[i.variante_id] ?? ''}
                            onChange={(e) =>
                              setContado((c) => ({ ...c, [i.variante_id]: e.target.value }))
                            }
                          />
                          {cuantas !== i.cantidad && (
                            <span className="tabla__sub">
                              {cuantas < i.cantidad
                                ? `faltan ${i.cantidad - cuantas}`
                                : 'de más'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

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
                disabled={trabajando}
              >
                {trabajando ? 'Recibiendo' : 'Confirmar recepción'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Nueva compra --- */}
      {alta && (
        <div className="modal" role="dialog" aria-modal="true">
          <form className="modal__caja modal__caja--ancha" onSubmit={(e) => void guardarCompra(e)}>
            <header className="modal__cabecera">
              <h2 className="modal__titulo">Nueva compra</h2>
              <button type="button" className="modal__cerrar" onClick={() => setAlta(false)}>
                ✕
              </button>
            </header>

            <div className="modal__campos">
              <label className="campo">
                <span className="campo__etiqueta">Proveedor</span>
                <select
                  className="campo__control"
                  required
                  value={nueva.proveedor_id}
                  onChange={(e) => setNueva((n) => ({ ...n, proveedor_id: e.target.value }))}
                >
                  <option value="">Elegir</option>
                  {proveedores
                    .filter((p) => p.activo)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                </select>
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Entra a</span>
                <select
                  className="campo__control"
                  required
                  value={nueva.almacen_id}
                  onChange={(e) => setNueva((n) => ({ ...n, almacen_id: e.target.value }))}
                >
                  <option value="">Elegir almacén</option>
                  {almacenes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre} — {a.sucursal}
                    </option>
                  ))}
                </select>
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Descuento</span>
                <input
                  className="campo__control"
                  type="number"
                  min="0"
                  step="10"
                  value={nueva.descuento}
                  onChange={(e) => setNueva((n) => ({ ...n, descuento: e.target.value }))}
                />
              </label>
            </div>

            <label className="campo">
              <span className="campo__etiqueta">Agregar artículo</span>
              <input
                className="campo__control"
                placeholder="Buscar por SKU o nombre"
                value={buscado}
                onChange={(e) => setBuscado(e.target.value)}
              />
            </label>

            {buscado.trim().length >= 2 && (
              <ul className="compra__resultados">
                {catalogo
                  .filter((v) =>
                    `${v.sku} ${v.descripcion}`.toLowerCase().includes(buscado.trim().toLowerCase())
                  )
                  .slice(0, 8)
                  .map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        className="compra__resultado"
                        onClick={() => agregarLinea(v)}
                      >
                        <span className="cifra compra__sku">{v.sku}</span>
                        <span>{v.descripcion}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}

            {lineas.length > 0 && (
              <div className="tabla-envoltorio">
                <table className="tabla tabla--oscura tabla--compacta">
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th className="tabla__num">Cantidad</th>
                      <th className="tabla__num">Costo unitario</th>
                      <th className="tabla__num">Subtotal</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l) => (
                      <tr key={l.variante_id}>
                        <td>
                          {l.descripcion}
                          <span className="tabla__sub cifra">{l.sku}</span>
                        </td>
                        <td className="tabla__num">
                          <input
                            className="campo__control campo__control--corto"
                            type="number"
                            min="1"
                            value={l.cantidad}
                            onChange={(e) =>
                              setLineas((ls) =>
                                ls.map((x) =>
                                  x.variante_id === l.variante_id
                                    ? { ...x, cantidad: e.target.value }
                                    : x
                                )
                              )
                            }
                          />
                        </td>
                        <td className="tabla__num">
                          <input
                            className="campo__control campo__control--corto"
                            type="number"
                            min="0"
                            step="1"
                            value={l.costo_unitario}
                            onChange={(e) =>
                              setLineas((ls) =>
                                ls.map((x) =>
                                  x.variante_id === l.variante_id
                                    ? { ...x, costo_unitario: e.target.value }
                                    : x
                                )
                              )
                            }
                          />
                        </td>
                        <td className="cifra tabla__num">
                          {bs(Number(l.cantidad || 0) * Number(l.costo_unitario || 0))}
                        </td>
                        <td className="tabla__acciones">
                          <button
                            type="button"
                            className="boton boton--fantasma"
                            onClick={() =>
                              setLineas((ls) => ls.filter((x) => x.variante_id !== l.variante_id))
                            }
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="modal__contexto">
              <strong>
                Total{' '}
                {bs(
                  lineas.reduce(
                    (t, l) => t + Number(l.cantidad || 0) * Number(l.costo_unitario || 0),
                    0
                  ) - Number(nueva.descuento || 0)
                )}
              </strong>{' '}
              · Nace en borrador: no toca el stock hasta que se reciba.
            </p>

            {errorAlta && <p className="aviso aviso--error">{errorAlta}</p>}

            <div className="modal__acciones">
              <button type="button" className="boton boton--fantasma" onClick={() => setAlta(false)}>
                Cancelar
              </button>
              <button type="submit" className="boton boton--vino" disabled={trabajando}>
                {trabajando ? 'Creando' : 'Crear compra'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- Proveedores --- */}
      {verProveedores && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal__caja modal__caja--ancha">
            <header className="modal__cabecera">
              <h2 className="modal__titulo">Proveedores</h2>
              <button
                type="button"
                className="modal__cerrar"
                onClick={() => {
                  setVerProveedores(false)
                  setAltaProveedor(false)
                }}
              >
                ✕
              </button>
            </header>

            {altaProveedor ? (
              <form onSubmit={(e) => void crearProveedor(e)}>
                <div className="modal__campos">
                  <label className="campo">
                    <span className="campo__etiqueta">Nombre</span>
                    <input
                      className="campo__control"
                      required
                      value={proveedor.nombre}
                      onChange={(e) => setProveedor((p) => ({ ...p, nombre: e.target.value }))}
                    />
                  </label>
                  <label className="campo">
                    <span className="campo__etiqueta">NIT</span>
                    <input
                      className="campo__control"
                      value={proveedor.nit}
                      onChange={(e) => setProveedor((p) => ({ ...p, nit: e.target.value }))}
                    />
                  </label>
                  <label className="campo">
                    <span className="campo__etiqueta">Contacto</span>
                    <input
                      className="campo__control"
                      value={proveedor.contacto}
                      onChange={(e) => setProveedor((p) => ({ ...p, contacto: e.target.value }))}
                    />
                  </label>
                  <label className="campo">
                    <span className="campo__etiqueta">Teléfono</span>
                    <input
                      className="campo__control"
                      value={proveedor.telefono}
                      onChange={(e) => setProveedor((p) => ({ ...p, telefono: e.target.value }))}
                    />
                  </label>
                  <label className="campo">
                    <span className="campo__etiqueta">Correo</span>
                    <input
                      className="campo__control"
                      type="email"
                      value={proveedor.email}
                      onChange={(e) => setProveedor((p) => ({ ...p, email: e.target.value }))}
                    />
                  </label>
                </div>

                {errorProveedor && <p className="aviso aviso--error">{errorProveedor}</p>}

                <div className="modal__acciones">
                  <button
                    type="button"
                    className="boton boton--fantasma"
                    onClick={() => setAltaProveedor(false)}
                  >
                    Volver
                  </button>
                  <button type="submit" className="boton boton--vino">
                    Agregar
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="tabla-envoltorio">
                  <table className="tabla tabla--oscura tabla--compacta">
                    <thead>
                      <tr>
                        <th>Proveedor</th>
                        <th>NIT</th>
                        <th>Contacto</th>
                        <th>Teléfono</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proveedores.map((p) => (
                        <tr key={p.id} className={clases(!p.activo && 'fila--baja')}>
                          <td>{p.nombre}</td>
                          <td className="cifra">{p.nit ?? '—'}</td>
                          <td>{p.contacto ?? '—'}</td>
                          <td className="cifra">{p.telefono ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {puedeGestionar && (
                  <div className="modal__acciones">
                    <button
                      type="button"
                      className="boton boton--vino"
                      onClick={() => setAltaProveedor(true)}
                    >
                      Agregar proveedor
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
