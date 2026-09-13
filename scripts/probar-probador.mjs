/**
 * Pruebas del probador virtual.
 *
 *   node scripts/probar-probador.mjs
 *
 * Lo que hay que demostrar no es que el endpoint responda 200, sino que la
 * talla que devuelve sea la correcta. Por eso casi todos los casos parten de
 * medidas elegidas contra la guia sembrada: se sabe de antemano que talla tiene
 * que salir, y si sale otra la prueba falla.
 */
import { pathToFileURL } from 'node:url'
import { pedir, resumen, sesionAdmin, sufijo, titulo, verificar } from './ayuda-pruebas.mjs'

const s = sufijo()

/**
 * IP distinta en cada corrida.
 *
 * El limitador de intentos de la API vive en memoria del proceso y se lleva la
 * cuenta por IP, asi que recargar la base no lo limpia: con una IP fija, la
 * segunda corrida seguida de esta suite se choca contra un 429 antes del primer
 * `verificar`. Como aqui se registran seis clientas, se topa enseguida.
 *
 * Derivarla del sufijo la hace unica por corrida sin volverla azarosa: si una
 * prueba falla, el numero que salio en la salida es reproducible.
 */
const semilla = [...s].reduce((a, c) => a + c.charCodeAt(0), 0)
const ip = `10.9.${(semilla >> 8) % 254}.${(semilla % 254) + 1}`

const CAT_VESTIDOS = 2
const CAT_PANTALONES = 4
const PISO_CENTRO = 1
const SUCURSAL_CENTRO = 1

/** Crea una clienta con sesion propia. */
async function clienta(nombre) {
  const email = `prueba+pb${nombre}${s}@aurora.bo`
  const r = await pedir('POST', '/api/auth/registro', {
    ip,
    cuerpo: { nombre: 'Clienta', apellido: nombre, email, password: 'ClaveSegura123' },
  })
  return { token: r.json.datos.token, email }
}

