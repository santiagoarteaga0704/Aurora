/**
 * Capturas de pantalla de la PWA, sin intervencion manual.
 *
 *   node scripts/captura.mjs op/asistente asistente
 *   node scripts/captura.mjs "op/asistente?p=que hay que reponer" asistente-stock
 *   node scripts/captura.mjs op/pos pos --usuario vendedora@aurora.bo
 *
 * La ruta va SIN barra inicial: con ella, Git Bash la reescribe como ruta de
 * Windows antes de que Node la lea. Con barra funciona igual desde PowerShell.
 *
 * Hace falta para documentar y para revisar el trabajo: una pantalla puede
 * compilar, pasar las pruebas y verse rota igual, y eso solo se ve mirandola.
 *
 * El unico enredo es la sesion. La aplicacion guarda el token en localStorage,
 * y un navegador sin cabeza arranca con el almacenamiento vacio, asi que se
 * escribe una pagina puente que lo deja escrito y redirige. Esa pagina TIENE
 * que vivir en `public/` para compartir origen con la aplicacion —si no, el
 * localStorage que escriba es de otro dominio y no sirve—, y `public/` se copia
 * entero a `dist/` en cada compilacion. O sea que una pagina con un token de
 * administrador adentro terminaria publicada.
 *
 * Por eso se crea y se borra dentro de la misma corrida, incluso si la captura
 * falla.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

/**
 * Token para el puente, reutilizando el de la corrida anterior si sigue vivo.
 *
 * Pedir un login en cada captura parece lo simple, y es justamente lo que rompe
 * la tanda: el limitador de intentos de la API cuenta por IP y a la sexta o
 * septima captura seguida devuelve 429. Guardando el token y comprobandolo
 * contra `/api/auth/yo`, una tanda entera de capturas gasta un solo login.
 *
 * El archivo vive en el directorio temporal del sistema, no en el repositorio:
 * es un token de administrador con fecha de vencimiento, no algo que versionar.
 */
