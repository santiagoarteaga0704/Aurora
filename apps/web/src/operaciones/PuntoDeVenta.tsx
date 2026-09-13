import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Pedido } from '@aurora/contratos'
import { api, consulta, ErrorApi } from '../api/cliente'
import { useSesion } from '../sesion/SesionContexto'
import { useConexion } from '../offline/ConexionContexto'
import { encolar, guardarEnCache, leerDeCache } from '../offline/cola'
import { bs, clases, hace, numero } from '../util/formato'

/** Un articulo vendible, tal como lo necesita el mostrador. */
interface ArticuloVenta {
  variante_id: number
  sku: string
  producto: string
  talla: string
  color: string
  precio: number
  disponible: number
}

interface LineaTicket extends ArticuloVenta {
  cantidad: number
}

interface MetodoPago {
  id: number
  codigo: string
  nombre: string
  tipo: string
  disponible_offline: boolean
}

const CACHE_ARTICULOS = 'articulos-venta'
const CACHE_SUCURSALES = 'sucursales-venta'

/**
 * Punto de venta.
 *
 * Esta pantalla tiene que funcionar igual con y sin internet, porque una tienda
 * no puede dejar de vender cuando se cae la conexion. Como lo resuelve:
 *
 *  1. Con conexion, baja el catalogo vendible de la sucursal y lo guarda en
 *     IndexedDB. La busqueda por SKU o nombre corre siempre contra esa copia
 *     local, asi que es instantanea y no depende de la red.
 *  2. Al cobrar, si hay servidor la venta va directo; si no, se encola con su
 *     clave de idempotencia y se manda sola cuando la conexion vuelve.
 *  3. Sin conexion solo se ofrecen los metodos de pago que no necesitan
 *     confirmacion de un tercero. Un cobro con QR o tarjeta no se puede dar por
 *     bueno sin hablar con el banco, y prometerlo seria mentir.
 *
 * El stock que se muestra sin conexion es el ultimo conocido: se marca como tal
 * y el servidor tiene la ultima palabra al sincronizar.
 */