export async function probarProbador() {
  const admin = await sesionAdmin(ip)
  const token = admin.token

  // --------------------------------------------------------------------------
  titulo('[P1] Las medidas son de quien las carga')

  const ana = await clienta('Ana')
  const beti = await clienta('Beti')

  const sinCargar = await pedir('GET', '/api/probador/mis-medidas', { ip, token: ana.token })
  verificar('sin medidas cargadas responde vacio, no error', sinCargar.estado === 200, `estado ${sinCargar.estado}`)
  verificar('y el cuerpo es null', sinCargar.json?.datos === null)

  // Medidas de la talla M de vestidos: busto 88-93, cintura 70-75, cadera 96-101.
  const medidasM = { altura_cm: 165, peso_kg: 60, busto_cm: 90, cintura_cm: 72, cadera_cm: 98 }

  const guardar = await pedir('PUT', '/api/probador/mis-medidas', {
    ip,
    token: ana.token,
    cuerpo: medidasM,
  })
  verificar('se guardan las medidas', guardar.estado === 200, `estado ${guardar.estado}`)
  verificar('y quedan marcadas como propias, no estimadas', guardar.json?.datos?.origen === 'manual', guardar.json?.datos?.origen)
  verificar('sin nada estimado', (guardar.json?.datos?.estimadas?.length ?? -1) === 0)

  const deBeti = await pedir('GET', '/api/probador/mis-medidas', { ip, token: beti.token })
  verificar(
    'otra clienta no ve las medidas de Ana',
    deBeti.json?.datos === null,
    JSON.stringify(deBeti.json?.datos)
  )

  const delPersonal = await pedir('GET', '/api/probador/mis-medidas', { ip, token })
  verificar(
    'el personal de tienda no tiene medidas y se le dice',
    delPersonal.estado === 403,
    `estado ${delPersonal.estado}`
  )

  // --------------------------------------------------------------------------
  titulo('[P2] La talla que sale es la que corresponde')

  const exacta = await pedir('GET', `/api/probador/mi-talla/${CAT_VESTIDOS}`, { ip, token: ana.token })
  verificar('con medidas de M, recomienda M', exacta.json?.datos?.talla === 'M', `dio ${exacta.json?.datos?.talla}`)
  verificar('sin desvio, no ofrece alternativa', exacta.json?.datos?.alternativa === null)
  verificar(
    'y con confianza alta',
    (exacta.json?.datos?.confianza ?? 0) >= 0.9,
    `confianza ${exacta.json?.datos?.confianza}`
  )
  verificar(
    'diciendo en palabras de donde sale',
    (exacta.json?.datos?.motivo ?? '').includes('M'),
    exacta.json?.datos?.motivo
  )

  // La misma clienta en pantalones: la guia mira cintura y cadera, no busto.
  const pantalon = await pedir('GET', `/api/probador/mi-talla/${CAT_PANTALONES}`, {
    ip,
    token: ana.token,
  })
  verificar(
    'la misma clienta puede ser otra talla en otra categoria',
    pantalon.estado === 200 && typeof pantalon.json?.datos?.talla === 'string',
    `dio ${pantalon.json?.datos?.talla}`
  )

  // --- Entre dos tallas ---
  // Busto 82.5 cae en el hueco entre XS (78-82) y S (83-87).
  const entre = await clienta('Entre')
  await pedir('PUT', '/api/probador/mis-medidas', {
    ip,
    token: entre.token,
    cuerpo: { altura_cm: 160, peso_kg: 52, busto_cm: 82.5, cintura_cm: 64.5, cadera_cm: 90.5 },
  })
  const rEntre = await pedir('GET', `/api/probador/mi-talla/${CAT_VESTIDOS}`, {
    ip,
    token: entre.token,
  })
  verificar(
    'un cuerpo entre dos tallas recibe una y la alternativa',
    rEntre.json?.datos?.alternativa !== null,
    `talla ${rEntre.json?.datos?.talla}, alternativa ${rEntre.json?.datos?.alternativa?.talla}`
  )
  verificar(
    'y con menos confianza que una talla exacta',
    (rEntre.json?.datos?.confianza ?? 1) < (exacta.json?.datos?.confianza ?? 0),
    `${rEntre.json?.datos?.confianza} vs ${exacta.json?.datos?.confianza}`
  )
  verificar(
    'y se dice que esta entre dos',
    /entre dos/i.test(rEntre.json?.datos?.motivo ?? ''),
    rEntre.json?.datos?.motivo
  )

  // --- Fuera de la guia ---
  const fuera = await clienta('Fuera')
  await pedir('PUT', '/api/probador/mis-medidas', {
    ip,
    token: fuera.token,
    cuerpo: { altura_cm: 150, peso_kg: 40, busto_cm: 66, cintura_cm: 50, cadera_cm: 70 },
  })
  const rFuera = await pedir('GET', `/api/probador/mi-talla/${CAT_VESTIDOS}`, {
    ip,
    token: fuera.token,
  })
  verificar(
    'un cuerpo fuera de la guia igual recibe la talla mas cercana',
    rFuera.json?.datos?.talla === 'XS',
    `dio ${rFuera.json?.datos?.talla}`
  )
  verificar(
    'pero se avisa que quedo fuera de la guia',
    /fuera de la guia/i.test(rFuera.json?.datos?.motivo ?? ''),
    rFuera.json?.datos?.motivo
  )
  verificar(
    'y la confianza se desploma',
    (rFuera.json?.datos?.confianza ?? 1) < 0.5,
    `confianza ${rFuera.json?.datos?.confianza}`
  )

  // --------------------------------------------------------------------------
  titulo('[P3] Medidas estimadas: se estiman y se avisa')

  const estimada = await clienta('Estimada')
  const soloAlturaPeso = await pedir('PUT', '/api/probador/mis-medidas', {
    ip,
    token: estimada.token,
    cuerpo: { altura_cm: 165, peso_kg: 60 },
  })
  verificar('acepta solo altura y peso', soloAlturaPeso.estado === 200, `estado ${soloAlturaPeso.estado}`)
  verificar(
    'completa las tres medidas que faltaban',
    (soloAlturaPeso.json?.datos?.estimadas?.length ?? 0) === 3,
    JSON.stringify(soloAlturaPeso.json?.datos?.estimadas)
  )
  verificar(
    'y lo marca como estimado, no como si la clienta lo hubiera medido',
    soloAlturaPeso.json?.datos?.origen === 'estimado',
    soloAlturaPeso.json?.datos?.origen
  )

  // 165 cm y 60 kg es la referencia con la que se calibro: cintura ~70 cm.
  const cintura = soloAlturaPeso.json?.datos?.cintura_cm
  verificar(
    'la cintura estimada es creible',
    cintura >= 66 && cintura <= 74,
    `estimo ${cintura} cm`
  )

  const rEstimada = await pedir('GET', `/api/probador/mi-talla/${CAT_VESTIDOS}`, {
    ip,
    token: estimada.token,
  })
  verificar(
    'recomienda igual',
    typeof rEstimada.json?.datos?.talla === 'string',
    `dio ${rEstimada.json?.datos?.talla}`
  )
  verificar(
    'pero con menos confianza que la que midio de verdad',
    (rEstimada.json?.datos?.confianza ?? 1) < (exacta.json?.datos?.confianza ?? 0),
    `${rEstimada.json?.datos?.confianza} vs ${exacta.json?.datos?.confianza}`
  )
  verificar(
    'y lo dice',
    /estimadas/i.test(rEstimada.json?.datos?.motivo ?? ''),
    rEstimada.json?.datos?.motivo
  )

  // --------------------------------------------------------------------------
  titulo('[P4] No se recomienda sobre un disparate')

  for (const [campo, cuerpo] of [
    ['altura', { altura_cm: 40, peso_kg: 60 }],
    ['peso', { altura_cm: 165, peso_kg: 900 }],
    ['cintura', { altura_cm: 165, peso_kg: 60, cintura_cm: 400 }],
  ]) {
    const r = await pedir('PUT', '/api/probador/mis-medidas', { ip, token: ana.token, cuerpo })
    verificar(`rechaza ${campo} imposible`, r.estado === 422, `estado ${r.estado}`)
  }

  const siguenLasDeAntes = await pedir('GET', '/api/probador/mis-medidas', { ip, token: ana.token })
  verificar(
    'y las medidas buenas siguen intactas',
    siguenLasDeAntes.json?.datos?.busto_cm === 90,
    `busto ${siguenLasDeAntes.json?.datos?.busto_cm}`
  )

  // --------------------------------------------------------------------------
  titulo('[P5] Avatar')

  const avatar = await pedir('GET', '/api/probador/mi-avatar', { ip, token: ana.token })
  verificar('el avatar se arma solo al guardar medidas', avatar.json?.datos !== null)
  verificar(
    'con un tipo de cuerpo reconocido',
    ['reloj_arena', 'triangulo', 'triangulo_invertido', 'rectangulo', 'ovalado'].includes(
      avatar.json?.datos?.tipo_cuerpo
    ),
    avatar.json?.datos?.tipo_cuerpo
  )
  verificar(
    'y proporciones normalizadas, no centimetros',
    (avatar.json?.datos?.parametros?.cadera ?? 9) < 1,
    JSON.stringify(avatar.json?.datos?.parametros)
  )
  verificar(
    'la cadera es mas ancha que la cintura, como en el cuerpo que describe',
    avatar.json?.datos?.parametros?.cadera > avatar.json?.datos?.parametros?.cintura
  )

  // --------------------------------------------------------------------------
  titulo('[P6] La prueba se registra y alimenta el reporte')

  // Un producto con stock para probar y comprar.
  const producto = await pedir('POST', '/api/catalogo/productos', {
    ip,
    token,
    cuerpo: {
      categoria_id: CAT_VESTIDOS,
      codigo: `PB-${s}`,
      nombre: `Vestido del probador ${s}`,
      tipo_prenda: 'vestido',
      variantes: [
        { talla_id: 3, color_id: 1, sku: `PB-${s}-M-NE`, precio_menor: 500, precio_mayor: 400 },
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
      stock_contado: 10,
      stock_minimo: 2,
      motivo: 'Carga para el probador',
    },
  })

  const conStock = await pedir(
    'GET',
    `/api/probador/mi-talla/${CAT_VESTIDOS}?producto_id=${producto.json.datos.id}`,
    { ip, token: ana.token }
  )
  verificar(
    'al mirar un producto se informa si esa talla esta disponible',
    conStock.json?.datos?.hay_stock === true,
    `hay_stock ${conStock.json?.datos?.hay_stock}`
  )
  verificar('y con que variante', conStock.json?.datos?.variante_id === variante.id)

  const prueba = await pedir('POST', '/api/probador/pruebas', {
    ip,
    token: ana.token,
    cuerpo: { variante_id: variante.id, modo: 'avatar', talla_recomendada_id: 3, duracion_seg: 20 },
  })
  verificar('la prueba queda registrada', prueba.estado === 201, `estado ${prueba.estado}`)

  const anonima = await pedir('POST', '/api/probador/pruebas', {
    ip,
    carrito: `anon-${s}`,
    cuerpo: { variante_id: variante.id, modo: 'ra_camara' },
  })
  verificar(
    'y un visitante sin cuenta tambien puede probarse',
    anonima.estado === 201,
    `estado ${anonima.estado}`
  )

  const sinNada = await pedir('POST', '/api/probador/pruebas', {
    ip,
    cuerpo: { variante_id: variante.id, modo: 'avatar' },
  })
  verificar('pero sin sesion ni token no se registra nada', sinNada.estado === 422, `estado ${sinNada.estado}`)

  // Ana compra lo que se probo.
  const compra = await pedir('POST', '/api/pedidos', {
    ip,
    token: ana.token,
    cuerpo: {
      canal: 'online',
      tipo_entrega: 'recojo_tienda',
      sucursal_id: SUCURSAL_CENTRO,
      items: [{ variante_id: variante.id, cantidad: 1 }],
    },
  })
  verificar('la compra se registra', compra.estado === 201, `estado ${compra.estado}`)

  const hoy = new Date()
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString()
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59).toISOString()

  const reporte = await pedir('POST', '/api/reportes/efectividad_probador', {
    ip,
    token,
    cuerpo: { parametros: { desde, hasta } },
  })
  verificar('el reporte de efectividad ya no viene vacio', (reporte.json?.datos?.filas?.length ?? 0) > 0, `${reporte.json?.datos?.filas?.length} filas`)

  const fila = (reporte.json?.datos?.filas ?? []).find((f) =>
    String(f.producto).includes(`probador ${s}`)
  )
  verificar('la prenda probada aparece', fila !== undefined)
  verificar('con sus dos pruebas contadas', Number(fila?.pruebas) === 2, `pruebas ${fila?.pruebas}`)
  verificar(
    'y solo la de Ana marcada como compra: la anonima no compro',
    Number(fila?.compras) === 1,
    `compras ${fila?.compras}`
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  probarProbador()
    .then(() => process.exit(resumen()))
    .catch((e) => {
      console.error('\nLa prueba se corto:', e.message)
      process.exit(1)
    })
}
