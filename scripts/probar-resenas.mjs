/**
 * Pruebas de resenias.
 *
 *   node scripts/probar-resenas.mjs
 *
 * Lo que hay que demostrar es que nadie puede calificar lo que no compro. Es la
 * unica propiedad que hace que una estrella signifique algo: un catalogo donde
 * cualquiera pone cinco no informa nada, y uno donde cualquiera pone una es una
 * herramienta de sabotaje.
 */
import { pathToFileURL } from 'node:url'
import { pedir, resumen, sesionAdmin, sufijo, titulo, verificar } from './ayuda-pruebas.mjs'

const s = sufijo()

// IP propia por corrida: el limitador de intentos vive en memoria de la API y
// aca se registran varias clientas seguidas.
const semilla = [...s].reduce((a, c) => a + c.charCodeAt(0), 0)
const ip = `10.11.${(semilla >> 8) % 254}.${(semilla % 254) + 1}`

const CAT_VESTIDOS = 2
const PISO_CENTRO = 1
const SUCURSAL_CENTRO = 1

async function clienta(nombre) {
  const email = `prueba+rs${nombre}${s}@aurora.bo`
  const r = await pedir('POST', '/api/auth/registro', {
    ip,
    cuerpo: { nombre: `Clienta${nombre}`, apellido: 'Resenia', email, password: 'ClaveSegura123' },
  })
  return { token: r.json.datos.token, email }
}

/** Crea un pedido y lo lleva hasta el estado pedido. */
async function comprar(token, varianteId, adminToken, hasta) {
  const pedido = await pedir('POST', '/api/pedidos', {
    ip,
    token,
    cuerpo: {
      canal: 'online',
      tipo_entrega: 'recojo_tienda',
      sucursal_id: SUCURSAL_CENTRO,
      items: [{ variante_id: varianteId, cantidad: 1 }],
    },
  })

  const id = pedido.json?.datos?.id
  if (!id) throw new Error(`no se pudo comprar: ${JSON.stringify(pedido.json)}`)

  for (const estado of ['pagado', 'preparando', 'listo', 'entregado']) {
    await pedir('POST', `/api/pedidos/${id}/estado`, {
      ip,
      token: adminToken,
      cuerpo: { estado },
    })
    if (estado === hasta) break
  }

  return id
}

