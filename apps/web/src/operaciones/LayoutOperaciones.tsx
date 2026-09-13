import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { PERMISOS } from '@aurora/contratos'
import { BarraConexion } from '../componentes/BarraConexion'
import { Campanita } from '../componentes/Campanita'
import { useSesion } from '../sesion/SesionContexto'
import { useConexion } from '../offline/ConexionContexto'
import { clases } from '../util/formato'

/**
 * Cromo del lado de operaciones.
 *
 * Fondo oscuro y densidad alta, al reves que la tienda. No es una preferencia
 * estetica: en el mostrador se trabaja ocho horas seguidas, bajo luz fuerte, y
 * mirando cifras. Aca la pantalla es un instrumento.
 *
 * El menu se arma con los permisos del usuario, no con su rol: un rol nuevo
 * creado desde administracion tiene que ver exactamente lo que le habilitaron.
 */
export function LayoutOperaciones() {
  const { perfil, puede, salir } = useSesion()
  const { enLinea } = useConexion()
  const navegar = useNavigate()

  const secciones = [
    { a: '/op', texto: 'Punto de venta', permiso: PERMISOS.VENTA_CREAR, exacto: true },
    { a: '/op/pedidos', texto: 'Pedidos', permiso: PERMISOS.VENTA_VER },
    { a: '/op/inventario', texto: 'Inventario', permiso: PERMISOS.INVENTARIO_VER },
    { a: '/op/caja', texto: 'Caja', permiso: PERMISOS.CAJA_OPERAR },
    { a: '/op/catalogo', texto: 'Catalogo', permiso: PERMISOS.PRODUCTO_VER },
    { a: '/op/reportes', texto: 'Reportes', permiso: PERMISOS.REPORTE_VER },
    { a: '/op/asistente', texto: 'Asistente', permiso: PERMISOS.IA_ASISTENTE },
  ].filter((s) => puede(s.permiso))

  return (
    <div className="operaciones">
      <aside className="panel-lateral">
        <div className="panel-lateral__marca">
          <span className="marca-aurora marca-aurora--op">AURORA</span>
          <span className="rotulo panel-lateral__modo">Operaciones</span>
        </div>

        <nav className="panel-lateral__nav">
          {secciones.map((s) => (
            <NavLink
              key={s.a}
              to={s.a}
              end={s.exacto}
              className={({ isActive }) =>
                clases('panel-lateral__enlace', isActive && 'panel-lateral__enlace--activo')
              }
            >
              {s.texto}
            </NavLink>
          ))}
        </nav>

        <div className="panel-lateral__pie">
          <div className="panel-lateral__estado">
            <div className={clases('pulso-red', !enLinea && 'pulso-red--corte')}>
              <span className="pulso-red__punto" aria-hidden />
              {enLinea ? 'En linea' : 'Sin conexion'}
            </div>
            <Campanita />
          </div>
          <p className="panel-lateral__usuario">
            {perfil?.nombre} {perfil?.apellido}
            <span className="panel-lateral__rol">{perfil?.rol}</span>
            {perfil?.sucursal && (
              <span className="panel-lateral__sucursal">{perfil.sucursal}</span>
            )}
          </p>
          <button
            type="button"
            className="boton boton--fantasma panel-lateral__salir"
            onClick={async () => {
              await salir()
              navegar('/op/entrar')
            }}
          >
            Cerrar sesion
          </button>
        </div>
      </aside>

      <div className="operaciones__cuerpo">
        <BarraConexion />
        <Outlet />
      </div>
    </div>
  )
}
