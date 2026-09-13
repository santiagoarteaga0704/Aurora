/**
 * Pruebas de la API de autenticacion contra un servidor levantado.
 *
 *   node scripts/probar-api.mjs [http://localhost:8000]
 *
 * Cubre lo mismo que se probo a mano en el backend anterior (ver ESTADO.md) mas
 * lo que el stack nuevo agrega: rotacion del refresh, bloqueo por intentos,
 * limite de tasa por IP y rechazo de tokens con alg=none.
 *
 * Sobre las IP falsas: cada grupo de pruebas manda su propio X-Forwarded-For
 * para no gastar el limite de tasa de los demas. Funciona porque la API corre
 * con `trust proxy`, que es lo que necesita detras del proxy de Azure para ver
 * la IP real del cliente en lugar de la del balanceador. De paso, esto comprueba
 * que esa configuracion esta puesta.
 */

import { pathToFileURL } from 'node:url'
import { ADMIN, BASE, pedir, resumen, sufijo as nuevoSufijo, verificar } from './ayuda-pruebas.mjs'

const sufijo = nuevoSufijo()

// ---------------------------------------------------------------------------

async function salud() {
  console.log('\n[1] Salud del servicio')
  const r = await pedir('GET', '/api/salud', { ip: '10.0.0.1' })
  verificar('responde 200', r.estado === 200, `estado ${r.estado}`)
  verificar('la forma de respuesta es la unica acordada', r.json?.ok === true)
  verificar('reporta la base viva', r.json?.datos?.bd === true)
  verificar('no exige sesion', r.estado !== 401)
}

async function login() {
  console.log('\n[2] Inicio de sesion')
  const ip = '10.0.0.2'

  const bien = await pedir('POST', '/api/auth/login', { cuerpo: ADMIN, ip })
  verificar('credenciales correctas dan 200', bien.estado === 200, `estado ${bien.estado}`)
  verificar('devuelve token de acceso', typeof bien.json?.datos?.token === 'string')
  verificar('devuelve token de refresco', typeof bien.json?.datos?.refresh_token === 'string')
  verificar(
    'el administrador trae el permiso comodin',
    bien.json?.datos?.usuario?.permisos?.includes('*')
  )

  const mal = await pedir('POST', '/api/auth/login', {
    cuerpo: { email: ADMIN.email, password: 'incorrecta' },
    ip,
  })
  verificar('contrasenia incorrecta da 401', mal.estado === 401, `estado ${mal.estado}`)

  const inexistente = await pedir('POST', '/api/auth/login', {
    cuerpo: { email: 'nadie@aurora.bo', password: 'incorrecta' },
    ip,
  })
  verificar('correo inexistente da 401', inexistente.estado === 401)
  verificar(
    'el mensaje no distingue correo inexistente de contrasenia mala',
    mal.json?.mensaje === inexistente.json?.mensaje,
    `"${mal.json?.mensaje}" vs "${inexistente.json?.mensaje}"`
  )

  const invalido = await pedir('POST', '/api/auth/login', {
    cuerpo: { email: 'no-es-un-correo', password: '' },
    ip,
  })
  verificar('datos invalidos dan 422', invalido.estado === 422, `estado ${invalido.estado}`)
  verificar('el error viene por campo', typeof invalido.json?.errores?.email === 'string')

  return bien.json.datos
}