async function abrirSesion(usuario, clave) {
  const cache = join(tmpdir(), `aurora-captura-sesion-${Buffer.from(usuario).toString('hex')}.json`)

  if (existsSync(cache)) {
    try {
      const guardada = JSON.parse(readFileSync(cache, 'utf8'))
      const r = await fetch(`${WEB}/api/auth/yo`, {
        headers: { Authorization: `Bearer ${guardada.datos.token}` },
      })
      if (r.ok) return guardada
    } catch {
      /* cache invalida: se pide una nueva */
    }
  }

  const entrada = await fetch(`${WEB}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: usuario, password: clave }),
  }).catch(() => null)

  const sesion = entrada && entrada.ok ? await entrada.json().catch(() => null) : null

  if (!sesion?.datos?.token) {
    const detalle = entrada
      ? ((await entrada.json().catch(() => ({}))).mensaje ?? `HTTP ${entrada.status}`)
      : 'la API no respondio'
    throw new Error(
      `No se pudo entrar como ${usuario}: ${detalle}. ` +
        'Si dice "Too Many Requests", reinicia la API: el limitador vive en memoria del proceso.'
    )
  }

  writeFileSync(cache, JSON.stringify(sesion), 'utf8')
  return sesion
}

/**
 * Normaliza la ruta pedida.
 *
 * Git Bash (MSYS) reescribe los argumentos que parecen rutas de Unix antes de
 * que Node los vea: `/mis-medidas` llega convertido en
 * `C:/Program Files/Git/mis-medidas`. El script seguia adelante con eso, el
 * navegador no encontraba nada y la captura salia en blanco sin decir por que.
 *
 * Por eso se acepta la ruta con barra inicial o sin ella —`op/asistente` es lo
 * mas comodo desde Git Bash— y, si igual llega convertida, se dice exactamente
 * que paso en vez de capturar la pantalla equivocada.
 */
function normalizarRuta(cruda) {
  if (/^[A-Za-z]:[\\/]/.test(cruda)) {
    throw new Error(
      `La ruta llego convertida en una ruta de Windows ("${cruda}"). ` +
        'Es Git Bash reescribiendo el argumento: pasala sin la barra inicial ' +
        '(op/asistente) o antepone MSYS_NO_PATHCONV=1 al comando.'
    )
  }
  return cruda.startsWith('/') ? cruda : `/${cruda}`
}

async function capturar() {
  const nombre = process.argv[3]
  if (!process.argv[2] || !nombre) {
    console.error('Uso: node scripts/captura.mjs <ruta> <nombre> [--usuario x] [--clave y] [--ancho 1440] [--alto 1000]')
    process.exit(2)
  }

  const ruta = normalizarRuta(process.argv[2])

  const usuario = argumento('usuario', 'admin@aurora.bo')
  const clave = argumento('clave', 'Aurora2026!')
  const ancho = argumento('ancho', '1440')
  const alto = argumento('alto', '1000')

  // La espera es generosa a proposito: la pagina entra, redirige, monta la
  // aplicacion, pide el perfil y recien despues consulta lo que se quiere ver.
  const espera = argumento('espera', '13000')

  mkdirSync(SALIDA, { recursive: true })

  const sesion = await abrirSesion(usuario, clave)

  writeFileSync(
    PUENTE,
    `<!doctype html>
<meta charset="utf-8">
<title>Entrando…</title>
<script>
localStorage.setItem('aurora.token', ${JSON.stringify(sesion.datos.token)})
localStorage.setItem('aurora.refresh', ${JSON.stringify(sesion.datos.refresh_token ?? '')})
location.replace(${JSON.stringify(ruta)})
</script>
`,
    'utf8'
  )

  // Esperar a que el servidor de desarrollo sirva el puente recien escrito.
  //
  // Vite lo toma del disco, pero no de forma instantanea: lanzando el navegador
  // en el mismo tick que la escritura, la peticion llega antes que el archivo
  // exista para el servidor, cae en el index.html de la aplicacion y la captura
  // sale en blanco. Comprobarlo es mas honesto que dormir un rato fijo.
  let servido = false
  for (let intento = 0; intento < 40 && !servido; intento++) {
    const r = await fetch(`${WEB}/_captura.html`).catch(() => null)
    servido = r !== null && r.ok && (await r.text()).includes('aurora.token')
    if (!servido) await new Promise((sigue) => setTimeout(sigue, 100))
  }
  if (!servido) throw new Error('El servidor web no llego a servir la pagina puente')

  const destino = join(SALIDA, `${nombre}.png`)

  /**
   * Perfil de navegador descartable.
   *
   * Sin esto, Edge sin cabeza abre el perfil por defecto del usuario. Si hay un
   * Edge normal abierto —lo habitual—, el segundo proceso no arranca su propio
   * navegador: le pasa la URL al que ya estaba corriendo, termina enseguida con
   * codigo 0 y deja un PNG en blanco. La captura "funciona" y no muestra nada,
   * que es la peor forma de fallar porque parece que la pantalla esta rota.
   */
  const perfil = mkdtempSync(join(tmpdir(), 'aurora-captura-'))

  const correr = (navegador, extra, url) =>
    new Promise((listo) => {
      const p = spawn(
        navegador,
        [
          '--headless=new',
          '--disable-gpu',
          `--user-data-dir=${perfil}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--hide-scrollbars',
          `--window-size=${ancho},${alto}`,
          ...extra,
          url,
        ],
        { stdio: 'ignore' }
      )
      p.on('error', () => listo(null))
      p.on('exit', (c) => listo(c))
    })

  try {
    let ultimo = null
    for (const navegador of EDGE) {
      const codigo = await correr(
        navegador,
        [`--virtual-time-budget=${espera}`, `--screenshot=${destino}`],
        `${WEB}/_captura.html`
      )

      if (codigo === 0) {
        console.log(destino)
        return
      }
      ultimo = navegador
    }
    throw new Error(`ningun navegador sin cabeza respondio (ultimo intento: ${ultimo})`)
  } finally {
    // Pase lo que pase, ni la pagina puente ni el perfil sobreviven a esta
    // corrida: la primera porque lleva una clave de administrador adentro, el
    // segundo porque son unos megas por captura.
    rmSync(PUENTE, { force: true })
    rmSync(perfil, { force: true, recursive: true })
  }
}

capturar().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
