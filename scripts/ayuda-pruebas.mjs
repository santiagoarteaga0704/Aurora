/**
 * Arnes comun de las pruebas de la API.
 *
 * Los contadores viven a nivel de modulo, y en ESM un modulo se carga una sola
 * vez: asi `probar-todo.mjs` puede correr varias suites seguidas y sumar un
 * unico resultado, sin que cada archivo lleve su propia cuenta.
 */

export const BASE = process.env.AURORA_API ?? 'http://localhost:8000'

let pasaron = 0
let fallaron = 0
const fallos = []

export function verificar(nombre, condicion, detalle = '') {
  if (condicion) {
    pasaron++
    console.log(`  OK    ${nombre}`)
  } else {
    fallaron++
    fallos.push(nombre)
    console.log(`  FALLA ${nombre}${detalle ? ` -> ${detalle}` : ''}`)
  }
}

export function titulo(texto) {
  console.log(`\n${texto}`)
}

/**
 * Una peticion a la API.
 *
 * `ip` manda un X-Forwarded-For para que cada grupo de pruebas gaste su propio
 * cupo del limitador de tasa en lugar del de los demas. Funciona porque la API
 * corre con `trust proxy`, que es lo que necesita detras del proxy de Azure.
 */
export async function pedir(
  metodo,
  ruta,
  { cuerpo, token, ip, dispositivo, idempotencia, carrito } = {}
) {
  const cabeceras = { 'Content-Type': 'application/json' }
  if (token) cabeceras.Authorization = `Bearer ${token}`
  if (ip) cabeceras['X-Forwarded-For'] = ip
  if (dispositivo) cabeceras['X-Dispositivo'] = dispositivo
  if (idempotencia) cabeceras['Idempotency-Key'] = idempotencia
  if (carrito) cabeceras['X-Carrito'] = carrito

  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  })

  let json = null
  try {
    json = await res.json()
  } catch {
    /* respuestas sin cuerpo */
  }
  return { estado: res.status, json }
}

export const ADMIN = { email: 'admin@aurora.bo', password: 'Aurora2026!' }

/** Inicia sesion y devuelve el par de tokens. */
export async function sesionAdmin(ip = '10.1.0.1') {
  const r = await pedir('POST', '/api/auth/login', { cuerpo: ADMIN, ip })
  if (r.estado !== 200) {
    throw new Error(`No se pudo iniciar sesion como administrador (estado ${r.estado})`)
  }
  return r.json.datos
}

/** Sufijo aleatorio para no chocar con datos de corridas anteriores. */
export const sufijo = () => Math.random().toString(36).slice(2, 8)

export function resumen() {
  console.log(`\n${'-'.repeat(60)}`)
  console.log(`${pasaron} pasaron, ${fallaron} fallaron`)
  if (fallaron > 0) {
    console.log(`\nFallaron:\n  - ${fallos.join('\n  - ')}`)
    return 1
  }
  return 0
}