async function perfil(sesion) {
  console.log('\n[3] Perfil y proteccion de rutas')
  const ip = '10.0.0.3'

  const con = await pedir('GET', '/api/auth/yo', { token: sesion.token, ip })
  verificar('con token da 200', con.estado === 200, `estado ${con.estado}`)
  verificar('trae el perfil completo', con.json?.datos?.email === ADMIN.email)
  verificar('trae los permisos', Array.isArray(con.json?.datos?.permisos))
  verificar('trae el rol', con.json?.datos?.rol === 'administrador')

  const sin = await pedir('GET', '/api/auth/yo', { ip })
  verificar('sin token da 401', sin.estado === 401, `estado ${sin.estado}`)

  const falso = await pedir('GET', '/api/auth/yo', {
    token: `${sesion.token.split('.').slice(0, 2).join('.')}.firmafalsa`,
    ip,
  })
  verificar('con firma adulterada da 401', falso.estado === 401, `estado ${falso.estado}`)

  // El ataque clasico: rehacer el token diciendo que no lleva firma.
  const b64 = (o) =>
    Buffer.from(JSON.stringify(o)).toString('base64url')
  const sinAlg = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    sub: 1,
    tipo: 'acceso',
    rol: 'administrador',
    sucursal_id: null,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.`
  const ataque = await pedir('GET', '/api/auth/yo', { token: sinAlg, ip })
  verificar('rechaza un token con alg=none', ataque.estado === 401, `estado ${ataque.estado}`)

  const metodoMalo = await pedir('DELETE', '/api/auth/login', { ip })
  verificar(
    'un metodo no declarado no llega al controlador',
    metodoMalo.estado === 404 || metodoMalo.estado === 405,
    `estado ${metodoMalo.estado}`
  )
}

async function rotacionRefresh(sesion) {
  console.log('\n[4] Rotacion del token de refresco')
  const ip = '10.0.0.4'

  const primero = await pedir('POST', '/api/auth/refresh', {
    cuerpo: { refresh_token: sesion.refresh_token },
    ip,
  })
  verificar('el refresh devuelve un par nuevo', primero.estado === 200, `estado ${primero.estado}`)
  verificar(
    'el refresh emitido es distinto del usado',
    primero.json?.datos?.refresh_token !== sesion.refresh_token
  )

  const repetido = await pedir('POST', '/api/auth/refresh', {
    cuerpo: { refresh_token: sesion.refresh_token },
    ip,
  })
  verificar(
    'el refresh ya usado deja de servir',
    repetido.estado === 401,
    `estado ${repetido.estado}`
  )

  const salida = await pedir('POST', '/api/auth/logout', {
    cuerpo: { refresh_token: primero.json.datos.refresh_token },
    token: primero.json.datos.token,
    ip,
  })
  verificar('el logout responde 200', salida.estado === 200, `estado ${salida.estado}`)

  const despues = await pedir('POST', '/api/auth/refresh', {
    cuerpo: { refresh_token: primero.json.datos.refresh_token },
    ip,
  })
  verificar('tras el logout el refresh no sirve', despues.estado === 401, `estado ${despues.estado}`)
}

async function registro() {
  console.log('\n[5] Registro de clientes')
  const ip = '10.0.0.5'
  const email = `prueba+${sufijo}@aurora.bo`

  const alta = await pedir('POST', '/api/auth/registro', {
    cuerpo: {
      nombre: 'Clienta',
      apellido: 'De Prueba',
      email,
      password: 'ClaveSegura123',
      tipo: 'minorista',
    },
    ip,
    dispositivo: `disp-${sufijo}`,
  })
  verificar('alta correcta da 201', alta.estado === 201, `estado ${alta.estado}`)
  verificar('el alta ya devuelve sesion iniciada', typeof alta.json?.datos?.token === 'string')
  verificar('el cliente nuevo tiene rol cliente', alta.json?.datos?.usuario?.rol === 'cliente')
  verificar(
    'el cliente no hereda permisos de gestion',
    !alta.json?.datos?.usuario?.permisos?.includes('*')
  )

  const repetido = await pedir('POST', '/api/auth/registro', {
    cuerpo: {
      nombre: 'Otra',
      apellido: 'Persona',
      email,
      password: 'ClaveSegura123',
    },
    ip,
  })
  verificar('el correo repetido se rechaza', repetido.estado === 422, `estado ${repetido.estado}`)
  verificar('y dice en que campo', typeof repetido.json?.errores?.email === 'string')

  const mayorista = await pedir('POST', '/api/auth/registro', {
    cuerpo: {
      nombre: 'Mayorista',
      apellido: 'Sin Nit',
      email: `prueba+may${sufijo}@aurora.bo`,
      password: 'ClaveSegura123',
      tipo: 'mayorista',
    },
    ip,
  })
  verificar('un mayorista sin NIT se rechaza', mayorista.estado === 422, `estado ${mayorista.estado}`)
  verificar('y el error apunta al NIT', typeof mayorista.json?.errores?.nit === 'string')

  const corta = await pedir('POST', '/api/auth/registro', {
    cuerpo: {
      nombre: 'Clave',
      apellido: 'Corta',
      email: `prueba+cor${sufijo}@aurora.bo`,
      password: 'abc',
    },
    ip,
  })
  verificar('una contrasenia corta se rechaza', corta.estado === 422, `estado ${corta.estado}`)

  return { email, sesion: alta.json.datos }
}

async function cambioPassword(cliente) {
  console.log('\n[6] Cambio de contrasenia')
  const ip = '10.0.0.6'

  const malActual = await pedir('PUT', '/api/auth/password', {
    cuerpo: { password_actual: 'noEsLaMia', password_nueva: 'OtraClave12345' },
    token: cliente.sesion.token,
    ip,
  })
  verificar(
    'con la contrasenia actual mal da 422',
    malActual.estado === 422,
    `estado ${malActual.estado}`
  )

  const ok = await pedir('PUT', '/api/auth/password', {
    cuerpo: { password_actual: 'ClaveSegura123', password_nueva: 'OtraClave12345' },
    token: cliente.sesion.token,
    ip,
  })
  verificar('el cambio correcto da 200', ok.estado === 200, `estado ${ok.estado}`)

  const viejoRefresh = await pedir('POST', '/api/auth/refresh', {
    cuerpo: { refresh_token: cliente.sesion.refresh_token },
    ip,
  })
  verificar(
    'cambiar la contrasenia cierra las otras sesiones',
    viejoRefresh.estado === 401,
    `estado ${viejoRefresh.estado}`
  )

  const nuevo = await pedir('POST', '/api/auth/login', {
    cuerpo: { email: cliente.email, password: 'OtraClave12345' },
    ip,
  })
  verificar('se entra con la contrasenia nueva', nuevo.estado === 200, `estado ${nuevo.estado}`)
}

async function bloqueoPorIntentos() {
  console.log('\n[7] Bloqueo de cuenta por intentos fallidos')
  const ip = '10.0.0.7'
  const email = `prueba+blo${sufijo}@aurora.bo`

  await pedir('POST', '/api/auth/registro', {
    cuerpo: { nombre: 'Bloqueo', apellido: 'Prueba', email, password: 'ClaveSegura123' },
    ip,
  })

  let ultimo = null
  for (let i = 0; i < 5; i++) {
    ultimo = await pedir('POST', '/api/auth/login', {
      cuerpo: { email, password: 'incorrecta' },
      ip,
    })
  }
  verificar('los primeros fallos siguen dando 401', ultimo.estado === 401, `estado ${ultimo.estado}`)

  const bloqueado = await pedir('POST', '/api/auth/login', {
    cuerpo: { email, password: 'ClaveSegura123' },
    ip,
  })
  verificar(
    'tras 5 fallos la cuenta queda bloqueada aunque la clave sea correcta',
    bloqueado.estado === 429,
    `estado ${bloqueado.estado}`
  )
}

async function limiteDeTasa() {
  console.log('\n[8] Limite de tasa por IP en el login')
  const ip = '10.0.0.8'

  let bloqueadoEn = null
  for (let i = 1; i <= 12; i++) {
    const r = await pedir('POST', '/api/auth/login', {
      cuerpo: { email: 'nadie@aurora.bo', password: 'x' },
      ip,
    })
    if (r.estado === 429) {
      bloqueadoEn = i
      break
    }
  }
  verificar(
    'el limitador corta pasadas 10 peticiones',
    bloqueadoEn !== null && bloqueadoEn <= 11,
    bloqueadoEn ? `corto en la ${bloqueadoEn}` : 'nunca corto'
  )

  const otraIp = await pedir('POST', '/api/auth/login', {
    cuerpo: { email: 'nadie@aurora.bo', password: 'x' },
    ip: '10.0.0.9',
  })
  verificar(
    'el bloqueo es por IP y no afecta a otros clientes',
    otraIp.estado !== 429,
    `estado ${otraIp.estado}`
  )
}

// ---------------------------------------------------------------------------

export async function probarAuth() {
  console.log(`Probando ${BASE}`)

  await salud()
  const sesion = await login()
  await perfil(sesion)
  await rotacionRefresh(sesion)
  const cliente = await registro()
  await cambioPassword(cliente)
  await bloqueoPorIntentos()
  await limiteDeTasa()
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  probarAuth()
    .then(() => process.exit(resumen()))
    .catch((e) => {
      console.error('\nLa prueba se corto:', e.message)
      process.exit(1)
    })
}
