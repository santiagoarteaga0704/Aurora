import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSesion } from './sesion/SesionContexto'
import { Cargando } from './componentes/Estados'

import { LayoutTienda } from './tienda/LayoutTienda'
import { Inicio } from './tienda/Inicio'
import { Catalogo } from './tienda/Catalogo'
import { Producto } from './tienda/Producto'
import { Carrito } from './tienda/Carrito'
import { Checkout } from './tienda/Checkout'
import { DetallePedido } from './tienda/DetallePedido'
import { MisPedidos } from './tienda/MisPedidos'
import { Entrar } from './tienda/Entrar'

import { LayoutOperaciones } from './operaciones/LayoutOperaciones'
import { EntrarOperaciones } from './operaciones/EntrarOperaciones'
import { PuntoDeVenta } from './operaciones/PuntoDeVenta'
import { Inventario } from './operaciones/Inventario'
import { PedidosOperaciones } from './operaciones/PedidosOperaciones'
import { Caja } from './operaciones/Caja'
import { CatalogoOperaciones } from './operaciones/CatalogoOperaciones'
import { Reportes } from './operaciones/Reportes'
import { Asistente } from './operaciones/Asistente'

/** Exige sesion; opcionalmente, que sea del personal. */
function Protegida({ children, personal = false }: { children: ReactNode; personal?: boolean }) {
  const { perfil, cargando, esPersonal } = useSesion()
  const ubicacion = useLocation()

  if (cargando) {
    return (
      <div className="pantalla-carga">
        <Cargando texto="Abriendo AURORA" />
      </div>
    )
  }

  if (!perfil) {
    const destino = personal ? '/op/entrar' : `/entrar?volver=${encodeURIComponent(ubicacion.pathname)}`
    return <Navigate to={destino} replace />
  }

  // Una clienta que entra a /op no ve un error: se la manda a la tienda, que es
  // donde tiene algo que hacer.
  if (personal && !esPersonal) return <Navigate to="/" replace />

  return <>{children}</>
}

export function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/op/entrar" element={<EntrarOperaciones />} />

      <Route path="/" element={<LayoutTienda />}>
        <Route index element={<Inicio />} />
        <Route path="catalogo" element={<Catalogo />} />
        <Route path="producto/:slug" element={<Producto />} />
        <Route path="carrito" element={<Carrito />} />
        <Route
          path="checkout"
          element={
            <Protegida>
              <Checkout />
            </Protegida>
          }
        />
        <Route
          path="pedido/:id"
          element={
            <Protegida>
              <DetallePedido />
            </Protegida>
          }
        />
        <Route
          path="mis-pedidos"
          element={
            <Protegida>
              <MisPedidos />
            </Protegida>
          }
        />
      </Route>

      <Route
        path="/op"
        element={
          <Protegida personal>
            <LayoutOperaciones />
          </Protegida>
        }
      >
        <Route index element={<PuntoDeVenta />} />
        <Route path="pedidos" element={<PedidosOperaciones />} />
        <Route path="inventario" element={<Inventario />} />
        <Route path="caja" element={<Caja />} />
        <Route path="catalogo" element={<CatalogoOperaciones />} />
        <Route path="reportes" element={<Reportes />} />
        <Route path="asistente" element={<Asistente />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
