/**
 * Corre todas las suites de prueba contra una API levantada y da un solo
 * resultado.
 *
 *   npm run pruebas
 *   AURORA_API=https://aurora-api.azurewebsites.net node scripts/probar-todo.mjs
 *
 * Conviene correrlo sobre una base recien cargada (`npm run db:cargar` y
 * reiniciar la API): las suites crean sus propios datos con un sufijo aleatorio,
 * asi que no chocan entre corridas, pero la base va acumulando productos de
 * prueba.
 */
import { BASE, resumen } from './ayuda-pruebas.mjs'
import { probarAuth } from './probar-api.mjs'
import { probarCatalogo } from './probar-catalogo.mjs'
import { probarInventario } from './probar-inventario.mjs'
import { probarVentas } from './probar-ventas.mjs'
import { probarComprasYCaja } from './probar-compras-caja.mjs'
import { probarAdministracion } from './probar-administracion.mjs'
import { probarPosventa } from './probar-posventa.mjs'
import { probarReportes } from './probar-reportes.mjs'
import { probarAsistente } from './probar-asistente.mjs'
import { probarProbador } from './probar-probador.mjs'
import { probarResenas } from './probar-resenas.mjs'
import { probarNotificaciones } from './probar-notificaciones.mjs'
import { probarSync } from './probar-sync.mjs'

const suites = [
  ['Autenticacion', probarAuth],
  ['Catalogo', probarCatalogo],
  ['Inventario y transferencias', probarInventario],
  ['Carrito, pedidos y pagos', probarVentas],
  ['Compras y caja', probarComprasYCaja],
  ['Administracion, roles y permisos', probarAdministracion],
  ['Promociones, devoluciones y envios', probarPosventa],
  ['Reportes', probarReportes],
  ['Asistente de IA', probarAsistente],
  ['Probador virtual', probarProbador],
  ['Resenias', probarResenas],
  ['Notificaciones', probarNotificaciones],
  ['Sincronizacion por lote', probarSync],
]

async function principal() {
  console.log(`Probando ${BASE}\n`)

  for (const [nombre, suite] of suites) {
    console.log(`${'='.repeat(60)}`)
    console.log(`  ${nombre}`)
    console.log(`${'='.repeat(60)}`)
    await suite()
    console.log('')
  }

  process.exit(resumen())
}

principal().catch((e) => {
  console.error('\nLas pruebas se cortaron:', e.message)
  process.exit(1)
})