export function PuntoDeVenta() {
  const { perfil } = useSesion()
  const { enLinea, refrescarCola } = useConexion()

  /**
   * Desde que sucursal se vende.
   *
   * Un vendedor tiene la suya asignada y no la elige. Un administrador no esta
   * atado a ninguna, asi que la elige: si no, no podria vender en ningun lado,
   * que es justo lo contrario de lo que significa ser administrador.
   */
  const [sucursales, setSucursales] = useState<{ id: number; nombre: string }[]>([])
  const [sucursalActiva, setSucursalActiva] = useState<number | null>(perfil?.sucursal_id ?? null)

  useEffect(() => {
    if (perfil?.sucursal_id) {
      setSucursalActiva(perfil.sucursal_id)
      return
    }
    void (async () => {
      // Se cachea como el catalogo: sin esto, un administrador que abre el
      // mostrador sin conexion se queda sin ninguna sucursal donde vender.
      let lista: { id: number; nombre: string }[]
      try {
        lista = await api.obtener<{ id: number; nombre: string }[]>('/api/sucursales')
        await guardarEnCache(CACHE_SUCURSALES, lista)
      } catch {
        lista = (await leerDeCache<{ id: number; nombre: string }[]>(CACHE_SUCURSALES))?.datos ?? []
      }
      setSucursales(lista)
      setSucursalActiva((actual) => actual ?? lista[0]?.id ?? null)
    })()
  }, [perfil?.sucursal_id])

  const [articulos, setArticulos] = useState<ArticuloVenta[]>([])
  const [actualizadoEn, setActualizadoEn] = useState<number | null>(null)
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true)

  const [busqueda, setBusqueda] = useState('')
  const [ticket, setTicket] = useState<LineaTicket[]>([])
  const [metodos, setMetodos] = useState<MetodoPago[]>([])
  const [metodoId, setMetodoId] = useState<number | null>(null)

  const [cobrando, setCobrando] = useState(false)
  const [ultimaVenta, setUltimaVenta] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const campoBusqueda = useRef<HTMLInputElement>(null)

  /* --- Catalogo vendible ------------------------------------------------- */

  const bajarCatalogo = useCallback(async () => {
    if (!sucursalActiva) return
    try {
      const filas = await api.pagina<{
        variante_id: number
        sku: string
        producto: string
        talla: string
        color: string
        disponible: number
      }>(`/api/inventario${consulta({ sucursal_id: sucursalActiva, por_pagina: 100 })}`)

      // El inventario no trae el precio, asi que se completa con el catalogo.
      const precios = await api.pagina<{
        id: number
        nombre: string
        precio_desde: number
      }>(`/api/catalogo/productos${consulta({ por_pagina: 100 })}`)

      const porNombre = new Map(precios.datos.map((p) => [p.nombre, p.precio_desde]))

      const lista: ArticuloVenta[] = filas.datos.map((f) => ({
        variante_id: f.variante_id,
        sku: f.sku,
        producto: f.producto,
        talla: f.talla,
        color: f.color,
        precio: porNombre.get(f.producto) ?? 0,
        disponible: f.disponible,
      }))

      setArticulos(lista)
      setActualizadoEn(Date.now())
      await guardarEnCache(CACHE_ARTICULOS, lista)
    } catch {
      // Sin red se cae a la copia local; abajo se avisa de cuando es.
    }
  }, [sucursalActiva])

  useEffect(() => {
    void (async () => {
      setCargandoCatalogo(true)
      const guardado = await leerDeCache<ArticuloVenta[]>(CACHE_ARTICULOS)
      if (guardado) {
        setArticulos(guardado.datos)
        setActualizadoEn(guardado.guardado_en)
      }
      if (enLinea) await bajarCatalogo()
      setCargandoCatalogo(false)
      campoBusqueda.current?.focus()
    })()
    // Al recuperar la conexion conviene refrescar: el stock pudo haber cambiado.
  }, [enLinea, bajarCatalogo])

  useEffect(() => {
    void (async () => {
      try {
        const lista = await api.obtener<MetodoPago[]>('/api/pagos/metodos?canal=tienda')
        setMetodos(lista)
        await guardarEnCache('metodos-tienda', lista)
      } catch {
        const guardado = await leerDeCache<MetodoPago[]>('metodos-tienda')
        if (guardado) setMetodos(guardado.datos)
      }
    })()
  }, [])

  /** Sin conexion, solo lo que no necesita confirmar con un tercero. */
  const metodosUsables = useMemo(
    () => (enLinea ? metodos : metodos.filter((m) => m.disponible_offline)),
    [metodos, enLinea]
  )

  useEffect(() => {
    if (metodosUsables.length > 0 && !metodosUsables.some((m) => m.id === metodoId)) {
      setMetodoId(metodosUsables[0].id)
    }
  }, [metodosUsables, metodoId])

  /* --- Busqueda ----------------------------------------------------------- */

  const resultados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (texto === '') return articulos.slice(0, 24)
    return articulos
      .filter(
        (a) =>
          a.sku.toLowerCase().includes(texto) ||
          a.producto.toLowerCase().includes(texto) ||
          `${a.talla} ${a.color}`.toLowerCase().includes(texto)
      )
      .slice(0, 24)
  }, [articulos, busqueda])

  /* --- Ticket ------------------------------------------------------------- */

  const agregar = useCallback((a: ArticuloVenta) => {
    setError(null)
    setUltimaVenta(null)
    setTicket((actual) => {
      const linea = actual.find((l) => l.variante_id === a.variante_id)
      if (linea) {
        if (linea.cantidad >= a.disponible) return actual
        return actual.map((l) =>
          l.variante_id === a.variante_id ? { ...l, cantidad: l.cantidad + 1 } : l
        )
      }
      return [...actual, { ...a, cantidad: 1 }]
    })
    setBusqueda('')
    campoBusqueda.current?.focus()
  }, [])

  const cambiarCantidad = (varianteId: number, delta: number) => {
    setTicket((actual) =>
      actual
        .map((l) =>
          l.variante_id === varianteId
            ? { ...l, cantidad: Math.min(Math.max(l.cantidad + delta, 0), l.disponible) }
            : l
        )
        .filter((l) => l.cantidad > 0)
    )
  }

  const total = useMemo(
    () => ticket.reduce((s, l) => s + l.precio * l.cantidad, 0),
    [ticket]
  )

  /* --- Cobro -------------------------------------------------------------- */

  const cobrar = async () => {
    if (ticket.length === 0 || !metodoId || sucursalActiva === null) return

    setError(null)
    setCobrando(true)

    // La clave se genera ANTES de saber si hay red. Si se generara al enviar, un
    // reintento despues de una respuesta perdida crearia una clave nueva y la
    // venta se cobraria dos veces.
    const clave = crypto.randomUUID()

    const cuerpo = {
      canal: 'tienda' as const,
      tipo_entrega: 'inmediata' as const,
      sucursal_id: sucursalActiva,
      items: ticket.map((l) => ({ variante_id: l.variante_id, cantidad: l.cantidad })),
      pago: { metodo_pago_id: metodoId, monto: total },
      creado_offline: !enLinea,
      creado_en_cliente: new Date().toISOString(),
    }

    const resumen = `${ticket.reduce((s, l) => s + l.cantidad, 0)} articulo(s) · ${bs(total)}`

    if (!enLinea) {
      await encolar({
        ruta: '/api/pedidos',
        entidad: 'pedido',
        cuerpo,
        idempotencia: clave,
        resumen,
        monto: total,
      })
      await refrescarCola()
      setTicket([])
      setUltimaVenta('Venta guardada. Se enviara al volver la conexion.')
      setCobrando(false)
      campoBusqueda.current?.focus()
      return
    }

    try {
      const pedido = await api.enviar<Pedido>('/api/pedidos', cuerpo, { idempotencia: clave })
      setTicket([])
      setUltimaVenta(`Venta ${pedido.numero} cobrada.`)
      void bajarCatalogo()
    } catch (e) {
      const fallo = e as ErrorApi

      // Si se corto la red justo al cobrar, la venta no se pierde: se encola con
      // la MISMA clave, asi que si el servidor alcanzo a registrarla, el reenvio
      // devuelve la que ya existe en vez de duplicarla.
      if (fallo.esDeRed) {
        await encolar({
        ruta: '/api/pedidos',
        entidad: 'pedido',
        cuerpo,
        idempotencia: clave,
        resumen,
        monto: total,
      })
        await refrescarCola()
        setTicket([])
        setUltimaVenta('Se corto la conexion; la venta quedo guardada para enviar.')
      } else {
        setError(fallo.message)
      }
    } finally {
      setCobrando(false)
      campoBusqueda.current?.focus()
    }
  }

  if (sucursalActiva === null) {
    return (
      <div className="pantalla">
        <p className="aviso aviso--ojo">
          {sucursales.length === 0
            ? 'No hay sucursales disponibles para vender. Revisa la configuracion.'
            : 'Elegi desde que sucursal vas a vender.'}
        </p>
      </div>
    )
  }

  return (
    <div className="pos">
      <section className="pos__buscador">
        <header className="pos__cabecera">
          <div>
            <h1 className="pos__titulo">Punto de venta</h1>
            {perfil?.sucursal_id ? (
              <p className="pos__sucursal rotulo">{perfil.sucursal}</p>
            ) : (
              <label className="pos__elegir-sucursal">
                <span className="solo-lectores">Sucursal desde la que se vende</span>
                <select
                  className="campo__control"
                  value={sucursalActiva ?? ''}
                  onChange={(e) => setSucursalActiva(Number(e.target.value))}
                >
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="pos__estado-catalogo">
            {cargandoCatalogo ? (
              <span className="rotulo">Cargando catalogo</span>
            ) : actualizadoEn ? (
              <span className={clases('rotulo', !enLinea && 'pos__stock-viejo')}>
                Stock {hace(actualizadoEn)}
              </span>
            ) : (
              <span className="rotulo pos__stock-viejo">Sin catalogo local</span>
            )}
            <button
              type="button"
              className="boton boton--fantasma"
              onClick={() => void bajarCatalogo()}
              disabled={!enLinea}
            >
              Actualizar
            </button>
          </div>
        </header>

        <input
          ref={campoBusqueda}
          className="pos__campo cifra"
          placeholder="SKU, nombre o talla"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => {
            // Enter agrega el primer resultado: es como se trabaja con un lector
            // de codigo de barras, que escribe el SKU y manda un Enter.
            if (e.key === 'Enter' && resultados.length > 0) {
              e.preventDefault()
              agregar(resultados[0])
            }
          }}
          aria-label="Buscar articulo"
        />

        <div className="pos__resultados">
          {resultados.length === 0 ? (
            <p className="pos__vacio">
              {articulos.length === 0
                ? 'No hay catalogo descargado. Conectate una vez para bajarlo.'
                : 'Ningun articulo coincide.'}
            </p>
          ) : (
            resultados.map((a) => (
              <button
                key={a.variante_id}
                type="button"
                className={clases('pos__articulo', a.disponible === 0 && 'pos__articulo--agotado')}
                onClick={() => agregar(a)}
                disabled={a.disponible === 0}
              >
                <span className="pos__articulo-sku cifra">{a.sku}</span>
                <span className="pos__articulo-nombre">{a.producto}</span>
                <span className="pos__articulo-variante">
                  {a.talla} · {a.color}
                </span>
                <span className="pos__articulo-stock cifra">{numero(a.disponible)}</span>
                <span className="pos__articulo-precio cifra">{bs(a.precio)}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <aside className="pos__ticket">
        <p className="rotulo">Venta en curso</p>

        {ticket.length === 0 ? (
          <div className="pos__ticket-vacio">
            <p>Escanea o busca un articulo para empezar.</p>
          </div>
        ) : (
          <ul className="pos__lineas">
            {ticket.map((l) => (
              <li key={l.variante_id}>
                <div className="pos__linea-datos">
                  <span className="pos__linea-nombre">{l.producto}</span>
                  <span className="pos__linea-variante cifra">
                    {l.talla} · {l.color} · {l.sku}
                  </span>
                </div>
                <div className="pos__linea-cantidad">
                  <button type="button" onClick={() => cambiarCantidad(l.variante_id, -1)} aria-label="Menos">
                    −
                  </button>
                  <span className="cifra">{l.cantidad}</span>
                  <button
                    type="button"
                    onClick={() => cambiarCantidad(l.variante_id, 1)}
                    disabled={l.cantidad >= l.disponible}
                    aria-label="Mas"
                  >
                    +
                  </button>
                </div>
                <span className="pos__linea-importe cifra">{bs(l.precio * l.cantidad)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="pos__cobro">
          <div className="pos__total">
            <span className="rotulo">Total</span>
            <span className="cifra pos__total-cifra">{bs(total)}</span>
          </div>

          <div className="pos__metodos">
            {metodosUsables.map((m) => (
              <button
                key={m.id}
                type="button"
                className={clases('pos__metodo', metodoId === m.id && 'pos__metodo--activo')}
                onClick={() => setMetodoId(m.id)}
              >
                {m.nombre}
              </button>
            ))}
          </div>

          {!enLinea && (
            <p className="pos__nota-offline">
              Sin conexion solo se puede cobrar en efectivo o contra entrega: un cobro con tarjeta o
              QR necesita confirmacion del banco.
            </p>
          )}

          {error && <p className="aviso aviso--error">{error}</p>}
          {ultimaVenta && <p className="aviso aviso--bien">{ultimaVenta}</p>}

          <button
            type="button"
            className="boton boton--vino boton--grande boton--ancho"
            disabled={ticket.length === 0 || cobrando || metodoId === null}
            onClick={() => void cobrar()}
          >
            {cobrando ? 'Registrando...' : enLinea ? `Cobrar ${bs(total)}` : `Guardar venta ${bs(total)}`}
          </button>

          {ticket.length > 0 && (
            <button type="button" className="boton boton--fantasma" onClick={() => setTicket([])}>
              Cancelar venta
            </button>
          )}
        </div>
      </aside>
    </div>
  )
}
