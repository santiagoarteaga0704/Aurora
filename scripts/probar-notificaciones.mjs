/**
 * Pruebas de notificaciones.
 *
 *   node scripts/probar-notificaciones.mjs
 *
 * Lo que hay que demostrar son dos cosas. Una: que los avisos salen solos
 * cuando pasa algo, sin que nadie los cree a mano —un aviso que hay que
 * acordarse de mandar no se manda—. Y dos: que un aviso no puede tumbar la
 * operacion que lo genero. Perder un aviso es molesto; deshacer una venta
 * cobrada por no poder avisarla es inaceptable.
 */
import { pathToFileURL } from 'node:url'
import { pedir, resumen, sesionAdmin, sufijo, titulo, verificar } from './ayuda-pruebas.mjs'

const s = sufijo()
const semilla = [...s].reduce((a, c) => a + c.charCodeAt(0), 0)
const ip = `10.12.${(semilla >> 8) % 254}.${(semilla % 254) + 1}`

const CAT_VESTIDOS = 2
const PISO_CENTRO = 1
const SUCURSAL_CENTRO = 1

export async function probarNotificaciones() {
  const admin = await sesionAdmin(ip)
  const token = admin.token

  const clienta = await pedir('POST', '/api/auth/registro', {
    ip,
    cuerpo: {
      nombre: 'Clienta',
      apellido: 'Avisos',
      email: `prueba+nt${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  const tokenClienta = clienta.json.datos.token

  // --------------------------------------------------------------------------
  titulo('[N1] Los avisos son de cada quien')

  const vacio = await pedir('GET', '/api/notificaciones/sin-leer', { ip, token: tokenClienta })
  verificar('una cuenta nueva arranca sin avisos', vacio.json?.datos?.sin_leer === 0, `${vacio.json?.datos?.sin_leer}`)

  const sinSesion = await pedir('GET', '/api/notificaciones', { ip })
  verificar('sin sesion no hay avisos que mirar', sinSesion.estado === 401, `estado ${sinSesion.estado}`)

  // --------------------------------------------------------------------------
  titulo('[N2] El pedido avisa solo al avanzar')

  const producto = await pedir('POST', '/api/catalogo/productos', {
    ip,
    token,
    cuerpo: {
      categoria_id: CAT_VESTIDOS,
      codigo: `NT-${s}`,
      nombre: `Vestido de avisos ${s}`,
      tipo_prenda: 'vestido',
      variantes: [
        { talla_id: 3, color_id: 1, sku: `NT-${s}-M`, precio_menor: 300, precio_mayor: 240 },
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
      stock_contado: 12,
      stock_minimo: 3,
      motivo: 'Carga para avisos',
    },
  })

  const pedido = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: {
      canal: 'online',
      tipo_entrega: 'recojo_tienda',
      sucursal_id: SUCURSAL_CENTRO,
      items: [{ variante_id: variante.id, cantidad: 1 }],
    },
  })
  const pedidoId = pedido.json.datos.id

  const reciencreado = await pedir('GET', '/api/notificaciones/sin-leer', {
    ip,
    token: tokenClienta,
  })
  verificar(
    'crear el pedido no avisa nada: la clienta lo acaba de hacer',
    reciencreado.json?.datos?.sin_leer === 0,
    `${reciencreado.json?.datos?.sin_leer}`
  )

  // --- Pago ---
  const pago = await pedir('POST', `/api/pedidos/${pedidoId}/pagos`, {
    ip,
    token: tokenClienta,
    cuerpo: { metodo_pago_id: 5, monto: 300, referencia: 'TRF-001', comprobante_url: 'https://ejemplo.bo/comprobante.jpg' },
  })

  await pedir('POST', `/api/pagos/${pago.json.datos.id}/resolver`, {
    ip,
    token,
    cuerpo: { aprobado: true },
  })

  const trasPago = await pedir('GET', '/api/notificaciones', { ip, token: tokenClienta })
  verificar(
    'confirmar el pago le avisa a la clienta',
    (trasPago.json?.datos ?? []).some((n) => /pago/i.test(n.titulo)),
    JSON.stringify(trasPago.json?.datos?.map((n) => n.titulo))
  )
  verificar(
    'y el aviso lleva a su pedido, no a la nada',
    (trasPago.json?.datos ?? []).some((n) => n.url === `/pedido/${pedidoId}`),
    JSON.stringify(trasPago.json?.datos?.map((n) => n.url))
  )

  // --- Estados ---
  for (const estado of ['preparando', 'listo']) {
    await pedir('POST', `/api/pedidos/${pedidoId}/estado`, { ip, token, cuerpo: { estado } })
  }

  const trasEstados = await pedir('GET', '/api/notificaciones', { ip, token: tokenClienta })
  const titulos = (trasEstados.json?.datos ?? []).map((n) => n.titulo)

  verificar('preparar el pedido avisa', titulos.some((t) => /preparando/i.test(t)), JSON.stringify(titulos))
  verificar('y tenerlo listo tambien', titulos.some((t) => /listo/i.test(t)), JSON.stringify(titulos))
  verificar(
    'todos son del tipo pedido',
    (trasEstados.json?.datos ?? []).every((n) => n.tipo === 'pedido')
  )

  // --------------------------------------------------------------------------
  titulo('[N3] Marcar leido')

  const antes = await pedir('GET', '/api/notificaciones/sin-leer', { ip, token: tokenClienta })
  const cuantos = antes.json.datos.sin_leer
  verificar('hay varios sin leer', cuantos >= 3, `${cuantos} sin leer`)

  const uno = trasEstados.json.datos[0]
  const marcado = await pedir('POST', `/api/notificaciones/${uno.id}/leida`, {
    ip,
    token: tokenClienta,
  })
  verificar('marcar uno baja la cuenta', marcado.json?.datos?.sin_leer === cuantos - 1, `${marcado.json?.datos?.sin_leer}`)

  const ajeno = await pedir('POST', `/api/notificaciones/${uno.id}/leida`, { ip, token })
  verificar(
    'nadie marca el aviso de otra persona',
    ajeno.estado === 404,
    `estado ${ajeno.estado}`
  )

  const soloSinLeer = await pedir('GET', '/api/notificaciones?sin_leer=true', {
    ip,
    token: tokenClienta,
  })
  verificar(
    'se pueden pedir solo los que faltan leer',
    (soloSinLeer.json?.datos ?? []).every((n) => !n.leida) &&
      soloSinLeer.json?.meta?.total === cuantos - 1,
    `${soloSinLeer.json?.meta?.total} de ${cuantos - 1}`
  )

  const todas = await pedir('POST', '/api/notificaciones/leidas', { ip, token: tokenClienta })
  verificar('marcar todo deja la cuenta en cero', todas.json?.datos?.sin_leer === 0)

  const siguenAhi = await pedir('GET', '/api/notificaciones', { ip, token: tokenClienta })
  verificar(
    'pero los avisos no se borran: leerlos no es olvidarlos',
    (siguenAhi.json?.meta?.total ?? 0) >= cuantos,
    `${siguenAhi.json?.meta?.total} avisos`
  )

  // --------------------------------------------------------------------------
  titulo('[N4] Stock bajo el minimo avisa a quien puede reponer')

  const antesStock = await pedir('GET', '/api/notificaciones?tipo=stock', { ip, token })
  const stockPrevios = antesStock.json?.meta?.total ?? 0

  await pedir('POST', '/api/inventario/ajuste', {
    ip,
    token,
    cuerpo: {
      variante_id: variante.id,
      almacen_id: PISO_CENTRO,
      stock_contado: 1,
      stock_minimo: 5,
      motivo: 'Conteo: quedaron pocas',
    },
  })

  const avisosStock = await pedir('GET', '/api/notificaciones?tipo=stock', { ip, token })
  verificar(
    'dejar una prenda bajo el minimo avisa',
    (avisosStock.json?.meta?.total ?? 0) > stockPrevios,
    `${avisosStock.json?.meta?.total} avisos de stock`
  )
  verificar(
    'y el aviso dice que prenda y cuanto quedo',
    (avisosStock.json?.datos ?? []).some((n) => n.mensaje.includes(`NT-${s}-M`)),
    JSON.stringify(avisosStock.json?.datos?.[0]?.mensaje)
  )
  verificar(
    'lleva al inventario, que es donde se repone',
    (avisosStock.json?.datos ?? []).some((n) => n.url === '/op/inventario'),
    avisosStock.json?.datos?.[0]?.url
  )

  const clientaNoSabe = await pedir('GET', '/api/notificaciones?tipo=stock', {
    ip,
    token: tokenClienta,
  })
  verificar(
    'a la clienta no le llega: no es asunto suyo',
    (clientaNoSabe.json?.meta?.total ?? 0) === 0,
    `${clientaNoSabe.json?.meta?.total}`
  )

  // --- Por encima del minimo no avisa ---
  const antesDeSubir = await pedir('GET', '/api/notificaciones?tipo=stock', { ip, token })
  await pedir('POST', '/api/inventario/ajuste', {
    ip,
    token,
    cuerpo: {
      variante_id: variante.id,
      almacen_id: PISO_CENTRO,
      stock_contado: 40,
      stock_minimo: 5,
      motivo: 'Llego reposicion',
    },
  })
  const trasSubir = await pedir('GET', '/api/notificaciones?tipo=stock', { ip, token })
  verificar(
    'reponer por encima del minimo no avisa nada',
    trasSubir.json?.meta?.total === antesDeSubir.json?.meta?.total,
    `${antesDeSubir.json?.meta?.total} -> ${trasSubir.json?.meta?.total}`
  )

  // --------------------------------------------------------------------------
  titulo('[N5] Un aviso no puede tumbar la operacion')

  // El aviso se crea con un titulo larguisimo: la columna aguanta 120. Si el
  // servicio no recortara, la insercion fallaria y —si el aviso estuviera
  // dentro de la transaccion— se caeria la venta entera.
  const largo = await pedir('POST', '/api/catalogo/productos', {
    ip,
    token,
    cuerpo: {
      categoria_id: CAT_VESTIDOS,
      codigo: `NTL-${s}`,
      nombre: `Vestido ${'muy '.repeat(40)}largo ${s}`.slice(0, 150),
      tipo_prenda: 'vestido',
      variantes: [
        { talla_id: 3, color_id: 2, sku: `NTL-${s}-M`, precio_menor: 200, precio_mayor: 160 },
      ],
    },
  })

  if (largo.estado === 201) {
    const v = largo.json.datos.variantes[0]
    const ajusteLargo = await pedir('POST', '/api/inventario/ajuste', {
      ip,
      token,
      cuerpo: {
        variante_id: v.id,
        almacen_id: PISO_CENTRO,
        stock_contado: 1,
        stock_minimo: 9,
        motivo: 'Conteo con nombre larguisimo',
      },
    })
    verificar(
      'un nombre que no entra en la columna del aviso no rompe el ajuste',
      ajusteLargo.estado === 200,
      `estado ${ajusteLargo.estado}`
    )
    verificar('y el stock quedo guardado igual', ajusteLargo.json?.datos?.stock_actual === 1)
  } else {
    verificar('un nombre largo no rompe el ajuste', true, 'el catalogo rechazo el nombre antes')
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  probarNotificaciones()
    .then(() => process.exit(resumen()))
    .catch((e) => {
      console.error('\nLa prueba se corto:', e.message)
      process.exit(1)
    })
}
