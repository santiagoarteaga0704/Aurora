import { Link } from 'react-router-dom'
import type { ProductoResumen } from '@aurora/contratos'
import { bs } from '../util/formato'

/**
 * Tarjeta de producto de la grilla.
 *
 * Todavia no hay fotos cargadas, y en vez de poner un icono de imagen rota se
 * compone una placa tipografica con la inicial de la prenda. Resuelve el hueco
 * de datos sin romper el tono editorial, y cuando lleguen las fotos la tarjeta
 * no cambia de forma.
 */
export function TarjetaProducto({ producto }: { producto: ProductoResumen }) {
  const rango =
    producto.precio_desde === producto.precio_hasta
      ? bs(producto.precio_desde)
      : `${bs(producto.precio_desde)} — ${bs(producto.precio_hasta)}`

  const agotado = producto.disponible === 0

  return (
    <Link to={`/producto/${producto.slug}`} className="tarjeta">
      <div className="tarjeta__lienzo">
        {producto.imagen ? (
          <img src={producto.imagen} alt={producto.nombre} loading="lazy" />
        ) : (
          <span className="tarjeta__inicial display" aria-hidden>
            {producto.nombre.charAt(0)}
          </span>
        )}

        {producto.destacado && <span className="tarjeta__cinta">Destacado</span>}
        {agotado && <span className="tarjeta__agotado">Sin stock</span>}
      </div>

      <div className="tarjeta__pie">
        <p className="tarjeta__marca rotulo">{producto.marca ?? producto.categoria}</p>
        <h3 className="tarjeta__nombre">{producto.nombre}</h3>
        <p className="tarjeta__precio cifra">{rango}</p>
      </div>
    </Link>
  )
}
