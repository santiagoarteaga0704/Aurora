/**
 * Carga datos de demostracion a traves de la API.
 *
 *   node scripts/datos-demo.mjs
 *
 * Se hace por la API y no con INSERT directos a proposito: asi los datos pasan
 * por las mismas validaciones y reglas de negocio que usaria una persona, y de
 * paso el script sirve como prueba de humo de extremo a extremo. Un seed que
 * escribe en la base saltea justamente lo que hay que demostrar.
 *
 * Crea: 14 productos con sus variantes, stock en dos sucursales, una campania
 * con promociones, personal de mostrador y algunos pedidos en distintos estados.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pedir, sesionAdmin } from './ayuda-pruebas.mjs'

const ip = '127.0.0.1'

const SUCURSAL_CENTRO = 1
const SUCURSAL_VENTURA = 2
const PISO_CENTRO = 1
const PISO_VENTURA = 3
const CENTRAL = 7

/** Tallas y colores que siembra el seed maestro. */
const T = { XS: 1, S: 2, M: 3, L: 4, XL: 5 }
const C = {
  negro: 1,
  blanco: 2,
  beige: 3,
  rojo: 4,
}

const CATALOGO = [
  {
    categoria_id: 2,
    codigo: 'VES-MIDI-01',
    nombre: 'Vestido midi plisado',
    descripcion:
      'Vestido midi de gasa plisada con cintura marcada y escote en V. Cae con movimiento y no necesita planchado.',
    material: 'Gasa de poliester',
    cuidados: 'Lavar a mano en agua fria. No usar secadora.',
    temporada: 'verano',
    tipo_prenda: 'vestido',
    destacado: true,
    precio: [520, 410],
    combinaciones: [
      [T.S, C.negro],
      [T.M, C.negro],
      [T.L, C.negro],
      [T.M, C.rojo],
      [T.L, C.rojo],
    ],
  },
  {
    categoria_id: 2,
    codigo: 'VES-CRUZ-02',
    nombre: 'Vestido cruzado de lino',
    descripcion: 'Corte cruzado que se ata al costado, en lino lavado que respira.',
    material: 'Lino 100%',
    temporada: 'verano',
    tipo_prenda: 'vestido',
    destacado: true,
    precio: [580, 460],
    combinaciones: [
      [T.S, C.beige],
      [T.M, C.beige],
      [T.L, C.beige],
      [T.M, C.blanco],
    ],
  },
  {
    categoria_id: 2,
    codigo: 'VES-NOCH-03',
    nombre: 'Vestido largo de noche',
    descripcion: 'Satén con tirantes finos y abertura lateral. Para fiesta de noche.',
    material: 'Satén de viscosa',
    temporada: 'todo_ano',
    tipo_prenda: 'vestido',
    precio: [890, 710],
    combinaciones: [
      [T.S, C.negro],
      [T.M, C.negro],
      [T.L, C.negro],
    ],
  },
  {
    categoria_id: 3,
    codigo: 'BLU-SEDA-01',
    nombre: 'Blusa de seda lavada',
    descripcion: 'Blusa holgada con botones de nacar y puños abotonados.',
    material: 'Seda lavada',
    temporada: 'todo_ano',
    tipo_prenda: 'superior',
    destacado: true,
    precio: [390, 310],
    combinaciones: [
      [T.XS, C.blanco],
      [T.S, C.blanco],
      [T.M, C.blanco],
      [T.M, C.negro],
      [T.L, C.negro],
    ],
  },
  {
    categoria_id: 3,
    codigo: 'BLU-LINO-02',
    nombre: 'Camisa de lino oversize',
    descripcion: 'Camisa amplia de lino con bolsillo al frente. Se usa abierta o cerrada.',
    material: 'Lino con algodon',
    temporada: 'verano',
    tipo_prenda: 'superior',
    precio: [340, 270],
    combinaciones: [
      [T.S, C.beige],
      [T.M, C.beige],
      [T.L, C.beige],
    ],
  },
  {
    categoria_id: 3,
    codigo: 'TOP-ACAN-03',
    nombre: 'Top acanalado sin mangas',
    descripcion: 'Tejido acanalado elastico, cuello alto. Combina con todo.',
    material: 'Algodon con elastano',
    temporada: 'verano',
    tipo_prenda: 'superior',
    precio: [180, 140],
    combinaciones: [
      [T.XS, C.negro],
      [T.S, C.negro],
      [T.M, C.negro],
      [T.S, C.blanco],
      [T.M, C.blanco],
    ],
  },
  {
    categoria_id: 4,
    codigo: 'PAN-RECT-01',
    nombre: 'Pantalon recto de vestir',
    descripcion: 'Tiro alto, pierna recta y pinzas al frente. Cae sin arrugarse.',
    material: 'Mezcla de viscosa',
    temporada: 'todo_ano',
    tipo_prenda: 'inferior',
    destacado: true,
    precio: [450, 360],
    combinaciones: [
      [T.S, C.negro],
      [T.M, C.negro],
      [T.L, C.negro],
      [T.M, C.beige],
      [T.L, C.beige],
    ],
  },
  {
    categoria_id: 4,
    codigo: 'PAN-WIDE-02',
    nombre: 'Pantalon palazzo',
    descripcion: 'Pierna muy ancha y cintura elastizada por detras.',
    material: 'Crepe de poliester',
    temporada: 'todo_ano',
    tipo_prenda: 'inferior',
    precio: [420, 335],
    combinaciones: [
      [T.S, C.negro],
      [T.M, C.negro],
      [T.M, C.beige],
    ],
  },
  {
    categoria_id: 5,
    codigo: 'FAL-MIDI-01',
    nombre: 'Falda midi satinada',
    descripcion: 'Falda al bies con caida fluida y cintura alta.',
    material: 'Satén',
    temporada: 'todo_ano',
    tipo_prenda: 'inferior',
    precio: [360, 285],
    combinaciones: [
      [T.S, C.beige],
      [T.M, C.beige],
      [T.M, C.negro],
      [T.L, C.negro],
    ],
  },
  {
    categoria_id: 6,
    codigo: 'ABR-BLAZ-01',
    nombre: 'Blazer entallado',
    descripcion: 'Blazer de un boton con hombro estructurado y forro interior.',
    material: 'Mezcla de lana',
    temporada: 'invierno',
    tipo_prenda: 'abrigo',
    destacado: true,
    precio: [780, 620],
    combinaciones: [
      [T.S, C.negro],
      [T.M, C.negro],
      [T.L, C.negro],
      [T.M, C.beige],
    ],
  },
  {
    categoria_id: 6,
    codigo: 'ABR-TREN-02',
    nombre: 'Trench largo',
    descripcion: 'Gabardina cruzada con cinturon y tapeta doble.',
    material: 'Gabardina de algodon',
    temporada: 'otono',
    tipo_prenda: 'abrigo',
    precio: [980, 780],
    combinaciones: [
      [T.S, C.beige],
      [T.M, C.beige],
      [T.L, C.beige],
    ],
  },
  {
    categoria_id: 7,
    codigo: 'DEP-CALZ-01',
    nombre: 'Calza deportiva de tiro alto',
    descripcion: 'Tejido comprensivo con bolsillo lateral para el telefono.',
    material: 'Poliamida con elastano',
    temporada: 'todo_ano',
    tipo_prenda: 'inferior',
    precio: [290, 230],
    combinaciones: [
      [T.XS, C.negro],
      [T.S, C.negro],
      [T.M, C.negro],
      [T.L, C.negro],
    ],
  },
  {
    categoria_id: 12,
    codigo: 'ACC-CART-01',
    nombre: 'Cartera estructurada',
    descripcion: 'Cuero sintetico con herrajes dorados y correa desmontable.',
    material: 'Cuero sintetico',
    temporada: 'todo_ano',
    tipo_prenda: 'accesorio',
    precio: [420, 335],
    combinaciones: [
      [T.XS, C.negro],
      [T.XS, C.beige],
    ],
  },
  {
    categoria_id: 13,
    codigo: 'ACC-ARET-02',
    nombre: 'Aros geometricos',
    descripcion: 'Banio dorado sobre laton, livianos para usar todo el dia.',
    material: 'Laton con banio dorado',
    temporada: 'todo_ano',
    tipo_prenda: 'accesorio',
    precio: [95, 70],
    combinaciones: [[T.XS, C.beige]],
  },
]

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