export async function probarResenas() {
  const admin = await sesionAdmin(ip)
  const token = admin.token

  // Dos productos: uno para opinar y otro para intentar opinar sin haberlo
  // comprado, que es el caso que importa.
  const crear = async (sufijoNombre) => {
    const r = await pedir('POST', '/api/catalogo/productos', {
      ip,
      token,
      cuerpo: {
        categoria_id: CAT_VESTIDOS,
        codigo: `RS-${sufijoNombre}-${s}`,
        nombre: `Vestido ${sufijoNombre} ${s}`,
        tipo_prenda: 'vestido',
        variantes: [
          {
            talla_id: 3,
            color_id: 1,
            sku: `RS-${sufijoNombre}-${s}-M`,
            precio_menor: 400,
            precio_mayor: 320,
          },
        ],
      },
    })
    const variante = r.json.datos.variantes[0]
    await pedir('POST', '/api/inventario/ajuste', {
      ip,
      token,
      cuerpo: {
        variante_id: variante.id,
        almacen_id: PISO_CENTRO,
        stock_contado: 20,
        stock_minimo: 2,
        motivo: 'Carga para resenias',
      },
    })
    return { id: r.json.datos.id, variante }
  }

  const comprado = await crear('comprado')
  const ajeno = await crear('ajeno')

  const ana = await clienta('Ana')
  const beti = await clienta('Beti')

  // --------------------------------------------------------------------------
  titulo('[R1] Solo opina quien compro y recibio')

  const pedidoAna = await comprar(ana.token, comprado.variante.id, token, 'entregado')

  const sinComprar = await pedir('POST', '/api/resenas', {
    ip,
    token: beti.token,
    cuerpo: { producto_id: comprado.id, pedido_id: pedidoAna, calificacion: 1 },
  })
  verificar(
    'no se puede opinar con el pedido de otra persona',
    sinComprar.estado === 404,
    `estado ${sinComprar.estado}`
  )

  const otroProducto = await pedir('POST', '/api/resenas', {
    ip,
    token: ana.token,
    cuerpo: { producto_id: ajeno.id, pedido_id: pedidoAna, calificacion: 5 },
  })
  verificar(
    'ni sobre una prenda que ese pedido no incluia',
    otroProducto.estado === 409,
    `estado ${otroProducto.estado}`
  )

  const pedidoSinEntregar = await comprar(beti.token, comprado.variante.id, token, 'pagado')
  const antesDeRecibir = await pedir('POST', '/api/resenas', {
    ip,
    token: beti.token,
    cuerpo: { producto_id: comprado.id, pedido_id: pedidoSinEntregar, calificacion: 5 },
  })
  verificar(
    'ni antes de que la prenda llegue',
    antesDeRecibir.estado === 409,
    `estado ${antesDeRecibir.estado}`
  )

  const delPersonal = await pedir('GET', '/api/resenas/pendientes', { ip, token })
  verificar(
    'el personal de tienda no opina: no compra aca',
    delPersonal.estado === 403,
    `estado ${delPersonal.estado}`
  )

  // --------------------------------------------------------------------------
  titulo('[R2] Opinar de verdad')

  const pendientes = await pedir('GET', '/api/resenas/pendientes', { ip, token: ana.token })
  verificar('la tienda sabe sobre que puede opinar', (pendientes.json?.datos?.length ?? 0) >= 1)
  verificar(
    'y trae la talla que compro, para no tener que preguntarsela',
    pendientes.json?.datos?.[0]?.talla_comprada === 'M',
    pendientes.json?.datos?.[0]?.talla_comprada
  )

  const primera = await pedir('POST', '/api/resenas', {
    ip,
    token: ana.token,
    cuerpo: {
      producto_id: comprado.id,
      pedido_id: pedidoAna,
      calificacion: 5,
      ajuste_real: 'justa',
    },
  })
  verificar('una calificacion sin comentario se registra', primera.estado === 201, `estado ${primera.estado}`)
  verificar(
    'y se publica sola: un numero del 1 al 5 no tiene nada que moderar',
    primera.json?.datos?.aprobado === true
  )
  verificar(
    'la talla sale del pedido, no de lo que mande el cliente',
    primera.json?.datos?.talla_comprada === 'M',
    primera.json?.datos?.talla_comprada
  )
  verificar(
    'se publica solo el nombre de pila',
    primera.json?.datos?.autora === 'ClientaAna' &&
      !JSON.stringify(primera.json.datos).includes('Resenia'),
    primera.json?.datos?.autora
  )

  const repetida = await pedir('POST', '/api/resenas', {
    ip,
    token: ana.token,
    cuerpo: { producto_id: comprado.id, pedido_id: pedidoAna, calificacion: 1 },
  })
  verificar('no se puede opinar dos veces del mismo pedido', repetida.estado === 409, `estado ${repetida.estado}`)

  const yaNoPendiente = await pedir('GET', '/api/resenas/pendientes', { ip, token: ana.token })
  verificar(
    'y deja de ofrecerse como pendiente',
    (yaNoPendiente.json?.datos ?? []).every((c) => c.producto_id !== comprado.id)
  )

  // --------------------------------------------------------------------------
  titulo('[R3] La estrella de la ficha sale de las resenias')

  const ficha = await pedir('GET', `/api/catalogo/productos/vestido-comprado-${s}`, { ip })
  verificar(
    'el promedio del producto se recalculo',
    Number(ficha.json?.datos?.calificacion) === 5,
    `calificacion ${ficha.json?.datos?.calificacion}`
  )

  const resum = await pedir('GET', `/api/resenas/resumen/${comprado.id}`, { ip })
  verificar('el resumen es publico', resum.estado === 200, `estado ${resum.estado}`)
  verificar('con el promedio', resum.json?.datos?.promedio === 5)
  verificar('el reparto por estrellas', resum.json?.datos?.reparto?.['5'] === 1)
  verificar(
    'y lo que dice la gente del talle, que es lo que mas se pregunta',
    resum.json?.datos?.ajuste?.justa === 1,
    JSON.stringify(resum.json?.datos?.ajuste)
  )

  // --------------------------------------------------------------------------
  titulo('[R4] El comentario espera revision')

  // Beti recibe su pedido y opina con texto.
  await pedir('POST', `/api/pedidos/${pedidoSinEntregar}/estado`, {
    ip,
    token,
    cuerpo: { estado: 'preparando' },
  })
  await pedir('POST', `/api/pedidos/${pedidoSinEntregar}/estado`, {
    ip,
    token,
    cuerpo: { estado: 'listo' },
  })
  await pedir('POST', `/api/pedidos/${pedidoSinEntregar}/estado`, {
    ip,
    token,
    cuerpo: { estado: 'entregado' },
  })

  const conTexto = await pedir('POST', '/api/resenas', {
    ip,
    token: beti.token,
    cuerpo: {
      producto_id: comprado.id,
      pedido_id: pedidoSinEntregar,
      calificacion: 1,
      comentario: 'Llamame al 70000000 que te vendo lo mismo mas barato',
      ajuste_real: 'pequena',
    },
  })
  verificar('una resenia con comentario se registra', conTexto.estado === 201, `estado ${conTexto.estado}`)
  verificar(
    'pero NO se publica hasta que alguien la lea',
    conTexto.json?.datos?.aprobado === false
  )

  const publicas = await pedir('GET', `/api/resenas?producto_id=${comprado.id}`, { ip })
  verificar(
    'no aparece en el listado publico',
    (publicas.json?.datos ?? []).every((r) => r.comentario === null),
    JSON.stringify(publicas.json?.datos?.map((r) => r.comentario))
  )

  const promedioIntacto = await pedir('GET', `/api/resenas/resumen/${comprado.id}`, { ip })
  verificar(
    'ni mueve la estrella de la ficha antes de ser leida',
    promedioIntacto.json?.datos?.promedio === 5,
    `promedio ${promedioIntacto.json?.datos?.promedio}`
  )

  const sinPermiso = await pedir('GET', '/api/resenas?pendientes=true', { ip, token: ana.token })
  verificar(
    'una clienta no puede espiar las que esperan revision',
    sinPermiso.estado === 403,
    `estado ${sinPermiso.estado}`
  )

  const paraModerar = await pedir('GET', '/api/resenas?pendientes=true', { ip, token })
  verificar('quien modera si las ve', (paraModerar.json?.meta?.total ?? 0) >= 1)

  const rechazo = await pedir('PUT', `/api/resenas/${conTexto.json.datos.id}/moderar`, {
    ip,
    token,
    cuerpo: { aprobada: false },
  })
  verificar('se puede rechazar', rechazo.estado === 200, `estado ${rechazo.estado}`)

  const despues = await pedir('GET', `/api/resenas/resumen/${comprado.id}`, { ip })
  verificar(
    'y la estrella sigue siendo la de las resenias buenas',
    despues.json?.datos?.promedio === 5 && despues.json?.datos?.total === 1,
    `promedio ${despues.json?.datos?.promedio}, total ${despues.json?.datos?.total}`
  )

  // --- Aprobar una que si corresponde ---
  const cata = await clienta('Cata')
  const pedidoCata = await comprar(cata.token, comprado.variante.id, token, 'entregado')

  const buena = await pedir('POST', '/api/resenas', {
    ip,
    token: cata.token,
    cuerpo: {
      producto_id: comprado.id,
      pedido_id: pedidoCata,
      calificacion: 3,
      comentario: 'La tela es linda pero el largo me quedo corto',
      ajuste_real: 'pequena',
    },
  })

  await pedir('PUT', `/api/resenas/${buena.json.datos.id}/moderar`, {
    ip,
    token,
    cuerpo: { aprobada: true },
  })

  const final = await pedir('GET', `/api/resenas/resumen/${comprado.id}`, { ip })
  verificar(
    'al aprobarla, entra al promedio',
    final.json?.datos?.total === 2 && final.json?.datos?.promedio === 4,
    `promedio ${final.json?.datos?.promedio}, total ${final.json?.datos?.total}`
  )

  const conComentario = await pedir('GET', `/api/resenas?producto_id=${comprado.id}`, { ip })
  verificar(
    'y ahora si se lee en la ficha',
    (conComentario.json?.datos ?? []).some((r) => r.comentario?.includes('largo')),
    JSON.stringify(conComentario.json?.datos?.map((r) => r.comentario))
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  probarResenas()
    .then(() => process.exit(resumen()))
    .catch((e) => {
      console.error('\nLa prueba se corto:', e.message)
      process.exit(1)
    })
}
