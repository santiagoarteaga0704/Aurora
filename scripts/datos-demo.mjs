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
import { pedir as pedirCrudo, sesionAdmin } from './ayuda-pruebas.mjs'


/**
 * Envoltorio de `pedir` para la carga de demostracion.
 *
 * Hace dos cosas que el `pedir` pelado no hacia, y las dos porque esta carga
 * silenciosamente rota es peor que una que falla:
 *
 * 1. **Rota la IP simulada cada 100 peticiones.** La API limita a 120 por
 *    minuto y por IP, que es un limite sano en produccion; esta carga hace
 *    varios cientos. Con una IP fija, la segunda mitad del script recibia 429 y
 *    seguia como si nada: faltaban pedidos, faltaba stock, y la unica pista era
 *    que la demostracion se veia incompleta sin que nada lo dijera.
 *
 * 2. **Avisa cuando algo no sale bien.** No corta la carga —un paso opcional que
 *    falle no tiene por que arruinar el resto— pero lo deja escrito.
 */
let cuantas = 0
let bloque = 0

function ipDelBloque() {
  return `10.20.${Math.floor(bloque / 254)}.${(bloque % 254) + 1}`
}

async function pedir(metodo, ruta, opciones = {}) {
  if (cuantas > 0 && cuantas % 100 === 0) bloque++
  cuantas++

  const r = await pedirCrudo(metodo, ruta, { ...opciones, ip: ipDelBloque() })

  if (r.estado >= 400 && !opciones.esperado) {
    const detalle = r.json?.mensaje ?? ''
    console.log(`  ! ${metodo} ${ruta} -> ${r.estado} ${detalle}`.slice(0, 120))
  }

  return r
}

