import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Direccion, Pedido, TipoEntrega } from '@aurora/contratos'
import { api, ErrorApi } from '../api/cliente'
import { useCarrito } from './CarritoContexto'
import { Cargando, Vacio } from '../componentes/Estados'
import { bs, clases } from '../util/formato'

interface Sucursal {
  id: number
  nombre: string
  direccion: string
  ciudad: string
  departamento: string
  horario: string | null
}

interface Ciudad {
  id: number
  nombre: string
  departamento: string
}

const COSTO_ENVIO = 25

/**
 * Checkout.
 *
 * El cupon se manda como codigo y el descuento lo calcula el servidor; por eso
 * el total definitivo aparece recien cuando el pedido esta creado. Mostrar antes
 * un total estimado en el navegador seria prometer un precio que el servidor
 * podria no confirmar.
 */
export function Checkout() {
  const { carrito, recargar } = useCarrito()
  const navegar = useNavigate()

  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [ciudades, setCiudades] = useState<Ciudad[]>([])
  const [direcciones, setDirecciones] = useState<Direccion[]>([])

  const [entrega, setEntrega] = useState<TipoEntrega>('recojo_tienda')
  const [sucursalId, setSucursalId] = useState<number | null>(null)
  const [direccionId, setDireccionId] = useState<number | null>(null)
  const [cupon, setCupon] = useState('')
  const [nota, setNota] = useState('')

  const [nuevaDireccion, setNuevaDireccion] = useState(false)
  const [formDireccion, setFormDireccion] = useState({
    alias: 'Casa',
    ciudad_id: '',
    direccion: '',
    referencia: '',
    telefono: '',
  })

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})

  useEffect(() => {
    void (async () => {
      const [s, c, d] = await Promise.all([
        api.obtener<Sucursal[]>('/api/sucursales').catch(() => []),
        api.obtener<Ciudad[]>('/api/ciudades').catch(() => []),
        api.obtener<Direccion[]>('/api/clientes/mis-direcciones').catch(() => []),
      ])
      setSucursales(s)
      setCiudades(c)
      setDirecciones(d)
      if (s.length > 0) setSucursalId(s[0].id)
      const principal = d.find((x) => x.es_principal) ?? d[0]
      if (principal) setDireccionId(principal.id)
      if (d.length === 0) setNuevaDireccion(true)
    })()
  }, [])

  if (!carrito) return <div className="contenedor-angosto seccion"><Cargando /></div>

  if (carrito.items.length === 0) {
    return (
      <div className="contenedor-angosto seccion">
        <Vacio
          titulo="No hay nada que comprar"
          detalle="Tu bolsa esta vacia."
          accion={<Link to="/catalogo" className="boton">Ver el catalogo</Link>}
        />
      </div>
    )
  }

  const guardarDireccion = async () => {
    const creadas = await api.enviar<Direccion[]>('/api/clientes/mis-direcciones', {
      alias: formDireccion.alias,
      ciudad_id: Number(formDireccion.ciudad_id),
      direccion: formDireccion.direccion,
      referencia: formDireccion.referencia || undefined,
      telefono: formDireccion.telefono || undefined,
      es_principal: direcciones.length === 0,
    })
    setDirecciones(creadas)
    const recien = creadas.find((d) => d.direccion === formDireccion.direccion) ?? creadas[0]
    setDireccionId(recien.id)
    setNuevaDireccion(false)
    return recien.id
  }

  const confirmar = async () => {
    setError(null)
    setErrores({})
    setEnviando(true)

    try {
      let destino = direccionId

      if (entrega === 'domicilio' && (nuevaDireccion || destino === null)) {
        destino = await guardarDireccion()
      }

      // La sucursal manda igual en un envio a domicilio: es de donde sale la
      // mercaderia y contra que almacen se descuenta el stock.
      const pedido = await api.enviar<Pedido>('/api/pedidos', {
        sucursal_id: sucursalId,
        tipo_entrega: entrega,
        direccion_id: entrega === 'domicilio' ? destino : undefined,
        costo_envio: entrega === 'domicilio' ? COSTO_ENVIO : 0,
        cupon: cupon.trim() || undefined,
        nota: nota.trim() || undefined,
      })

      await recargar()
      navegar(`/pedido/${pedido.id}`, { replace: true })
    } catch (e) {
      const err = e as ErrorApi
      setError(err.message)
      if (err.errores) setErrores(err.errores)
    } finally {
      setEnviando(false)
    }
  }

  const totalEstimado = carrito.subtotal + (entrega === 'domicilio' ? COSTO_ENVIO : 0)

  return (
    <div className="contenedor checkout surge">
      <h1>Finalizar compra</h1>

      <div className="checkout__reja">
        <div className="checkout__pasos">
          <section className="bloque">
            <p className="rotulo">Como lo recibis</p>

            <div className="opciones-entrega">
              <button
                type="button"
                className={clases('opcion-entrega', entrega === 'recojo_tienda' && 'opcion-entrega--activa')}
                onClick={() => setEntrega('recojo_tienda')}
              >
                <span className="opcion-entrega__titulo">Retiro en tienda</span>
                <span className="opcion-entrega__nota">Sin costo</span>
              </button>
              <button
                type="button"
                className={clases('opcion-entrega', entrega === 'domicilio' && 'opcion-entrega--activa')}
                onClick={() => setEntrega('domicilio')}
              >
                <span className="opcion-entrega__titulo">Envio a domicilio</span>
                <span className="opcion-entrega__nota cifra">{bs(COSTO_ENVIO)}</span>
              </button>
            </div>
          </section>

          <section className="bloque">
            <p className="rotulo">
              {entrega === 'domicilio' ? 'Sucursal que despacha' : 'Donde retiras'}
            </p>
            <div className="lista-sucursales">
              {sucursales.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={clases('sucursal', sucursalId === s.id && 'sucursal--activa')}
                  onClick={() => setSucursalId(s.id)}
                >
                  <span className="sucursal__nombre">{s.nombre}</span>
                  <span className="sucursal__direccion">{s.direccion}</span>
                  <span className="sucursal__ciudad rotulo">
                    {s.ciudad}, {s.departamento}
                  </span>
                  {s.horario && <span className="sucursal__horario">{s.horario}</span>}
                </button>
              ))}
            </div>
            {errores.sucursal_id && <p className="campo__error">{errores.sucursal_id}</p>}
          </section>

          {entrega === 'domicilio' && (
            <section className="bloque">
              <p className="rotulo">Direccion de entrega</p>

              {direcciones.length > 0 && !nuevaDireccion && (
                <>
                  <div className="lista-sucursales">
                    {direcciones.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className={clases('sucursal', direccionId === d.id && 'sucursal--activa')}
                        onClick={() => setDireccionId(d.id)}
                      >
                        <span className="sucursal__nombre">{d.alias}</span>
                        <span className="sucursal__direccion">{d.direccion}</span>
                        <span className="sucursal__ciudad rotulo">
                          {d.ciudad}, {d.departamento}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="boton boton--fantasma"
                    onClick={() => setNuevaDireccion(true)}
                  >
                    Usar otra direccion
                  </button>
                </>
              )}

              {nuevaDireccion && (
                <div className="formulario">
                  <label className="campo">
                    <span className="campo__etiqueta">Nombre de la direccion</span>
                    <input
                      className="campo__control"
                      value={formDireccion.alias}
                      onChange={(e) => setFormDireccion({ ...formDireccion, alias: e.target.value })}
                      placeholder="Casa, oficina..."
                    />
                  </label>

                  <label className={clases('campo', errores.ciudad_id && 'campo--malo')}>
                    <span className="campo__etiqueta">Ciudad</span>
                    <select
                      className="campo__control"
                      value={formDireccion.ciudad_id}
                      onChange={(e) =>
                        setFormDireccion({ ...formDireccion, ciudad_id: e.target.value })
                      }
                    >
                      <option value="">Elegi tu ciudad</option>
                      {ciudades.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} — {c.departamento}
                        </option>
                      ))}
                    </select>
                    {errores.ciudad_id && <span className="campo__error">{errores.ciudad_id}</span>}
                  </label>

                  <label className={clases('campo', errores.direccion && 'campo--malo')}>
                    <span className="campo__etiqueta">Direccion</span>
                    <input
                      className="campo__control"
                      value={formDireccion.direccion}
                      onChange={(e) =>
                        setFormDireccion({ ...formDireccion, direccion: e.target.value })
                      }
                      placeholder="Calle, numero, edificio, departamento"
                    />
                    {errores.direccion && <span className="campo__error">{errores.direccion}</span>}
                  </label>

                  <label className="campo">
                    <span className="campo__etiqueta">Referencia</span>
                    <input
                      className="campo__control"
                      value={formDireccion.referencia}
                      onChange={(e) =>
                        setFormDireccion({ ...formDireccion, referencia: e.target.value })
                      }
                      placeholder="Entre que calles, color de la puerta..."
                    />
                  </label>

                  <label className="campo">
                    <span className="campo__etiqueta">Telefono de contacto</span>
                    <input
                      className="campo__control"
                      value={formDireccion.telefono}
                      onChange={(e) =>
                        setFormDireccion({ ...formDireccion, telefono: e.target.value })
                      }
                      placeholder="+591 7..."
                    />
                  </label>

                  {direcciones.length > 0 && (
                    <button
                      type="button"
                      className="boton boton--fantasma"
                      onClick={() => setNuevaDireccion(false)}
                    >
                      Usar una direccion guardada
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          <section className="bloque">
            <p className="rotulo">Cupon y nota</p>
            <div className="formulario">
              <label className={clases('campo', errores.cupon && 'campo--malo')}>
                <span className="campo__etiqueta">Codigo de cupon</span>
                <input
                  className="campo__control cifra"
                  value={cupon}
                  onChange={(e) => setCupon(e.target.value.toUpperCase())}
                  placeholder="Si tenes uno"
                />
                {errores.cupon && <span className="campo__error">{errores.cupon}</span>}
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Nota para la tienda</span>
                <textarea
                  className="campo__control"
                  rows={2}
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Algo que debamos saber"
                />
              </label>
            </div>
          </section>
        </div>

        <aside className="resumen">
          <p className="rotulo">Tu pedido</p>

          <ul className="resumen__items">
            {carrito.items.map((i) => (
              <li key={i.variante_id}>
                <span>
                  <span className="cifra">{i.cantidad}×</span> {i.producto}
                  <span className="resumen__variante">
                    {i.talla} · {i.color}
                  </span>
                </span>
                <span className="cifra">{bs(i.subtotal)}</span>
              </li>
            ))}
          </ul>

          <div className="resumen__linea">
            <span>Subtotal</span>
            <span className="cifra">{bs(carrito.subtotal)}</span>
          </div>
          {entrega === 'domicilio' && (
            <div className="resumen__linea">
              <span>Envio</span>
              <span className="cifra">{bs(COSTO_ENVIO)}</span>
            </div>
          )}
          {cupon.trim() && (
            <div className="resumen__linea resumen__linea--nota">
              <span>Cupon {cupon}</span>
              <span>Se aplica al confirmar</span>
            </div>
          )}

          <div className="resumen__total">
            <span>Total</span>
            <span className="cifra">{bs(totalEstimado)}</span>
          </div>

          {error && <p className="aviso aviso--error">{error}</p>}

          <button
            type="button"
            className="boton boton--vino boton--grande boton--ancho"
            disabled={enviando || sucursalId === null}
            onClick={() => void confirmar()}
          >
            {enviando ? 'Confirmando...' : 'Confirmar pedido'}
          </button>

          <p className="resumen__nota">
            El pago se registra en el paso siguiente. Todavia no se cobra nada.
          </p>
        </aside>
      </div>
    </div>
  )
}
