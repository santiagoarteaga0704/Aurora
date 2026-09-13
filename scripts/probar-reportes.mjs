/**
 * Pruebas del motor de reportes.
 *
 *   node scripts/probar-reportes.mjs
 *
 * Lo que mas importa comprobar aqui no es que los numeros salgan, sino que los
 * parametros viajen ENLAZADOS y no pegados al SQL. Este motor es el que despues
 * va a usar el asistente de IA, asi que si aqui se puede inyectar, se podra
 * inyectar preguntandole al chat.
 */
import { pathToFileURL } from 'node:url'
import { pedir, resumen, sesionAdmin, sufijo, titulo, verificar } from './ayuda-pruebas.mjs'

const ip = '10.8.0.1'
const s = sufijo()

const SUCURSAL_CENTRO = 1
const PISO_CENTRO = 1

const hace30Dias = () => new Date(Date.now() - 30 * 86400000).toISOString()
const enUnDia = () => new Date(Date.now() + 86400000).toISOString()

export async function probarReportes() {
  const admin = await sesionAdmin(ip)
  const token = admin.token

  // --------------------------------------------------------------------------
  titulo('[G1] Catalogo de plantillas')

  const clienta = await pedir('POST', '/api/auth/registro', {
    ip,
    cuerpo: {
      nombre: 'Clienta',
      apellido: 'Reportes',
      email: `prueba+rep${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  const tokenClienta = clienta.json.datos.token

  const sinPermiso = await pedir('GET', '/api/reportes/plantillas', { ip, token: tokenClienta })
  verificar('un cliente no ve los reportes', sinPermiso.estado === 403, `estado ${sinPermiso.estado}`)

  const plantillas = await pedir('GET', '/api/reportes/plantillas', { ip, token })
  verificar('las plantillas se listan', plantillas.estado === 200, `estado ${plantillas.estado}`)
  verificar('son las 8 del seed', plantillas.json?.datos?.length === 8, `${plantillas.json?.datos?.length}`)

  const ventasPorRango = plantillas.json.datos.find((p) => p.codigo === 'ventas_por_rango')
  verificar('cada una declara sus parametros', ventasPorRango?.parametros?.desde?.requerido === true)
  verificar('y como se dibuja', ventasPorRango?.visual === 'lineas')
  verificar(
    'el administrador puede correrlas todas',
    plantillas.json.datos.every((p) => p.disponible)
  )

  // --------------------------------------------------------------------------
  titulo('[G2] Validacion de parametros')

  const inexistente = await pedir('POST', '/api/reportes/no_existe', {
    ip,
    token,
    cuerpo: { parametros: {} },
  })
  verificar('una plantilla inexistente da 404', inexistente.estado === 404, `estado ${inexistente.estado}`)

  const sinObligatorios = await pedir('POST', '/api/reportes/ventas_por_rango', {
    ip,
    token,
    cuerpo: { parametros: {} },
  })
  verificar('faltando un parametro obligatorio da 422', sinObligatorios.estado === 422)
  verificar(
    'y dice cual falta',
    sinObligatorios.json?.errores?.desde !== undefined,
    JSON.stringify(sinObligatorios.json?.errores)
  )

  const fechaMala = await pedir('POST', '/api/reportes/ventas_por_rango', {
    ip,
    token,
    cuerpo: { parametros: { desde: 'no es una fecha', hasta: enUnDia() } },
  })
  verificar('una fecha invalida se rechaza', fechaMala.estado === 422)
  verificar('senialando el campo', fechaMala.json?.errores?.desde !== undefined)

  const enumMalo = await pedir('POST', '/api/reportes/ventas_por_rango', {
    ip,
    token,
    cuerpo: { parametros: { desde: hace30Dias(), hasta: enUnDia(), canal: 'telepatia' } },
  })
  verificar('un valor fuera del enum se rechaza', enumMalo.estado === 422)
  verificar(
    'y dice cuales valen',
    /online/.test(JSON.stringify(enumMalo.json?.errores ?? {})),
    JSON.stringify(enumMalo.json?.errores)
  )

  const enteroMalo = await pedir('POST', '/api/reportes/productos_mas_vendidos', {
    ip,
    token,
    cuerpo: { parametros: { desde: hace30Dias(), hasta: enUnDia(), limite: 'diez' } },
  })
  verificar('un entero mal escrito se rechaza', enteroMalo.estado === 422)

  // --------------------------------------------------------------------------
  titulo('[G3] Inyeccion: los parametros van enlazados, no pegados')

  // Si los valores se interpolaran en el texto del SQL, cualquiera de estos
  // cerraria la consulta y ejecutaria lo suyo. Como viajan como parametros
  // posicionales, PostgreSQL los trata como DATOS y nunca como sintaxis.
  const inyecciones = [
    { nombre: 'cerrar la consulta y borrar', valor: "2026-01-01'; DROP TABLE usuario; --" },
    { nombre: 'union para leer otra tabla', valor: "1 UNION SELECT password_hash FROM usuario" },
    { nombre: 'comentar el resto', valor: "1 -- " },
    { nombre: 'tautologia', valor: "1 OR 1=1" },
  ]

  for (const inyeccion of inyecciones) {
    const r = await pedir('POST', '/api/reportes/ventas_por_rango', {
      ip,
      token,
      cuerpo: {
        parametros: { desde: inyeccion.valor, hasta: enUnDia(), sucursal_id: inyeccion.valor },
      },
    })
    // Se espera 422: el validador los rechaza antes de llegar al SQL. Lo que NO
    // puede pasar es un 200 con datos raros ni un 500 por sintaxis rota.
    verificar(
      `rechaza "${inyeccion.nombre}"`,
      r.estado === 422,
      `estado ${r.estado}`
    )
  }

  const usuariosSiguenAhi = await pedir('GET', '/api/usuarios', { ip, token })
  verificar(
    'la tabla de usuarios sigue intacta despues de todo eso',
    usuariosSiguenAhi.estado === 200 && (usuariosSiguenAhi.json?.meta?.total ?? 0) > 0
  )

  const parametroDeMas = await pedir('POST', '/api/reportes/devoluciones_por_motivo', {
    ip,
    token,
    cuerpo: {
      parametros: {
        desde: hace30Dias(),
        hasta: enUnDia(),
        // Un parametro que la plantilla no declara: se descarta en silencio.
        sucursal_id: 99,
        inventado: "'; DROP TABLE pedido; --",
      },
    },
  })
  verificar(
    'un parametro no declarado se ignora sin romper nada',
    parametroDeMas.estado === 200,
    `estado ${parametroDeMas.estado}`
  )

  // --------------------------------------------------------------------------
  titulo('[G4] Las 8 plantillas ejecutan de verdad')

  // Datos para que los reportes tengan de que hablar.
  const producto = await pedir('POST', '/api/catalogo/productos', {
    ip,
    token,
    cuerpo: {
      categoria_id: 2,
      codigo: `REP-${s}`,
      nombre: `Vestido de reportes ${s}`,
      tipo_prenda: 'vestido',
      variantes: [
        { talla_id: 3, color_id: 1, sku: `REP-${s}-M-NE`, precio_menor: 500, precio_mayor: 400 },
      ],
    },
  })
  const variante = producto.json.datos.variantes[0]

  await pedir('POST', '/api/inventario/ajuste', {
    ip,
    token,
    cuerpo: {
      variante_id: variante.id,
      almacen_id: PISO_CENTRO,
      stock_contado: 20,
      stock_minimo: 30,
      motivo: 'Carga para reportes',
    },
  })

  const venta = await pedir('POST', '/api/pedidos', {
    ip,
    token,
    cuerpo: {
      canal: 'tienda',
      tipo_entrega: 'inmediata',
      sucursal_id: SUCURSAL_CENTRO,
      items: [{ variante_id: variante.id, cantidad: 3 }],
      pago: { metodo_pago_id: 1, monto: 1500 },
    },
  })
  verificar('hay una venta para reportar', venta.estado === 201, `estado ${venta.estado}`)

  const rango = { desde: hace30Dias(), hasta: enUnDia() }

  const casos = [
    ['ventas_por_rango', rango],
    ['ventas_por_sucursal', rango],
    ['productos_mas_vendidos', { ...rango, limite: 5 }],
    ['stock_bajo', {}],
    ['ventas_por_hora', rango],
    ['desempeno_vendedores', rango],
    ['efectividad_probador', rango],
    ['devoluciones_por_motivo', rango],
  ]

  for (const [codigo, parametros] of casos) {
    const r = await pedir('POST', `/api/reportes/${codigo}`, { ip, token, cuerpo: { parametros } })
    verificar(
      `${codigo} ejecuta`,
      r.estado === 200,
      `estado ${r.estado} ${r.json?.mensaje ?? ''}`
    )
  }

  const conDatos = await pedir('POST', '/api/reportes/ventas_por_rango', {
    ip,
    token,
    cuerpo: { parametros: rango },
  })
  verificar('el reporte de ventas trae filas', (conDatos.json?.datos?.filas?.length ?? 0) > 0)
  verificar('con sus columnas tipadas', conDatos.json?.datos?.columnas?.length > 0)
  verificar(
    'y los numeros llegan como numeros, no como texto',
    typeof conDatos.json?.datos?.filas?.[0]?.total === 'number',
    `tipo: ${typeof conDatos.json?.datos?.filas?.[0]?.total}`
  )
  verificar('mide cuanto tardo', typeof conDatos.json?.datos?.duracion_ms === 'number')
  verificar('y devuelve los parametros que uso', conDatos.json?.datos?.parametros_usados?.desde !== undefined)

  const stockBajo = await pedir('POST', '/api/reportes/stock_bajo', {
    ip,
    token,
    cuerpo: { parametros: { sucursal_id: SUCURSAL_CENTRO } },
  })
  verificar(
    'el de stock bajo encuentra el articulo bajo minimo',
    stockBajo.json?.datos?.filas?.some((f) => f.sku === variante.sku),
    `${stockBajo.json?.datos?.filas?.length} fila(s)`
  )

  // --------------------------------------------------------------------------
  titulo('[G5] Cada quien ve lo de su sucursal')

  const roles = await pedir('GET', '/api/roles', { ip, token })
  const rolGerente = roles.json.datos.find((r) => r.nombre === 'gerente')

  await pedir('POST', '/api/usuarios', {
    ip,
    token,
    cuerpo: {
      rol_id: rolGerente.id,
      sucursal_id: 2,
      nombre: 'Gerente',
      apellido: `Ventura${s}`,
      email: `prueba+ger2${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  const sesionGerente = await pedir('POST', '/api/auth/login', {
    ip,
    cuerpo: { email: `prueba+ger2${s}@aurora.bo`, password: 'ClaveSegura123' },
  })
  const tokenGerente = sesionGerente.json.datos.token

  const plantillasGerente = await pedir('GET', '/api/reportes/plantillas', { ip, token: tokenGerente })
  const ranking = plantillasGerente.json.datos.find((p) => p.codigo === 'ventas_por_sucursal')
  verificar(
    'al gerente se le marca el ranking como no disponible',
    ranking?.disponible === false,
    `disponible ${ranking?.disponible}`
  )
  verificar('y se le explica por que', /todas las sucursales/i.test(ranking?.motivo ?? ''), ranking?.motivo)

  const intentaRanking = await pedir('POST', '/api/reportes/ventas_por_sucursal', {
    ip,
    token: tokenGerente,
    cuerpo: { parametros: rango },
  })
  verificar(
    'y si lo intenta igual, se le niega',
    intentaRanking.estado === 403,
    `estado ${intentaRanking.estado}`
  )

  // El gerente es de la sucursal 2; pide la 1 y tiene que recibir la 2.
  const pideOtra = await pedir('POST', '/api/reportes/ventas_por_rango', {
    ip,
    token: tokenGerente,
    cuerpo: { parametros: { ...rango, sucursal_id: SUCURSAL_CENTRO } },
  })
  verificar('puede correr un reporte acotable', pideOtra.estado === 200, `estado ${pideOtra.estado}`)
  verificar(
    'pero se le fuerza SU sucursal, no la que pidio',
    pideOtra.json?.datos?.parametros_usados?.sucursal_id === 2,
    `uso sucursal ${pideOtra.json?.datos?.parametros_usados?.sucursal_id}`
  )

  // --------------------------------------------------------------------------
  titulo('[G6] Historial y exportacion')

  const historial = await pedir('GET', '/api/reportes/historial', { ip, token })
  verificar('el historial registra las ejecuciones', (historial.json?.meta?.total ?? 0) > 5, `total ${historial.json?.meta?.total}`)
  verificar('guardando cuantas filas dio', typeof historial.json?.datos?.[0]?.filas === 'number')
  verificar('y cuanto tardo', typeof historial.json?.datos?.[0]?.duracion_ms === 'number')

  const fallidos = await pedir('GET', '/api/reportes/historial?solo_errores=true', { ip, token })
  verificar('se pueden filtrar los que fallaron', fallidos.estado === 200)

  const suyo = await pedir('GET', '/api/reportes/historial', { ip, token: tokenGerente })
  verificar(
    'el gerente ve solo sus propias consultas',
    suyo.json?.datos?.every((h) => h.usuario.includes('Ventura')),
    JSON.stringify(suyo.json?.datos?.map((h) => h.usuario))
  )

  const csv = await fetch('http://localhost:8000/api/reportes/ventas_por_rango/csv', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Forwarded-For': ip,
    },
    body: JSON.stringify({ parametros: rango }),
  })
  // Se leen los BYTES y no el texto: fetch().text() decodifica en UTF-8 y se
  // come el BOM, asi que sobre la cadena no hay forma de comprobar que este.
  const bytes = new Uint8Array(await csv.arrayBuffer())
  const texto = new TextDecoder('utf-8').decode(bytes)

  verificar('el CSV se descarga', csv.status === 200, `estado ${csv.status}`)
  verificar(
    'con nombre de archivo',
    /attachment; filename=/.test(csv.headers.get('content-disposition') ?? ''),
    csv.headers.get('content-disposition')
  )
  verificar('separado por punto y coma, para Excel en espaniol', texto.includes(';'))
  verificar(
    'y con BOM para que Excel no rompa los acentos',
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
    `primeros bytes: ${bytes[0]} ${bytes[1]} ${bytes[2]}`
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  probarReportes()
    .then(() => process.exit(resumen()))
    .catch((e) => {
      console.error('\nLa prueba se corto:', e.message)
      process.exit(1)
    })
}
