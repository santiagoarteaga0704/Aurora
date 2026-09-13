import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCarrito } from './CarritoContexto'
import { useSesion } from '../sesion/SesionContexto'
import { Cargando, Vacio } from '../componentes/Estados'
import { bs, clases } from '../util/formato'

/**
 * La bolsa.
 *
 * Dos detalles que importan mas de lo que parecen: el subtotal se recalcula
 * contra el servidor en cada cambio (el precio pudo haberse movido desde que se
 * agrego la prenda), y un articulo que se quedo sin stock se marca en la propia
 * linea en vez de reventar recien en el checkout.
 */
export function Carrito() {
  const { carrito, cargando, cambiar, quitar, vaciar } = useCarrito()
  const { perfil } = useSesion()
  const navegar = useNavigate()
  const [ocupado, setOcupado] = useState<number | null>(null)

  if (cargando && !carrito) {
    return (
      <div className="contenedor-angosto seccion">
        <Cargando texto="Abriendo la bolsa" />
      </div>
    )
  }

  if (!carrito || carrito.items.length === 0) {
    return (
      <div className="contenedor-angosto seccion">
        <Vacio
          titulo="Tu bolsa esta vacia"
          detalle="Cuando encuentres algo que te guste, va a aparecer aca."
          accion={
            <Link to="/catalogo" className="boton">
              Ver el catalogo
            </Link>
          }
        />
      </div>
    )
  }

  const hayProblemas = carrito.items.some((i) => i.sin_stock)

  return (
    <div className="contenedor bolsa surge">
      <header className="bolsa__cabecera">
        <h1>Tu bolsa</h1>
        <button type="button" className="boton boton--fantasma" onClick={() => void vaciar()}>
          Vaciar
        </button>
      </header>

      {carrito.modalidad === 'mayoreo' && (
        <p className="aviso aviso--bien">
          Estas viendo precios de mayoreo. Las escalas por cantidad se aplican solas segun cuanto
          lleves de cada articulo.
        </p>
      )}

      <div className="bolsa__reja">
        <ul className="bolsa__lista">
          {carrito.items.map((item) => (
            <li
              key={item.variante_id}
              className={clases('linea-bolsa', item.sin_stock && 'linea-bolsa--problema')}
            >
              <Link to={`/producto/${item.slug}`} className="linea-bolsa__visual">
                {item.imagen ? (
                  <img src={item.imagen} alt={item.producto} />
                ) : (
                  <span className="display" aria-hidden>
                    {item.producto.charAt(0)}
                  </span>
                )}
              </Link>

              <div className="linea-bolsa__datos">
                <Link to={`/producto/${item.slug}`} className="linea-bolsa__nombre">
                  {item.producto}
                </Link>
                <p className="linea-bolsa__variante">
                  {item.talla} · {item.color}
                </p>
                <p className="linea-bolsa__sku cifra">{item.sku}</p>

                {item.sin_stock && (
                  <p className="linea-bolsa__alerta">
                    Quedan {item.disponible}. Ajusta la cantidad para poder continuar.
                  </p>
                )}
              </div>

              <div className="linea-bolsa__cantidad">
                <button
                  type="button"
                  aria-label="Quitar una unidad"
                  disabled={ocupado === item.variante_id}
                  onClick={async () => {
                    setOcupado(item.variante_id)
                    try {
                      await cambiar(item.variante_id, item.cantidad - 1)
                    } finally {
                      setOcupado(null)
                    }
                  }}
                >
                  −
                </button>
                <span className="cifra">{item.cantidad}</span>
                <button
                  type="button"
                  aria-label="Agregar una unidad"
                  disabled={ocupado === item.variante_id || item.cantidad >= item.disponible}
                  onClick={async () => {
                    setOcupado(item.variante_id)
                    try {
                      await cambiar(item.variante_id, item.cantidad + 1)
                    } finally {
                      setOcupado(null)
                    }
                  }}
                >
                  +
                </button>
              </div>

              <div className="linea-bolsa__importe">
                <p className="cifra">{bs(item.subtotal)}</p>
                <p className="linea-bolsa__unitario cifra">{bs(item.precio_unitario)} c/u</p>
                <button
                  type="button"
                  className="boton boton--fantasma"
                  onClick={() => void quitar(item.variante_id)}
                >
                  Quitar
                </button>
              </div>
            </li>
          ))}
        </ul>

        <aside className="resumen">
          <p className="rotulo">Resumen</p>

          <div className="resumen__linea">
            <span>Articulos</span>
            <span className="cifra">{carrito.unidades}</span>
          </div>
          <div className="resumen__linea">
            <span>Subtotal</span>
            <span className="cifra">{bs(carrito.subtotal)}</span>
          </div>
          <div className="resumen__linea resumen__linea--nota">
            <span>Envio</span>
            <span>Se calcula al elegir la entrega</span>
          </div>

          <div className="resumen__total">
            <span>Total</span>
            <span className="cifra">{bs(carrito.subtotal)}</span>
          </div>

          {hayProblemas && (
            <p className="aviso aviso--error">
              Hay articulos sin stock suficiente. Ajusta las cantidades para continuar.
            </p>
          )}

          <button
            type="button"
            className="boton boton--vino boton--grande boton--ancho"
            disabled={hayProblemas}
            onClick={() => navegar(perfil ? '/checkout' : '/entrar?volver=/checkout')}
          >
            {perfil ? 'Continuar' : 'Ingresar y continuar'}
          </button>

          <Link to="/catalogo" className="resumen__seguir">
            Seguir mirando
          </Link>
        </aside>
      </div>
    </div>
  )
}
