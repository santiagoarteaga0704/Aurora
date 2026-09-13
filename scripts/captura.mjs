/**
 * Capturas de pantalla de la PWA, sin intervencion manual.
 *
 *   node scripts/captura.mjs /op/asistente asistente
 *   node scripts/captura.mjs "/op/asistente?p=que hay que reponer" asistente-stock
 *   node scripts/captura.mjs /op/pos pos --usuario vendedora@aurora.bo
 *
 * Hace falta para documentar y para revisar el trabajo: una pantalla puede
 * compilar, pasar las pruebas y verse rota igual, y eso solo se ve mirandola.
 *
 * El unico enredo es la sesion. La aplicacion guarda el token en localStorage,
 * y un navegador sin cabeza arranca con el almacenamiento vacio, asi que se
 * escribe una pagina puente que entra y redirige. Esa pagina TIENE que vivir en
 * `public/` para compartir origen con la aplicacion —si no, el localStorage que
 * escriba es de otro dominio y no sirve—, y `public/` se copia entero a `dist/`
 * en cada compilacion. O sea que una pagina que inicia sesion como
 * administrador con la clave escrita adentro terminaria publicada.
 *
 * Por eso se crea y se borra dentro de la misma corrida, incluso si la captura
 * falla.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUENTE = join(RAIZ, 'apps/web/public/_captura.html')
const SALIDA = process.env.AURORA_CAPTURAS ?? join(RAIZ, 'docs/capturas')

const WEB = process.env.AURORA_WEB ?? 'http://localhost:5180'

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/chromium',
]

function argumento(nombre, defecto) {
  const n = process.argv.indexOf(`--${nombre}`)
  return n === -1 ? defecto : process.argv[n + 1]
}

async function capturar() {
  const ruta = process.argv[2]
  const nombre = process.argv[3]
  if (!ruta || !nombre) {
    console.error('Uso: node scripts/captura.mjs <ruta> <nombre> [--usuario x] [--clave y] [--ancho 1440] [--alto 1000]')
    process.exit(2)
  }

  const usuario = argumento('usuario', 'admin@aurora.bo')
  const clave = argumento('clave', 'Aurora2026!')
  const ancho = argumento('ancho', '1440')
  const alto = argumento('alto', '1000')

  // La espera es generosa a proposito: la pagina entra, redirige, monta la
  // aplicacion, pide el perfil y recien despues consulta lo que se quiere ver.
  const espera = argumento('espera', '13000')

  mkdirSync(SALIDA, { recursive: true })

  writeFileSync(
    PUENTE,
    `<!doctype html>
<meta charset="utf-8">
<title>Entrando…</title>
<script>
fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: ${JSON.stringify(JSON.stringify({ email: usuario, password: clave }))},
})
  .then((r) => r.json())
  .then((j) => {
    if (!j?.datos?.token) throw new Error(j?.mensaje ?? 'sin token')
    localStorage.setItem('aurora.token', j.datos.token)
    localStorage.setItem('aurora.refresh', j.datos.refresh_token)
    location.replace(${JSON.stringify(ruta)})
  })
  .catch((e) => { document.body.textContent = 'No se pudo entrar: ' + e.message })
</script>
`,
    'utf8'
  )

  const destino = join(SALIDA, `${nombre}.png`)

  try {
    let ultimo = null
    for (const navegador of EDGE) {
      const codigo = await new Promise((listo) => {
        const p = spawn(
          navegador,
          [
            '--headless=new',
            '--disable-gpu',
            '--hide-scrollbars',
            `--window-size=${ancho},${alto}`,
            `--virtual-time-budget=${espera}`,
            `--screenshot=${destino}`,
            `${WEB}/_captura.html`,
          ],
          { stdio: 'ignore' }
        )
        p.on('error', () => listo(null))
        p.on('exit', (c) => listo(c))
      })

      if (codigo === 0) {
        console.log(destino)
        return
      }
      ultimo = navegador
    }
    throw new Error(`ningun navegador sin cabeza respondio (ultimo intento: ${ultimo})`)
  } finally {
    // Pase lo que pase, la pagina puente no sobrevive a esta corrida.
    rmSync(PUENTE, { force: true })
  }
}

capturar().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
