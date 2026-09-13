import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarraConexion } from '../componentes/BarraConexion'
import { useSesion } from '../sesion/SesionContexto'
import { useCarrito } from './CarritoContexto'
import { clases } from '../util/formato'

const SECCIONES = [
  { a: '/catalogo?categoria_id=2', texto: 'Vestidos' },
  { a: '/catalogo?categoria_id=3', texto: 'Blusas' },
  { a: '/catalogo?categoria_id=4', texto: 'Pantalones' },
  { a: '/catalogo?categoria_id=8', texto: 'Calzado' },
  { a: '/catalogo?categoria_id=11', texto: 'Accesorios' },
]

/**
 * Cromo de la tienda.
 *
 * La marca va en Bodoni con letras muy separadas, como el logotipo de una casa
 * de moda: es lo primero que se ve y lo que fija el tono de todo lo demas.
 */
export function LayoutTienda() {
  const { perfil, salir } = useSesion()
  const { unidades } = useCarrito()
  const navegar = useNavigate()
  const ubicacion = useLocation()
  const [menuAbierto, setMenuAbierto] = useState(false)

  // NavLink compara solo la ruta e ignora la query, y las cinco secciones
  // apuntan a /catalogo: usandolo, en el catalogo se encendian las cinco a la
  // vez. Se compara tambien la categoria.
  const categoriaActual = new URLSearchParams(ubicacion.search).get('categoria_id')
  const esSeccionActiva = (href: string) => {
    const [ruta, query] = href.split('?')
    if (ubicacion.pathname !== ruta) return false
    return new URLSearchParams(query).get('categoria_id') === categoriaActual
  }

  return (
    <div className="tienda">
      <BarraConexion />

      <header className="cabecera">
        <div className="contenedor cabecera__interior">
          <button
            type="button"
            className="cabecera__hamburguesa"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-expanded={menuAbierto}
            aria-label="Menu"
          >
            <span />
            <span />
          </button>

          <Link to="/" className="marca-aurora" aria-label="AURORA, inicio">
            AURORA
          </Link>

          <nav className={clases('cabecera__nav', menuAbierto && 'cabecera__nav--abierto')}>
            {SECCIONES.map((s) => (
              <Link
                key={s.a}
                to={s.a}
                className={clases('cabecera__enlace', esSeccionActiva(s.a) && 'active')}
                onClick={() => setMenuAbierto(false)}
              >
                {s.texto}
              </Link>
            ))}
          </nav>

          <div className="cabecera__acciones">
            {perfil ? (
              <div className="cabecera__cuenta">
                <Link to="/mis-pedidos" className="cabecera__enlace">
                  {perfil.nombre}
                </Link>
                <button
                  type="button"
                  className="boton boton--fantasma"
                  onClick={async () => {
                    await salir()
                    navegar('/')
                  }}
                >
                  Salir
                </button>
              </div>
            ) : (
              <Link to="/entrar" className="cabecera__enlace">
                Ingresar
              </Link>
            )}

            <Link to="/carrito" className="cabecera__carrito" aria-label={`Carrito, ${unidades} articulos`}>
              Bolsa
              {unidades > 0 && <span className="cabecera__contador cifra">{unidades}</span>}
            </Link>
          </div>
        </div>
      </header>

      <main className="tienda__cuerpo">
        <Outlet />
      </main>

      <footer className="pie">
        <div className="contenedor pie__interior">
          <div>
            <p className="marca-aurora marca-aurora--pie">AURORA</p>
            <p className="pie__nota">
              Ropa femenina con presencia en Santa Cruz, La Paz y Cochabamba.
            </p>
          </div>
          <div className="pie__columnas">
            <div>
              <p className="rotulo">Tienda</p>
              <Link to="/catalogo">Catalogo completo</Link>
              <Link to="/mis-pedidos">Mis pedidos</Link>
              <Link to="/mis-medidas">Mis medidas</Link>
            </div>
            <div>
              <p className="rotulo">Personal</p>
              <Link to="/op">Punto de venta</Link>
            </div>
          </div>
        </div>
        <div className="contenedor pie__legal">
          <span>Proyecto academico — SI2, UAGRM</span>
          <span className="cifra">BOB</span>
        </div>
      </footer>
    </div>
  )
}