const SUCURSAL_CENTRO = 1
const SUCURSAL_VENTURA = 2
const PISO_CENTRO = 1
const DEPOSITO_CENTRO = 2
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

  const admin = await sesionAdmin(ipDelBloque())
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

    const r = await pedir('POST', '/api/catalogo/productos', { token, cuerpo })

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
      token,
      cuerpo: { ...p, campania_id: campaniaId, fecha_inicio: desde, fecha_fin: hasta },
    })
    console.log(r.estado === 201 ? `  + ${p.nombre}` : `  ! ${p.nombre}: ${r.json?.mensaje}`)
  }

  /* --- Personal ---------------------------------------------------------- */

  console.log('\nPersonal de demostracion...')
  const roles = await pedir('GET', '/api/roles', { token })

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
      cuerpo: { ...c, password: 'Aurora2026!' },
    })
    if (r.estado !== 201) {
      r = await pedir('POST', '/api/auth/login', {
        cuerpo: { email: c.email, password: 'Aurora2026!' },
      })
    }
    if (r.json?.datos?.token) sesiones.push({ ...c, token: r.json.datos.token })
  }

  // Mayorista con el NIT ya validado, para que la demostracion muestre los
  // precios de mayoreo sin tener que aprobarlo a mano.
  let mayorista = await pedir('POST', '/api/auth/registro', {
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
      cuerpo: { email: 'mayorista@ejemplo.bo', password: 'Aurora2026!' },
    })
  }
  if (mayorista.json?.datos?.usuario?.id) {
    await pedir('POST', `/api/usuarios/${mayorista.json.datos.usuario.id}/aprobar-mayorista`, {
      token,
      cuerpo: { aprobado: true, descuento_extra: 2 },
    })
    console.log('  + mayorista aprobado')
  }

  // Pedidos en distintos estados, para que las pantallas de operaciones no
  // muestren una sola fila.
  /**
   * Variantes vendibles desde el PISO DE VENTA de Aurora Centro.
   *
   * Se toman del inventario de ese almacen y no del stock total de la ficha:
   * un pedido de la sucursal Centro sale del piso de venta, y la ficha suma
   * todos los almacenes del pais. Con el total, la carga elegia prendas que
   * solo tenian stock en el deposito central y los pedidos fallaban con 409 sin
   * que quedara claro por que.
   *
   * Una variante por producto: un pedido de dos colores del mismo vestido deja
   * una sola resenia —son por producto— y la ficha de demostracion quedaria con
   * una linea sola.
   */
  const inventario = await pedir(
    'GET',
    `/api/inventario?almacen_id=${PISO_CENTRO}&por_pagina=100`,
    { token }
  )

  const conStock = []
  const productosVistos = new Set()
  for (const fila of inventario.json?.datos ?? []) {
    if (fila.disponible < 4 || productosVistos.has(fila.producto)) continue
    productosVistos.add(fila.producto)
    conStock.push({ id: fila.variante_id, sku: fila.sku })
  }

  let pedidos = 0
  const entregados = []

  /**
   * Cada clienta hace dos pedidos: uno entregado y otro esperando pago.
   *
   * Con un pedido por clienta habia que elegir entre mostrar la linea de tiempo
   * completa o mostrar el cobro pendiente, y las dos pantallas hacen falta. Dos
   * pedidos cuestan diez segundos de carga y dejan las dos puntas visibles.
   */
  const pedir1 = async (clienta, variantes) => {
    if (variantes.length === 0) return null
    const r = await pedir('POST', '/api/pedidos', {
      token: clienta.token,
      cuerpo: {
        sucursal_id: SUCURSAL_CENTRO,
        tipo_entrega: 'recojo_tienda',
        items: variantes.map((v) => ({ variante_id: v.id, cantidad: 1 })),
      },
    })
    if (r.estado !== 201) return null
    pedidos++
    return r.json.datos
  }

  // Un cursor y no rangos fijos: con `slice(n*4, ...)` el reparto se pasaba de
  // largo en cuanto habia menos productos que posiciones, y la segunda clienta
  // se quedaba sin su pedido pendiente sin que nada fallara.
  let cursor = 0
  const tomar = (cuantos) => {
    const trozo = conStock.slice(cursor, cursor + cuantos)
    cursor += trozo.length
    return trozo
  }

  for (const [n, clienta] of sesiones.entries()) {
    const entregado = await pedir1(clienta, tomar(2))
    if (entregado) {
      await pedir('POST', `/api/pedidos/${entregado.id}/pagos`, {
        token,
        cuerpo: { metodo_pago_id: 4, monto: entregado.total },
      })
      for (const estado of ['preparando', 'listo', 'entregado']) {
        await pedir('POST', `/api/pedidos/${entregado.id}/estado`, {
          token,
          cuerpo: { estado },
        })
      }

      // Solo la primera clienta opina. La segunda queda con su pedido entregado
      // y sin calificar, que es lo que hace falta para poder mostrar la
      // pantalla de opinar con algo adentro.
      if (n === 0) entregados.push({ id: entregado.id, clienta })
    }

    // El segundo queda esperando pago.
    await pedir1(clienta, tomar(1))
  }

  // Una venta de mostrador, para que la caja tenga movimiento.
  const paraMostrador = conStock.slice(-2)
  if (paraMostrador.length > 0) {
    await pedir('POST', '/api/caja/abrir', {
      token,
      cuerpo: { sucursal_id: SUCURSAL_CENTRO, monto_apertura: 500 },
    })
    // La venta se registra y despues se cobra, en vez de mandar el pago con el
    // pedido: el precio lo decide el servidor y aca no se conoce hasta que
    // responde. Mandar un monto adivinado dejaria la venta a medio pagar.
    const venta = await pedir('POST', '/api/pedidos', {
      token,
      cuerpo: {
        canal: 'tienda',
        tipo_entrega: 'inmediata',
        sucursal_id: SUCURSAL_CENTRO,
        items: [{ variante_id: paraMostrador[0].id, cantidad: 1 }],
      },
    })

    if (venta.estado === 201) {
      pedidos++
      await pedir('POST', `/api/pedidos/${venta.json.datos.id}/pagos`, {
        token,
        cuerpo: { metodo_pago_id: 1, monto: venta.json.datos.total },
      })
    }
  }

  console.log(`  ${pedidos} pedidos`)

  /* --- Opiniones --------------------------------------------------------- */

  // Sin opiniones, la ficha de producto muestra "todavia nadie opino" y no se
  // puede ver funcionando ni el reparto por estrellas ni lo que dice la gente
  // del talle, que es la parte que de verdad ayuda a elegir.
  console.log('\nOpiniones...')

  const OPINIONES = [
    {
      calificacion: 5,
      ajuste_real: 'justa',
      comentario: 'La tela cae muy bien y el color es igual al de la foto. Me quedo perfecto.',
    },
    {
      calificacion: 4,
      ajuste_real: 'grande',
      comentario: 'Muy linda, pero me quedo un poco holgada de arriba. La proxima pido una menos.',
    },
  ]

  let opiniones = 0
  for (const entrega of entregados) {
    const pendientes = await pedir('GET', '/api/resenas/pendientes', {
      token: entrega.clienta.token,
    })

    for (const [n, compra] of (pendientes.json?.datos ?? []).entries()) {
      const opinion = OPINIONES[n % OPINIONES.length]
      const r = await pedir('POST', '/api/resenas', {
        token: entrega.clienta.token,
        cuerpo: {
          producto_id: compra.producto_id,
          pedido_id: compra.pedido_id,
          ...opinion,
        },
      })

      if (r.estado !== 201) continue
      opiniones++

      // Se aprueban aca mismo: la demostracion tiene que mostrar la ficha con
      // los comentarios puestos, no la cola de moderacion vacia esperando a
      // que alguien entre a aprobarlos.
      await pedir('PUT', `/api/resenas/${r.json.datos.id}/moderar`, {
        token,
        cuerpo: { aprobada: true },
      })
    }
  }

  console.log(`  ${opiniones} opiniones publicadas`)

  /* --- Una venta sin conexion que no entra -------------------------------- */

  // La pantalla de "sin aplicar" no se puede mostrar vacia: lo que hay que
  // poder ensenar es justamente el caso feo, dos vendedoras sin conexion
  // vendiendo la ultima prenda. Se reproduce de verdad —por el endpoint de
  // lote, con stock en uno— en vez de insertar una fila a mano en la tabla.
  console.log('\nUna venta sin conexion que no entra...')

  // Prenda dedicada, con UNA unidad en un solo almacen. Reusar una del catalogo
  // no servia: el pedido busca stock en los almacenes de la sucursal y lo
  // encontraba en el deposito, asi que las dos ventas entraban y no habia
  // conflicto que mostrar.
  const unica = await pedir('POST', '/api/catalogo/productos', {
    token,
    cuerpo: {
      categoria_id: 2,
      codigo: 'VES-UNICO-01',
      nombre: 'Vestido de gala (ultima pieza)',
      tipo_prenda: 'vestido',
      descripcion: 'Pieza unica de muestra. Queda una sola en el piso de venta.',
      variantes: [
        { talla_id: 3, color_id: 1, sku: 'VES-UNICO-01-01', precio_menor: 890, precio_mayor: 712 },
      ],
    },
  })

  if (unica.estado === 201) {
    const v = unica.json.datos.variantes[0]

    await pedir('POST', '/api/inventario/ajuste', {
      token,
      cuerpo: {
        variante_id: v.id,
        almacen_id: PISO_CENTRO,
        stock_contado: 1,
        stock_minimo: 0,
        motivo: 'Pieza unica',
      },
    })

    const cuando = new Date(Date.now() - 40 * 60 * 1000).toISOString()
    const sinConexion = (clave) => ({
      idempotency_key: clave,
      entidad: 'pedido',
      operacion: 'crear',
      creado_en_cliente: cuando,
      payload: {
        canal: 'tienda',
        tipo_entrega: 'inmediata',
        sucursal_id: SUCURSAL_CENTRO,
        creado_offline: true,
        items: [{ variante_id: v.id, cantidad: 1 }],
        pago: { metodo_pago_id: 1, monto: 890 },
      },
    })

    const lote = await pedir('POST', '/api/sync/lote', {
      token,
      dispositivo: 'caja-mostrador-demo',
      // Una de las dos tiene que fallar: es el caso que se quiere mostrar.
      esperado: true,
      cuerpo: { operaciones: [sinConexion('demo-entra'), sinConexion('demo-tarde')] },
    })

    const r = lote.json?.datos
    console.log(
      r
        ? `  ${r.aplicadas} entro, ${r.conflictos} quedo sin aplicar`
        : `  no se pudo (${lote.estado})`
    )
  }

  /* --- Posventa: una devolucion y envios ---------------------------------- */

  // Sin esto, las pantallas de devoluciones y envios se ven vacias y no hay
  // forma de mostrar ni la clasificacion de prendas al recibir ni la hoja de
  // ruta, que son las dos partes que valen de este modulo.
  console.log('\nPosventa...')

  let devoluciones = 0
  for (const entrega of entregados) {
    const pedido = await pedir('GET', `/api/pedidos/${entrega.id}`, { token: entrega.clienta.token })
    const linea = pedido.json?.datos?.items?.[0]
    if (!linea) continue

    const solicitud = await pedir('POST', '/api/devoluciones', {
      token: entrega.clienta.token,
      cuerpo: {
        pedido_id: String(entrega.id),
        motivo: 'talla_incorrecta',
        detalle: 'Me quedo grande de hombros, quiero una talla menos',
        items: [{ pedido_detalle_id: String(linea.id), cantidad: 1 }],
      },
    })

    if (solicitud.estado !== 201) continue
    devoluciones++

    // Se aprueba pero NO se recibe: asi la pantalla puede mostrar el paso de
    // clasificar prenda por prenda, que es lo que hay que poder ensenar.
    await pedir('POST', `/api/devoluciones/${solicitud.json.datos.id}/resolver`, {
      token,
      cuerpo: { aprobada: true, comentario: 'Traela y te cambiamos la talla' },
    })
  }

  console.log(`  ${devoluciones} devolucion(es) aprobadas, esperando la mercaderia`)

  // --- Envios ---
  //
  // Se arman sobre pedidos a domicilio nuevos: los de retiro en tienda no
  // generan envio, y sin envios la hoja de ruta no tiene nada que mostrar.
  const repartidor = (await pedir('GET', '/api/usuarios?rol_id=5', { token })).json?.datos?.[0]

  const DIRECCIONES = [
    { direccion: 'Av. Monsenior Rivero 340', ciudad_id: 1, referencia: 'Edificio Aranjuez, piso 3' },
    { direccion: 'Calle Libertad 918', ciudad_id: 1, referencia: 'Porton verde' },
  ]

  let envios = 0
  for (const [n, clienta] of sesiones.entries()) {
    const variantes = tomar(1)
    if (variantes.length === 0) break

    const direccion = await pedir('POST', '/api/clientes/mis-direcciones', {
      token: clienta.token,
      cuerpo: {
        alias: n === 0 ? 'Casa' : 'Trabajo',
        ...DIRECCIONES[n % DIRECCIONES.length],
      },
    })
    // `agregar` devuelve la lista entera, no la direccion creada: se busca por
    // el alias con el que se acaba de agregar.
    const creada = (direccion.json?.datos ?? []).find(
      (d) => d.alias === (n === 0 ? 'Casa' : 'Trabajo')
    )
    if (direccion.estado !== 201 || !creada) continue

    const pedido = await pedir('POST', '/api/pedidos', {
      token: clienta.token,
      cuerpo: {
        sucursal_id: SUCURSAL_CENTRO,
        tipo_entrega: 'domicilio',
        direccion_id: creada.id,
        items: variantes.map((v) => ({ variante_id: v.id, cantidad: 1 })),
      },
    })
    if (pedido.estado !== 201) continue
    pedidos++

    await pedir('POST', `/api/pedidos/${pedido.json.datos.id}/pagos`, {
      token,
      cuerpo: { metodo_pago_id: 4, monto: pedido.json.datos.total },
    })
    await pedir('POST', `/api/pedidos/${pedido.json.datos.id}/estado`, {
      token,
      cuerpo: { estado: 'preparando' },
    })

    const envio = await pedir('POST', '/api/envios', {
      token,
      cuerpo: {
        pedido_id: String(pedido.json.datos.id),
        repartidor_id: repartidor?.id,
        costo: 25,
        fecha_estimada: new Date(Date.now() + 86400000).toISOString(),
      },
    })
    if (envio.estado !== 201) continue
    envios++

    // Uno sale a ruta para que la hoja no muestre todo en "preparando".
    if (n === 0) {
      await pedir('PUT', `/api/envios/${envio.json.datos.id}`, {
        token,
        cuerpo: { estado: 'en_ruta', tracking: 'AUR-4471' },
      })
    }
  }

  console.log(`  ${envios} envios`)

  /* --- Compras a proveedores ---------------------------------------------- */

  // Sin compras cargadas, la pantalla no puede mostrar ni el ciclo —borrador,
  // confirmada, recibida— ni la recepcion contando lo que llego de verdad, que
  // es la parte que toca el inventario.
  console.log('\nCompras a proveedores...')

  const proveedores = await pedir('GET', '/api/proveedores', { token })
  const proveedor = proveedores.json?.datos?.[0]

  let compras = 0
  if (proveedor && conStock.length >= 3) {
    const armar = (variantes, costoBase) => ({
      proveedor_id: proveedor.id,
      almacen_id: DEPOSITO_CENTRO,
      descuento: 0,
      items: variantes.map((v, n) => ({
        variante_id: v.id,
        cantidad: 6 + n * 4,
        costo_unitario: costoBase + n * 15,
      })),
    })

    // Una recibida: ya entro al stock y no tiene nada pendiente.
    const recibida = await pedir('POST', '/api/compras', {
      token,
      cuerpo: armar(conStock.slice(0, 3), 120),
    })
    if (recibida.estado === 201) {
      compras++
      const id = recibida.json.datos.id
      await pedir('POST', `/api/compras/${id}/confirmar`, { token })
      // Una linea llega incompleta a proposito: es lo que de verdad pasa, y es
      // lo unico que demuestra que la recepcion cuenta y no da por buena la
      // cantidad pedida.
      await pedir('POST', `/api/compras/${id}/recibir`, {
        token,
        cuerpo: {
          items: recibida.json.datos.items.map((i, n) => ({
            variante_id: i.variante_id,
            cantidad_recibida: n === 1 ? i.cantidad - 2 : i.cantidad,
          })),
        },
      })
    }

    // Una confirmada: esperando que llegue la mercaderia.
    const enCamino = await pedir('POST', '/api/compras', {
      token,
      cuerpo: armar(conStock.slice(3, 5), 210),
    })
    if (enCamino.estado === 201) {
      compras++
      await pedir('POST', `/api/compras/${enCamino.json.datos.id}/confirmar`, { token })
    }

    // Una en borrador: todavia se puede editar o anular.
    const borrador = await pedir('POST', '/api/compras', {
      token,
      cuerpo: armar(conStock.slice(0, 2), 95),
    })
    if (borrador.estado === 201) compras++
  }

  console.log(`  ${compras} compras`)

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