async function principal() {
  console.log('Cargando datos de demostracion...\n')

  const admin = await sesionAdmin(ip)
  const token = admin.token

  /* --- Productos --------------------------------------------------------- */

  const creados = []

  for (const p of CATALOGO) {
    const cuerpo = {
      categoria_id: p.categoria_id,
      codigo: p.codigo,
      nombre: p.nombre,
      descripcion: p.descripcion,
      material: p.material,
      cuidados: p.cuidados,
      temporada: p.temporada,
      tipo_prenda: p.tipo_prenda,
      destacado: p.destacado ?? false,
      variantes: p.combinaciones.map(([talla, color], n) => ({
        talla_id: talla,
        color_id: color,
        sku: `${p.codigo}-${String(n + 1).padStart(2, '0')}`,
        precio_menor: p.precio[0],
        precio_mayor: p.precio[1],
      })),
    }

    const r = await pedir('POST', '/api/catalogo/productos', { ip, token, cuerpo })

    if (r.estado === 201) {
      creados.push(r.json.datos)
      console.log(`  + ${p.nombre} (${cuerpo.variantes.length} variantes)`)
    } else if (r.json?.errores?.codigo) {
      console.log(`  = ${p.nombre} ya existia`)
    } else {
      console.log(`  ! ${p.nombre}: ${r.json?.mensaje}`)
    }
  }

  if (creados.length === 0) {
    console.log('\nNo se creo nada nuevo. Si queres recargar de cero: npm run db:cargar')
    return
  }

  /* --- Stock ------------------------------------------------------------- */

  console.log('\nCargando stock...')
  let filas = 0

  for (const producto of creados) {
    for (const v of producto.variantes) {
      // Reparto desigual a proposito: que algunas combinaciones queden sin stock
      // y otras bajo el minimo hace que la demostracion se parezca a una tienda
      // de verdad, donde el talle que una quiere nunca esta en todas partes.
      const enCentro = [0, 2, 4, 7, 12, 18][Math.floor(Math.random() * 6)]
      const enVentura = [0, 3, 6, 9][Math.floor(Math.random() * 4)]
      const enCentral = 15 + Math.floor(Math.random() * 40)

      for (const [almacen, cantidad] of [
        [PISO_CENTRO, enCentro],
        [PISO_VENTURA, enVentura],
        [CENTRAL, enCentral],
      ]) {
        if (cantidad === 0) continue
        await pedir('POST', '/api/inventario/ajuste', {
          ip,
          token,
          cuerpo: {
            variante_id: v.id,
            almacen_id: almacen,
            stock_contado: cantidad,
            stock_minimo: almacen === CENTRAL ? 10 : 3,
            motivo: 'Carga inicial de temporada',
          },
        })
        filas++
      }
    }
  }
  console.log(`  ${filas} registros de inventario`)

  /* --- Escalas de mayoreo ------------------------------------------------ */

  console.log('\nEscalas de precio por volumen...')
  for (const producto of creados.slice(0, 6)) {
    const v = producto.variantes[0]
    const base = v.precio_mayor
    await pedir('PUT', `/api/catalogo/variantes/${v.id}/escalas`, {
      ip,
      token,
      cuerpo: {
        escalas: [
          { cantidad_min: 12, precio_unitario: Math.round(base * 0.92) },
          { cantidad_min: 50, precio_unitario: Math.round(base * 0.85) },
        ],
      },
    })
  }
  console.log('  6 variantes con escalas')

  /* --- Campania y promociones ------------------------------------------- */

  console.log('\nCampania y promociones...')
  const desde = new Date(Date.now() - 3 * 86400000).toISOString()
  const hasta = new Date(Date.now() + 30 * 86400000).toISOString()

  const campania = await pedir('POST', '/api/campanias', {
    ip,
    token,
    cuerpo: {
      nombre: 'Temporada de verano 2026',
      descripcion: 'Vestidos y prendas livianas con precio de temporada.',
      tipo: 'temporada',
      fecha_inicio: desde,
      fecha_fin: hasta,
    },
  })

  const campaniaId = campania.json?.datos?.id

  const promos = [
    {
      nombre: '15% en vestidos',
      tipo: 'porcentaje',
      valor: 15,
      aplica_a: 'categoria',
      aplica_id: 2,
      min_compra: 500,
    },
    {
      nombre: 'Envio gratis desde 600',
      tipo: 'envio_gratis',
      min_compra: 600,
      canal: 'online',
    },
    {
      nombre: 'Cupon de bienvenida',
      tipo: 'monto_fijo',
      valor: 50,
      codigo_cupon: 'BIENVENIDA',
      min_compra: 300,
      usos_max: 100,
    },
  ]

  for (const p of promos) {
    const r = await pedir('POST', '/api/promociones', {
      ip,
      token,
      cuerpo: { ...p, campania_id: campaniaId, fecha_inicio: desde, fecha_fin: hasta },
    })
    console.log(r.estado === 201 ? `  + ${p.nombre}` : `  ! ${p.nombre}: ${r.json?.mensaje}`)
  }

  /* --- Personal ---------------------------------------------------------- */

  console.log('\nPersonal de demostracion...')
  const roles = await pedir('GET', '/api/roles', { ip, token })

  const personal = [
    { rol: 'gerente', nombre: 'Gabriela', apellido: 'Suarez', email: 'gerente@aurora.bo', sucursal: SUCURSAL_CENTRO },
    { rol: 'vendedor', nombre: 'Valeria', apellido: 'Mamani', email: 'vendedora@aurora.bo', sucursal: SUCURSAL_CENTRO },
    { rol: 'almacenero', nombre: 'Ruben', apellido: 'Quispe', email: 'almacen@aurora.bo', sucursal: SUCURSAL_CENTRO },
    { rol: 'repartidor', nombre: 'Ramiro', apellido: 'Flores', email: 'reparto@aurora.bo', sucursal: SUCURSAL_CENTRO },
    { rol: 'vendedor', nombre: 'Noelia', apellido: 'Arce', email: 'ventura@aurora.bo', sucursal: SUCURSAL_VENTURA },
  ]

  for (const p of personal) {
    const rol = roles.json?.datos?.find((r) => r.nombre === p.rol)
    if (!rol) continue
    const r = await pedir('POST', '/api/usuarios', {
      ip,
      token,
      cuerpo: {
        rol_id: rol.id,
        sucursal_id: p.sucursal,
        nombre: p.nombre,
        apellido: p.apellido,
        email: p.email,
        password: 'Aurora2026!',
      },
    })
    console.log(
      r.estado === 201 ? `  + ${p.nombre} ${p.apellido} (${p.rol})` : `  = ${p.email} ya existia`
    )
  }

  /* --- Clientas y pedidos ------------------------------------------------ */

  console.log('\nClientas y pedidos...')

  const clientas = [
    { nombre: 'Camila', apellido: 'Rojas', email: 'camila@ejemplo.bo' },
    { nombre: 'Lucia', apellido: 'Vargas', email: 'lucia@ejemplo.bo' },
  ]

  const sesiones = []
  for (const c of clientas) {
    let r = await pedir('POST', '/api/auth/registro', {
      ip,
      cuerpo: { ...c, password: 'Aurora2026!' },
    })
    if (r.estado !== 201) {
      r = await pedir('POST', '/api/auth/login', {
        ip,
        cuerpo: { email: c.email, password: 'Aurora2026!' },
      })
    }
    if (r.json?.datos?.token) sesiones.push({ ...c, token: r.json.datos.token })
  }

  // Mayorista con el NIT ya validado, para que la demostracion muestre los
  // precios de mayoreo sin tener que aprobarlo a mano.
  let mayorista = await pedir('POST', '/api/auth/registro', {
    ip,
    cuerpo: {
      nombre: 'Boutique',
      apellido: 'Del Centro',
      email: 'mayorista@ejemplo.bo',
      password: 'Aurora2026!',
      tipo: 'mayorista',
      nit: '1023456789',
      razon_social: 'Boutique del Centro SRL',
    },
  })
  if (mayorista.estado !== 201) {
    mayorista = await pedir('POST', '/api/auth/login', {
      ip,
      cuerpo: { email: 'mayorista@ejemplo.bo', password: 'Aurora2026!' },
    })
  }
  if (mayorista.json?.datos?.usuario?.id) {
    await pedir('POST', `/api/usuarios/${mayorista.json.datos.usuario.id}/aprobar-mayorista`, {
      ip,
      token,
      cuerpo: { aprobado: true, descuento_extra: 2 },
    })
    console.log('  + mayorista aprobado')
  }

  // Pedidos en distintos estados, para que las pantallas de operaciones no
  // muestren una sola fila.
  const conStock = []
  for (const producto of creados) {
    const ficha = await pedir('GET', `/api/catalogo/productos/${producto.slug}`, { ip })
    for (const v of ficha.json?.datos?.variantes ?? []) {
      if (v.disponible >= 2) conStock.push(v)
    }
  }

  let pedidos = 0
  for (const [n, clienta] of sesiones.entries()) {
    const elegidas = conStock.slice(n * 2, n * 2 + 2)
    if (elegidas.length === 0) continue

    const pedido = await pedir('POST', '/api/pedidos', {
      ip,
      token: clienta.token,
      cuerpo: {
        sucursal_id: SUCURSAL_CENTRO,
        tipo_entrega: 'recojo_tienda',
        items: elegidas.map((v) => ({ variante_id: v.id, cantidad: 1 })),
      },
    })

    if (pedido.estado !== 201) continue
    pedidos++
    const id = pedido.json.datos.id

    // El primero queda pagado y preparandose; el segundo, esperando pago.
    if (n === 0) {
      await pedir('POST', `/api/pedidos/${id}/pagos`, {
        ip,
        token,
        cuerpo: { metodo_pago_id: 4, monto: pedido.json.datos.total },
      })
      await pedir('POST', `/api/pedidos/${id}/estado`, {
        ip,
        token,
        cuerpo: { estado: 'preparando' },
      })
    }
  }

  // Una venta de mostrador, para que la caja tenga movimiento.
  const paraMostrador = conStock.slice(-2)
  if (paraMostrador.length > 0) {
    await pedir('POST', '/api/caja/abrir', {
      ip,
      token,
      cuerpo: { sucursal_id: SUCURSAL_CENTRO, monto_apertura: 500 },
    })
    const venta = await pedir('POST', '/api/pedidos', {
      ip,
      token,
      cuerpo: {
        canal: 'tienda',
        tipo_entrega: 'inmediata',
        sucursal_id: SUCURSAL_CENTRO,
        items: [{ variante_id: paraMostrador[0].id, cantidad: 1 }],
        pago: { metodo_pago_id: 1, monto: paraMostrador[0].precio },
      },
    })
    if (venta.estado === 201) pedidos++
  }

  console.log(`  ${pedidos} pedidos`)

  /* --- Anclajes de realidad aumentada ------------------------------------ */

  // Van por SQL y no por API porque `producto_prenda_3d` es una tabla de datos
  // de presentacion, no de negocio: no hay pantalla que la administre ni tiene
  // sentido inventarle un endpoint solo para sembrarla.
  //
  // Son cuatro productos y no los treinta a proposito: alcanzan para demostrar
  // que el anclaje propio gana sobre el generico por tipo de prenda, y el resto
  // del catalogo prueba justamente el camino generico.
  console.log('\nAnclajes de realidad aumentada...')
  const anclaje = readFileSync('database/prendas-3d.sql', 'utf8')
  try {
    execFileSync(
      'docker',
      ['exec', '-i', 'aurora-db', 'psql', '-U', 'aurora', '-d', 'aurora', '-v', 'ON_ERROR_STOP=1', '-q'],
      { input: anclaje, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    console.log('  4 prendas con anclaje propio')
  } catch (e) {
    // No es motivo para tumbar la carga: sin anclaje propio, la RA sigue
    // andando con el generico por tipo de prenda.
    console.log(`  no se pudieron cargar (${(e.stderr || e.message).trim().split('\n')[0]})`)
  }

  await esperar(100)

  console.log('\n' + '-'.repeat(58))
  console.log('Listo. Para entrar:')
  console.log('  Tienda      cualquiera de las clientas, clave Aurora2026!')
  console.log('              camila@ejemplo.bo  ·  mayorista@ejemplo.bo')
  console.log('  Operaciones admin@aurora.bo  ·  vendedora@aurora.bo')
  console.log('              clave Aurora2026!')
}

principal().catch((e) => {
  console.error('\nFallo la carga:', e.message)
  process.exit(1)
})
