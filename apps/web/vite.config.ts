import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * El enunciado exige que la aplicacion FUNCIONE sin internet, no que muestre una
 * pantalla de error elegante. La estrategia de cache va por recurso:
 *
 *   armazon (HTML/JS/CSS)  precache. La app abre instantaneo y sin red.
 *   catalogo e imagenes    stale-while-revalidate: se muestra lo cacheado y se
 *                          refresca por detras.
 *   stock y precios        network-first con respaldo: cambian, asi que se
 *                          intenta la red y si no hay se usa lo ultimo conocido.
 *   ventas y pagos         NO se cachean. Van a la cola de IndexedDB y se
 *                          sincronizan al volver la red (ver src/offline/).
 *
 * Lo ultimo es la diferencia entre una app que "anda offline" y una que de
 * verdad puede vender sin internet.
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'AURORA',
        short_name: 'AURORA',
        description: 'Tienda de ropa femenina y punto de venta',
        lang: 'es-BO',
        start_url: '/',
        display: 'standalone',
        background_color: '#F6F2EC',
        theme_color: '#6E1A2B',
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icono-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // El catalogo se puede mirar entero sin red.
            urlPattern: /\/api\/catalogo\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'aurora-catalogo',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            // El stock cambia; sin red se muestra el ultimo conocido y la
            // pantalla lo marca como posiblemente desactualizado.
            urlPattern: /\/api\/inventario/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'aurora-inventario',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 12 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'aurora-fuentes',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    // El 5173 lo suele ocupar otro proyecto de la maquina.
    port: 5180,
    strictPort: true,
    proxy: {
      // En desarrollo el PWA y la API viven en puertos distintos; el proxy evita
      // tener que abrir CORS mas de la cuenta y hace que las rutas relativas
      // funcionen igual que en produccion.
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
