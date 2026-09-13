/**
 * Pruebas del modulo de catalogo.
 *
 *   node scripts/probar-catalogo.mjs
 *
 * Se apoyan en los catalogos maestros que siembra database/seed.postgres.sql:
 * categoria 1 "Ropa" con hijas, categoria 2 "Vestidos", tallas 1..6 y colores
 * 1..4.
 */
import { pathToFileURL } from 'node:url'
import { pedir, resumen, sesionAdmin, sufijo, titulo, verificar } from './ayuda-pruebas.mjs'

const ip = '10.2.0.1'
const s = sufijo()

export async function probarCatalogo() {
  const admin = await sesionAdmin(ip)
  const token = admin.token

  // Un cliente comun, para comprobar que el catalogo se administra con permiso
  // y no con solo estar logueado.
  const alta = await pedir('POST', '/api/auth/registro', {
    ip,
    cuerpo: {
      nombre: 'Clienta',
      apellido: 'Catalogo',
      email: `prueba+cat${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  const tokenCliente = alta.json?.datos?.token

  // --------------------------------------------------------------------------
  titulo('[C1] Maestros del catalogo (publicos)')

  const categorias = await pedir('GET', '/api/catalogo/categorias', { ip })
  verificar('las categorias no exigen sesion', categorias.estado === 200)
  const ropa = categorias.json?.datos?.find((c) => c.slug === 'ropa')
  verificar('vienen en arbol con sus hijas', (ropa?.hijas?.length ?? 0) > 0, `hijas: ${ropa?.hijas?.length}`)

  const tallas = await pedir('GET', '/api/catalogo/tallas', { ip })
  verificar('las tallas llegan ordenadas', tallas.json?.datos?.[0]?.nombre === 'XS')

  const colores = await pedir('GET', '/api/catalogo/colores', { ip })
  verificar('los colores traen su hex', /^#[0-9A-Fa-f]{6}$/.test(colores.json?.datos?.[0]?.hex ?? ''))

  const guia = await pedir('GET', '/api/catalogo/guia-tallas/2', { ip })
  verificar('la guia de tallas de vestidos tiene filas', (guia.json?.datos?.length ?? 0) > 0)
  verificar('y cada fila trae las medidas', typeof guia.json?.datos?.[0]?.busto_min === 'number')

  // --------------------------------------------------------------------------
  titulo('[C2] Alta de productos: permisos y validaciones')

  const productoValido = {
    categoria_id: 2,
    codigo: `VES-${s}`,
    nombre: `Vestido midi plisado ${s}`,
    descripcion: 'Vestido midi de gasa plisada, ideal para fiesta de noche.',
    material: 'Gasa de poliester',
    temporada: 'verano',
    tipo_prenda: 'vestido',
    destacado: true,
    variantes: [
      { talla_id: 2, color_id: 1, sku: `VES-${s}-S-NE`, precio_menor: 450, precio_mayor: 360 },
      { talla_id: 3, color_id: 1, sku: `VES-${s}-M-NE`, precio_menor: 450, precio_mayor: 360 },
      { talla_id: 3, color_id: 4, sku: `VES-${s}-M-RO`, precio_menor: 480, precio_mayor: 380 },
    ],
  }

  const sinSesion = await pedir('POST', '/api/catalogo/productos', { ip, cuerpo: productoValido })
  verificar('sin sesion no se puede crear', sinSesion.estado === 401, `estado ${sinSesion.estado}`)

  const comoCliente = await pedir('POST', '/api/catalogo/productos', {
    ip,
    token: tokenCliente,
    cuerpo: productoValido,
  })
  verificar('un cliente logueado tampoco puede', comoCliente.estado === 403, `estado ${comoCliente.estado}`)

  const sinVariantes = await pedir('POST', '/api/catalogo/productos', {
    ip,
    token,
    cuerpo: { ...productoValido, codigo: `X-${s}`, variantes: [] },
  })
  verificar('un producto sin variantes se rechaza', sinVariantes.estado === 422)

  const mayorCaro = await pedir('POST', '/api/catalogo/productos', {
    ip,
    token,
    cuerpo: {
      ...productoValido,
      codigo: `Y-${s}`,
      variantes: [{ talla_id: 2, color_id: 1, sku: `Y-${s}-1`, precio_menor: 100, precio_mayor: 200 }],
    },
  })
  verificar(
    'el precio de mayoreo no puede superar al de menudeo',
    mayorCaro.estado === 422,
    `estado ${mayorCaro.estado}`
  )

  const tallaInexistente = await pedir('POST', '/api/catalogo/productos', {
    ip,
    token,
    cuerpo: {
      ...productoValido,
      codigo: `Z-${s}`,
      variantes: [{ talla_id: 9999, color_id: 1, sku: `Z-${s}-1`, precio_menor: 100, precio_mayor: 90 }],
    },
  })
  verificar('una talla inexistente da error de campo', tallaInexistente.json?.errores?.talla_id !== undefined)

  const creado = await pedir('POST', '/api/catalogo/productos', { ip, token, cuerpo: productoValido })
  verificar('el alta correcta da 201', creado.estado === 201, `estado ${creado.estado}`)
  verificar('devuelve la ficha con sus 3 variantes', creado.json?.datos?.variantes?.length === 3)
  verificar('genera el slug desde el nombre', /^vestido-midi-plisado/.test(creado.json?.datos?.slug ?? ''))

  const slug = creado.json.datos.slug
  const productoId = creado.json.datos.id
  const varianteM = creado.json.datos.variantes.find((v) => v.talla === 'M' && v.color === 'Negro')

  const codigoRepetido = await pedir('POST', '/api/catalogo/productos', {
    ip,
    token,
    cuerpo: { ...productoValido, nombre: 'Otro nombre', variantes: [productoValido.variantes[0]] },
  })
  verificar('el codigo repetido se rechaza', codigoRepetido.json?.errores?.codigo !== undefined)

  const skuRepetido = await pedir('POST', '/api/catalogo/productos', {
    ip,
    token,
    cuerpo: { ...productoValido, codigo: `W-${s}`, nombre: 'Tercero' },
  })
  verificar('el SKU repetido se rechaza', skuRepetido.json?.errores?.sku !== undefined)

  // --------------------------------------------------------------------------
  titulo('[C3] Ficha y busqueda')

  const ficha = await pedir('GET', `/api/catalogo/productos/${slug}`, { ip })
  verificar('la ficha no exige sesion', ficha.estado === 200)
  verificar('trae el rango de precios', ficha.json?.datos?.precio_desde === 450 && ficha.json?.datos?.precio_hasta === 480)
  verificar('trae la categoria resuelta', ficha.json?.datos?.categoria === 'Vestidos')
  verificar('sin stock cargado el disponible es cero', ficha.json?.datos?.disponible === 0)

  const inexistente = await pedir('GET', '/api/catalogo/productos/no-existe-este-slug', { ip })
  verificar('un slug inexistente da 404', inexistente.estado === 404, `estado ${inexistente.estado}`)

  const porTexto = await pedir('GET', `/api/catalogo/productos?q=plisado`, { ip })
  verificar(
    'la busqueda por texto lo encuentra',
    porTexto.json?.datos?.some((p) => p.slug === slug),
    `${porTexto.json?.meta?.total} resultado(s)`
  )

  // El indice es de texto completo en espaniol, no un LIKE: busca por raiz.
  const porRaiz = await pedir('GET', `/api/catalogo/productos?q=vestidos%20plisados`, { ip })
  verificar(
    'encuentra en plural lo que se cargo en singular',
    porRaiz.json?.datos?.some((p) => p.slug === slug)
  )

  const porCategoriaHija = await pedir('GET', '/api/catalogo/productos?categoria_id=2', { ip })
  verificar('filtra por la categoria exacta', porCategoriaHija.json?.datos?.some((p) => p.slug === slug))

  const porCategoriaPadre = await pedir('GET', '/api/catalogo/productos?categoria_id=1', { ip })
  verificar(
    'filtrar por la categoria padre incluye las hijas',
    porCategoriaPadre.json?.datos?.some((p) => p.slug === slug)
  )

  const categoriaAjena = await pedir('GET', '/api/catalogo/productos?categoria_id=11', { ip })
  verificar(
    'y no aparece bajo una categoria que no le toca',
    !categoriaAjena.json?.datos?.some((p) => p.slug === slug)
  )

  const porColor = await pedir('GET', `/api/catalogo/productos?color_id=4&q=plisado`, { ip })
  verificar('filtra por color de la variante', porColor.json?.datos?.some((p) => p.slug === slug))

  const colorSinStock = await pedir('GET', `/api/catalogo/productos?color_id=2&q=plisado`, { ip })
  verificar(
    'y descarta el color que el producto no tiene',
    !colorSinStock.json?.datos?.some((p) => p.slug === slug)
  )

  const porPrecio = await pedir('GET', `/api/catalogo/productos?precio_max=100&q=plisado`, { ip })
  verificar('el filtro de precio maximo lo deja fuera', !porPrecio.json?.datos?.some((p) => p.slug === slug))

  const paginado = await pedir('GET', '/api/catalogo/productos?por_pagina=1', { ip })
  verificar('la paginacion respeta por_pagina', (paginado.json?.datos?.length ?? 0) <= 1)
  verificar('y devuelve el total y las paginas', typeof paginado.json?.meta?.paginas === 'number')

  const porPaginaGrande = await pedir('GET', '/api/catalogo/productos?por_pagina=5000', { ip })
  verificar('un por_pagina desmedido se rechaza', porPaginaGrande.estado === 422)

  // --------------------------------------------------------------------------
  titulo('[C4] Variantes y escalas de precio')

  const varianteRepetida = await pedir('POST', `/api/catalogo/productos/${productoId}/variantes`, {
    ip,
    token,
    cuerpo: { talla_id: 2, color_id: 1, sku: `NUEVO-${s}`, precio_menor: 450, precio_mayor: 360 },
  })
  verificar(
    'no se puede repetir la misma talla y color',
    varianteRepetida.estado === 409,
    `estado ${varianteRepetida.estado}`
  )

  const varianteNueva = await pedir('POST', `/api/catalogo/productos/${productoId}/variantes`, {
    ip,
    token,
    cuerpo: { talla_id: 4, color_id: 1, sku: `VES-${s}-L-NE`, precio_menor: 460, precio_mayor: 370 },
  })
  verificar('se agrega una combinacion nueva', varianteNueva.estado === 201, `estado ${varianteNueva.estado}`)
  verificar('y la ficha pasa a tener 4 variantes', varianteNueva.json?.datos?.variantes?.length === 4)

  const escalaMala = await pedir('PUT', `/api/catalogo/variantes/${varianteM.id}/escalas`, {
    ip,
    token,
    cuerpo: { escalas: [{ cantidad_min: 12, precio_unitario: 400 }] },
  })
  verificar(
    'una escala mas cara que el mayoreo se rechaza',
    escalaMala.estado === 422,
    `estado ${escalaMala.estado}`
  )

  const escalaOk = await pedir('PUT', `/api/catalogo/variantes/${varianteM.id}/escalas`, {
    ip,
    token,
    cuerpo: {
      escalas: [
        { cantidad_min: 12, precio_unitario: 340 },
        { cantidad_min: 50, precio_unitario: 310 },
      ],
    },
  })
  verificar('las escalas validas se guardan', escalaOk.estado === 200, `estado ${escalaOk.estado}`)

  const fichaConEscalas = await pedir('GET', `/api/catalogo/productos/${slug}`, { ip })
  verificar(
    'y aparecen en la ficha bajo su variante',
    fichaConEscalas.json?.datos?.escalas?.[varianteM.id]?.length === 2
  )

  // --------------------------------------------------------------------------
  titulo('[C5] Precios segun quien mira')

  const comoAnonimo = await pedir('GET', `/api/catalogo/productos/${slug}`, { ip })
  verificar('un visitante ve el precio de menudeo', comoAnonimo.json?.datos?.variantes[0]?.precio === 450)

  const comoMinorista = await pedir('GET', `/api/catalogo/productos/${slug}`, { ip, token: tokenCliente })
  verificar('un minorista tambien', comoMinorista.json?.datos?.variantes[0]?.precio === 450)

  // Un mayorista recien registrado NO ve precios de mayoreo: primero hay que
  // validarle el NIT.
  const mayorista = await pedir('POST', '/api/auth/registro', {
    ip,
    cuerpo: {
      nombre: 'Boutique',
      apellido: 'Revendedora',
      email: `prueba+may${s}@aurora.bo`,
      password: 'ClaveSegura123',
      tipo: 'mayorista',
      nit: '1234567890',
      razon_social: 'Boutique Revendedora SRL',
    },
  })
  const tokenMayorista = mayorista.json?.datos?.token

  const sinAprobar = await pedir('GET', `/api/catalogo/productos/${slug}`, { ip, token: tokenMayorista })
  verificar(
    'un mayorista sin aprobar todavia ve precio de menudeo',
    sinAprobar.json?.datos?.variantes[0]?.precio === 450,
    `precio ${sinAprobar.json?.datos?.variantes[0]?.precio}`
  )

  return { slug, productoId, token, tokenCliente, variantes: varianteNueva.json.datos.variantes }
}

// Permite correr esta suite sola o desde probar-todo.mjs. La comparacion usa
// pathToFileURL porque en Windows process.argv[1] viene como C:\... y armar la
// URL a mano da file://C:/... en vez de file:///C:/..., que nunca coincide.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  probarCatalogo()
    .then(() => process.exit(resumen()))
    .catch((e) => {
      console.error('\nLa prueba se corto:', e.message)
      process.exit(1)
    })
}
