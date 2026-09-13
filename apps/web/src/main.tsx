import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'

import './estilos/base.css'
import './estilos/tienda.css'
import './estilos/operaciones.css'

import { App } from './App'
import { ProveedorSesion } from './sesion/SesionContexto'
import { ProveedorConexion } from './offline/ConexionContexto'
import { ProveedorCarrito } from './tienda/CarritoContexto'

/**
 * El Service Worker se actualiza solo. Para una tienda es lo correcto: no tiene
 * sentido preguntarle a una clienta si quiere la version nueva de un catalogo.
 */
registerSW({ immediate: true })

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProveedorConexion>
        <ProveedorSesion>
          <ProveedorCarrito>
            <App />
          </ProveedorCarrito>
        </ProveedorSesion>
      </ProveedorConexion>
    </BrowserRouter>
  </StrictMode>
)
