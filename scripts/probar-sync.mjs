/**
 * Pruebas de sincronizacion por lote.
 *
 *   node scripts/probar-sync.mjs
 *
 * El caso que hay que demostrar es el que de verdad pasa en una tienda: dos
 * vendedoras sin conexion venden la ultima prenda. Las dos ventas son validas
 * cuando se registran; al volver la red, solo una puede entrar.
 *
 * Lo importante no es que la segunda falle —eso es inevitable— sino que quede
 * constancia en el servidor de que existio y de por que no entro. Antes ese
 * motivo vivia unicamente en el navegador de esa vendedora.
 */
import { pathToFileURL } from 'node:url'
import { pedir, resumen, sesionAdmin, sufijo, titulo, verificar } from './ayuda-pruebas.mjs'

const s = sufijo()
const semilla = [...s].reduce((a, c) => a + c.charCodeAt(0), 0)
const ip = `10.14.${(semilla >> 8) % 254}.${(semilla % 254) + 1}`

const CAT_VESTIDOS = 2
const PISO_CENTRO = 1
const SUCURSAL_CENTRO = 1

const ahora = () => new Date().toISOString()

export async function probarSync() {
  const admin = await sesionAdmin(ip)
  const token = admin.token

  // Una prenda con UNA sola unidad: es lo que crea el conflicto.
  const producto = await pedir('POST', '/api/catalogo/productos', {
    ip,
    token,
    cuerpo: {
      categoria_id: CAT_VESTIDOS,
      codigo: `SY-${s}`,
      nombre: `Vestido unico ${s}`,
      tipo_prenda: 'vestido',
      variantes: [
        { talla_id: 3, color_id: 1, sku: `SY-${s}-M`, precio_menor: 500, precio_mayor: 400 },
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
      stock_contado: 1,
      stock_minimo: 0,
      motivo: 'Queda una sola',
    },
  })

  const venta = (clave) => ({
    idempotency_key: clave,
    entidad: 'pedido',
    operacion: 'crear',
    creado_en_cliente: ahora(),
    payload: {
      canal: 'tienda',
      tipo_entrega: 'inmediata',
      sucursal_id: SUCURSAL_CENTRO,
      creado_offline: true,
      items: [{ variante_id: variante.id, cantidad: 1 }],
      pago: { metodo_pago_id: 1, monto: 500 },
    },
  })

  // --------------------------------------------------------------------------
  titulo('[S1] Hace falta identificar el equipo')

  const sinDispositivo = await pedir('POST', '/api/sync/lote', {
    ip,
    token,
    cuerpo: { operaciones: [venta(`sd-${s}`)] },
  })
  verificar(
    'sin la cabecera X-Dispositivo no se sincroniza',
    sinDispositivo.estado === 422,
    `estado ${sinDispositivo.estado}`
  )

  const clienta = await pedir('POST', '/api/auth/registro', {
    ip,
    cuerpo: {
      nombre: 'Clienta',
      apellido: 'Sync',
      email: `prueba+sy${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  const sinPermiso = await pedir('POST', '/api/sync/lote', {
    ip,
    token: clienta.json.datos.token,
    dispositivo: `disp-cliente-${s}`,
    cuerpo: { operaciones: [venta(`sp-${s}`)] },
  })
  verificar(
    'y sincronizar exige el mismo permiso que vender',
    sinPermiso.estado === 403,
    `estado ${sinPermiso.estado}`
  )

  // --------------------------------------------------------------------------
  titulo('[S2] La ultima prenda la gana quien vendio primero')

  const lote = await pedir('POST', '/api/sync/lote', {
    ip,
    token,
    dispositivo: `disp-caja1-${s}`,
    cuerpo: {
      operaciones: [venta(`ok-${s}`), venta(`tarde-${s}`)],
    },
  })

  verificar('el lote responde 200 aunque una falle', lote.estado === 200, `estado ${lote.estado}`)
  verificar('una entro', lote.json?.datos?.aplicadas === 1, `${lote.json?.datos?.aplicadas} aplicadas`)
  verificar('y la otra no', lote.json?.datos?.conflictos === 1, `${lote.json?.datos?.conflictos} conflictos`)

  const [primera, segunda] = lote.json.datos.resultados
  verificar('la PRIMERA es la que entra, no la que el azar decida', primera?.estado === 'aplicado', `${primera?.estado}`)
  verificar('y devuelve el numero de la venta', typeof primera?.resultado?.numero === 'string', JSON.stringify(primera?.resultado))
  verificar('la segunda queda en conflicto', segunda?.estado === 'conflicto', `${segunda?.estado}`)
  verificar(
    'con el motivo en palabras, no un codigo',
    (segunda?.error ?? '').length > 10,
    segunda?.error
  )
  verificar(
    'y el motivo habla de stock',
    /stock|disponible|hay/i.test(segunda?.error ?? ''),
    segunda?.error
  )

  const inventario = await pedir(
    'GET',
    `/api/inventario?variante_id=${variante.id}&sucursal_id=${SUCURSAL_CENTRO}`,
    { ip, token }
  )
  const fila = (inventario.json?.datos ?? []).find((i) => i.variante_id === variante.id)
  verificar(
    'no se vendio una prenda que no existia',
    Number(fila?.stock ?? 0) === 0,
    `stock ${fila?.stock}`
  )

  // --------------------------------------------------------------------------
  titulo('[S3] Queda constancia en el servidor')

  const registradas = await pedir('GET', '/api/sync/operaciones?por_pagina=50', { ip, token })
  const claves = (registradas.json?.datos ?? []).map((o) => o.idempotency_key)

  verificar('la venta que entro quedo registrada', claves.includes(`ok-${s}`))
  verificar(
    'y la que NO entro tambien: es el punto de todo esto',
    claves.includes(`tarde-${s}`),
    JSON.stringify(claves)
  )

  const laQueFallo = registradas.json.datos.find((o) => o.idempotency_key === `tarde-${s}`)
  verificar('con su estado', laQueFallo?.estado === 'conflicto', laQueFallo?.estado)
  verificar('su motivo', (laQueFallo?.error ?? '').length > 10, laQueFallo?.error)
  verificar(
    'un resumen legible, no el payload crudo',
    /articulo/i.test(laQueFallo?.resumen ?? ''),
    laQueFallo?.resumen
  )
  verificar('quien la vendio', (laQueFallo?.usuario ?? '').length > 0, laQueFallo?.usuario)
  verificar('y de que equipo salio', (laQueFallo?.dispositivo ?? '').length > 0, laQueFallo?.dispositivo)

  const cuenta = await pedir('GET', '/api/sync/conflictos', { ip, token })
  verificar('el mostrador puede saber cuantas quedaron sin aplicar', cuenta.json?.datos?.conflictos >= 1, `${cuenta.json?.datos?.conflictos}`)

  const filtradas = await pedir('GET', '/api/sync/operaciones?estado=conflicto', { ip, token })
  verificar(
    'y filtrarlas por estado',
    (filtradas.json?.datos ?? []).every((o) => o.estado === 'conflicto') &&
      (filtradas.json?.meta?.total ?? 0) >= 1
  )

  // --------------------------------------------------------------------------
  titulo('[S4] Reenviar el mismo lote no cobra dos veces')

  const reenvio = await pedir('POST', '/api/sync/lote', {
    ip,
    token,
    dispositivo: `disp-caja1-${s}`,
    cuerpo: { operaciones: [venta(`ok-${s}`), venta(`tarde-${s}`)] },
  })

  verificar('el reenvio responde igual', reenvio.estado === 200, `estado ${reenvio.estado}`)
  verificar(
    'y dice que ya las habia visto',
    reenvio.json?.datos?.resultados?.every((r) => r.repetida === true),
    JSON.stringify(reenvio.json?.datos?.resultados?.map((r) => r.repetida))
  )
  verificar(
    'la que habia entrado sigue aplicada',
    reenvio.json?.datos?.resultados?.[0]?.estado === 'aplicado'
  )
  verificar(
    'y la que no, sigue en conflicto',
    reenvio.json?.datos?.resultados?.[1]?.estado === 'conflicto'
  )

  const pedidosAhora = await pedir('GET', '/api/pedidos?por_pagina=100', { ip, token })
  const delLote = (pedidosAhora.json?.datos ?? []).filter(
    (p) => Number(p.total) === 500 && p.canal === 'tienda'
  )
  verificar(
    'no aparecio una venta duplicada',
    delLote.length === 1,
    `${delLote.length} ventas de 500 en mostrador`
  )

  const registroFinal = await pedir('GET', '/api/sync/operaciones?por_pagina=100', { ip, token })
  const repetidas = (registroFinal.json?.datos ?? []).filter(
    (o) => o.idempotency_key === `ok-${s}`
  )
  verificar('ni un registro duplicado de la operacion', repetidas.length === 1, `${repetidas.length}`)

  // --------------------------------------------------------------------------
  titulo('[S5] Lo que llega mal se rechaza, no se pone en conflicto')

  const malFormada = await pedir('POST', '/api/sync/lote', {
    ip,
    token,
    dispositivo: `disp-caja1-${s}`,
    cuerpo: {
      operaciones: [
        {
          idempotency_key: `mal-${s}`,
          entidad: 'pedido',
          operacion: 'crear',
          creado_en_cliente: ahora(),
          // Sin items: no es que el mundo cambio, es que la operacion esta mal.
          payload: { canal: 'tienda', tipo_entrega: 'inmediata', sucursal_id: SUCURSAL_CENTRO },
        },
      ],
    },
  })

  verificar(
    'una operacion mal formada no tumba el lote',
    malFormada.estado === 200,
    `estado ${malFormada.estado}`
  )
  verificar(
    'y se distingue de un conflicto: no hay nada que rehacer',
    malFormada.json?.datos?.resultados?.[0]?.estado === 'rechazado',
    malFormada.json?.datos?.resultados?.[0]?.estado
  )

  const entidadRara = await pedir('POST', '/api/sync/lote', {
    ip,
    token,
    dispositivo: `disp-caja1-${s}`,
    cuerpo: {
      operaciones: [
        {
          idempotency_key: `raro-${s}`,
          entidad: 'inventario',
          operacion: 'crear',
          creado_en_cliente: ahora(),
          payload: {},
        },
      ],
    },
  })
  verificar(
    'una entidad que no se sabe sincronizar se rechaza de entrada',
    entidadRara.estado === 422,
    `estado ${entidadRara.estado}`
  )

  // --------------------------------------------------------------------------
  titulo('[S6] Un conflicto no arrastra a los que vienen despues')

  // Se repone para que la tercera venta si pueda entrar.
  await pedir('POST', '/api/inventario/ajuste', {
    ip,
    token,
    cuerpo: {
      variante_id: variante.id,
      almacen_id: PISO_CENTRO,
      stock_contado: 1,
      stock_minimo: 0,
      motivo: 'Reposicion',
    },
  })

  const mezclado = await pedir('POST', '/api/sync/lote', {
    ip,
    token,
    dispositivo: `disp-caja2-${s}`,
    cuerpo: {
      operaciones: [
        {
          idempotency_key: `mal2-${s}`,
          entidad: 'pedido',
          operacion: 'crear',
          creado_en_cliente: ahora(),
          payload: { canal: 'tienda', tipo_entrega: 'inmediata', sucursal_id: SUCURSAL_CENTRO },
        },
        venta(`buena-${s}`),
      ],
    },
  })

  verificar(
    'la venta buena entra aunque la anterior haya fallado',
    mezclado.json?.datos?.aplicadas === 1,
    JSON.stringify(mezclado.json?.datos?.resultados?.map((r) => r.estado))
  )
  verificar(
    'y el orden de la respuesta es el del envio',
    mezclado.json?.datos?.resultados?.[0]?.idempotency_key === `mal2-${s}` &&
      mezclado.json?.datos?.resultados?.[1]?.idempotency_key === `buena-${s}`
  )

  // --------------------------------------------------------------------------
  titulo('[S7] El lote tiene tope')

  const enorme = await pedir('POST', '/api/sync/lote', {
    ip,
    token,
    dispositivo: `disp-caja1-${s}`,
    cuerpo: {
      operaciones: Array.from({ length: 51 }, (_, n) => venta(`masivo-${n}-${s}`)),
    },
  })
  verificar('mas de 50 operaciones se rechaza', enorme.estado === 422, `estado ${enorme.estado}`)

  const vacio = await pedir('POST', '/api/sync/lote', {
    ip,
    token,
    dispositivo: `disp-caja1-${s}`,
    cuerpo: { operaciones: [] },
  })
  verificar('y un lote vacio tambien', vacio.estado === 422, `estado ${vacio.estado}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  probarSync()
    .then(() => process.exit(resumen()))
    .catch((e) => {
      console.error('\nLa prueba se corto:', e.message)
      process.exit(1)
    })
}
