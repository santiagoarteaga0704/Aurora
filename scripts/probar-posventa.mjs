/**
 * Pruebas de promociones, devoluciones y envios.
 *
 *   node scripts/probar-posventa.mjs
 *
 * Lo que importa comprobar: que el descuento lo calcule el servidor y que no se
 * acumulen promociones, que una prenda daniada NO vuelva al stock vendible, y
 * que entregar un envio cierre el pedido.
 */
import { pathToFileURL } from 'node:url'
import { pedir, resumen, sesionAdmin, sufijo, titulo, verificar } from './ayuda-pruebas.mjs'

const ip = '10.7.0.1'
const s = sufijo()

const SUCURSAL_CENTRO = 1
const PISO_CENTRO = 1
const DEVOLUCIONES_NACIONAL = 8
const CIUDAD_SANTA_CRUZ = 1
const CATEGORIA_BLUSAS = 3

const enUnaSemana = () => new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
const hace2Dias = () => new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()

async function stockDe(token, varianteId, almacenId = PISO_CENTRO) {
  const r = await pedir('GET', `/api/inventario?variante_id=${varianteId}&almacen_id=${almacenId}`, {
    ip,
    token,
  })
  const f = r.json?.datos?.[0]
  return f ? { stock: f.stock, reservado: f.reservado } : { stock: 0, reservado: 0 }
}

/** Lleva un pedido hasta entregado, paso por paso. */
async function entregar(token, pedidoId) {
  for (const estado of ['preparando', 'listo', 'entregado']) {
    await pedir('POST', `/api/pedidos/${pedidoId}/estado`, { ip, token, cuerpo: { estado } })
  }
}

export async function probarPosventa() {
  const admin = await sesionAdmin(ip)
  const token = admin.token

  const producto = await pedir('POST', '/api/catalogo/productos', {
    ip,
    token,
    cuerpo: {
      categoria_id: CATEGORIA_BLUSAS,
      codigo: `TOP-${s}`,
      nombre: `Top de seda ${s}`,
      tipo_prenda: 'superior',
      variantes: [
        { talla_id: 3, color_id: 1, sku: `TOP-${s}-M-NE`, precio_menor: 200, precio_mayor: 160 },
        { talla_id: 4, color_id: 1, sku: `TOP-${s}-L-NE`, precio_menor: 200, precio_mayor: 160 },
      ],
    },
  })
  const [varM, varL] = producto.json.datos.variantes

  for (const v of [varM, varL]) {
    await pedir('POST', '/api/inventario/ajuste', {
      ip,
      token,
      cuerpo: {
        variante_id: v.id,
        almacen_id: PISO_CENTRO,
        stock_contado: 50,
        motivo: 'Carga para pruebas de posventa',
      },
    })
  }

  const clienta = await pedir('POST', '/api/auth/registro', {
    ip,
    cuerpo: {
      nombre: 'Clienta',
      apellido: 'Posventa',
      email: `prueba+pos${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  const tokenClienta = clienta.json.datos.token

  // --------------------------------------------------------------------------
  titulo('[R1] Promociones: el descuento lo decide el servidor')

  const fechasAlReves = await pedir('POST', '/api/promociones', {
    ip,
    token,
    cuerpo: {
      nombre: 'Mal armada',
      tipo: 'porcentaje',
      valor: 10,
      fecha_inicio: enUnaSemana(),
      fecha_fin: hace2Dias(),
    },
  })
  verificar('las fechas al reves se rechazan', fechasAlReves.estado === 422, `estado ${fechasAlReves.estado}`)

  const porcentajeImposible = await pedir('POST', '/api/promociones', {
    ip,
    token,
    cuerpo: {
      nombre: 'Regalo total',
      tipo: 'porcentaje',
      valor: 150,
      fecha_inicio: hace2Dias(),
      fecha_fin: enUnaSemana(),
    },
  })
  verificar('un porcentaje mayor a 100 se rechaza', porcentajeImposible.estado === 422)

  const sinObjetivo = await pedir('POST', '/api/promociones', {
    ip,
    token,
    cuerpo: {
      nombre: 'Sin objetivo',
      tipo: 'porcentaje',
      valor: 10,
      aplica_a: 'categoria',
      fecha_inicio: hace2Dias(),
      fecha_fin: enUnaSemana(),
    },
  })
  verificar('un alcance por categoria sin categoria se rechaza', sinObjetivo.estado === 422)

  // Se acota a la categoria de esta prueba para no alterar las otras suites.
  const diez = await pedir('POST', '/api/promociones', {
    ip,
    token,
    cuerpo: {
      nombre: `10% en blusas ${s}`,
      tipo: 'porcentaje',
      valor: 10,
      aplica_a: 'categoria',
      aplica_id: CATEGORIA_BLUSAS,
      min_compra: 300,
      fecha_inicio: hace2Dias(),
      fecha_fin: enUnaSemana(),
    },
  })
  verificar('se crea la promocion', diez.estado === 201, `estado ${diez.estado}`)
  verificar('y nace vigente', diez.json?.datos?.vigente === true)

  const chico = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: {
      sucursal_id: SUCURSAL_CENTRO,
      tipo_entrega: 'recojo_tienda',
      items: [{ variante_id: varM.id, cantidad: 1 }],
    },
  })
  verificar(
    'bajo el minimo de compra no hay descuento',
    chico.json?.datos?.descuento === 0,
    `descuento ${chico.json?.datos?.descuento}`
  )

  const grande = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: {
      sucursal_id: SUCURSAL_CENTRO,
      tipo_entrega: 'recojo_tienda',
      items: [{ variante_id: varM.id, cantidad: 2 }],
    },
  })
  verificar(
    'alcanzado el minimo, se aplica el 10%',
    grande.json?.datos?.descuento === 40,
    `descuento ${grande.json?.datos?.descuento}`
  )
  verificar('y el total lo descuenta', grande.json?.datos?.total === 360, `total ${grande.json?.datos?.total}`)

  const cuponFalso = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: {
      sucursal_id: SUCURSAL_CENTRO,
      tipo_entrega: 'recojo_tienda',
      cupon: 'NOEXISTE',
      items: [{ variante_id: varM.id, cantidad: 2 }],
    },
  })
  verificar('un cupon inexistente no falla en silencio', cuponFalso.estado === 422, `estado ${cuponFalso.estado}`)
  verificar('y avisa en el campo cupon', cuponFalso.json?.errores?.cupon !== undefined)

  const CUPON = `MITAD${s.toUpperCase()}`
  await pedir('POST', '/api/promociones', {
    ip,
    token,
    cuerpo: {
      nombre: `Cupon mitad ${s}`,
      tipo: 'porcentaje',
      valor: 50,
      codigo_cupon: CUPON,
      aplica_a: 'categoria',
      aplica_id: CATEGORIA_BLUSAS,
      usos_max: 1,
      fecha_inicio: hace2Dias(),
      fecha_fin: enUnaSemana(),
    },
  })

  const conCupon = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: {
      sucursal_id: SUCURSAL_CENTRO,
      tipo_entrega: 'recojo_tienda',
      cupon: CUPON,
      items: [{ variante_id: varM.id, cantidad: 2 }],
    },
  })
  verificar(
    'el cupon mejor le gana a la promocion abierta',
    conCupon.json?.datos?.descuento === 200,
    `descuento ${conCupon.json?.datos?.descuento}`
  )
  verificar('sin acumularse con ella', conCupon.json?.datos?.total === 200, `total ${conCupon.json?.datos?.total}`)

  const cuponAgotado = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: {
      sucursal_id: SUCURSAL_CENTRO,
      tipo_entrega: 'recojo_tienda',
      cupon: CUPON,
      items: [{ variante_id: varM.id, cantidad: 2 }],
    },
  })
  verificar(
    'agotado su unico uso, vuelve a valer la promocion abierta',
    cuponAgotado.json?.datos?.descuento === 40,
    `descuento ${cuponAgotado.json?.datos?.descuento}`
  )

  await pedir('DELETE', `/api/promociones/${diez.json.datos.id}`, { ip, token })
  await pedir('POST', '/api/promociones', {
    ip,
    token,
    cuerpo: {
      nombre: `2x1 en el top L ${s}`,
      tipo: '2x1',
      aplica_a: 'variante',
      aplica_id: varL.id,
      fecha_inicio: hace2Dias(),
      fecha_fin: enUnaSemana(),
    },
  })

  const dosPorUno = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: {
      sucursal_id: SUCURSAL_CENTRO,
      tipo_entrega: 'recojo_tienda',
      items: [{ variante_id: varL.id, cantidad: 5 }],
    },
  })
  verificar(
    'el 2x1 regala una unidad por cada dos',
    dosPorUno.json?.datos?.descuento === 400,
    `descuento ${dosPorUno.json?.datos?.descuento}`
  )
  verificar('y cobra las otras tres', dosPorUno.json?.datos?.total === 600, `total ${dosPorUno.json?.datos?.total}`)

  const otraVariante = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: {
      sucursal_id: SUCURSAL_CENTRO,
      tipo_entrega: 'recojo_tienda',
      items: [{ variante_id: varM.id, cantidad: 4 }],
    },
  })
  verificar(
    'y no alcanza a una variante fuera de la promocion',
    otraVariante.json?.datos?.descuento === 0,
    `descuento ${otraVariante.json?.datos?.descuento}`
  )

  // --------------------------------------------------------------------------
  titulo('[R2] Devoluciones')

  const sinEntregar = await pedir('POST', '/api/devoluciones', {
    ip,
    token: tokenClienta,
    cuerpo: {
      pedido_id: chico.json.datos.id,
      motivo: 'talla_incorrecta',
      items: [{ pedido_detalle_id: chico.json.datos.items[0].id, cantidad: 1 }],
    },
  })
  verificar('no se devuelve un pedido sin entregar', sinEntregar.estado === 409, `estado ${sinEntregar.estado}`)
  verificar('y el mensaje sugiere cancelarlo', /cancela/i.test(sinEntregar.json?.mensaje ?? ''), sinEntregar.json?.mensaje)

  const paraDevolver = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: {
      sucursal_id: SUCURSAL_CENTRO,
      tipo_entrega: 'recojo_tienda',
      items: [{ variante_id: varM.id, cantidad: 3 }],
    },
  })
  const pedidoId = paraDevolver.json.datos.id
  const lineaId = paraDevolver.json.datos.items[0].id
  verificar('el detalle del pedido expone el id de cada linea', typeof lineaId === 'string' && lineaId !== '')

  await entregar(token, pedidoId)
  const stockTrasVenta = await stockDe(token, varM.id)

  const deMas = await pedir('POST', '/api/devoluciones', {
    ip,
    token: tokenClienta,
    cuerpo: {
      pedido_id: pedidoId,
      motivo: 'defecto',
      items: [{ pedido_detalle_id: lineaId, cantidad: 10 }],
    },
  })
  verificar('no se devuelve mas de lo comprado', deMas.estado === 422, `estado ${deMas.estado}`)

  const lineaAjena = await pedir('POST', '/api/devoluciones', {
    ip,
    token: tokenClienta,
    cuerpo: {
      pedido_id: pedidoId,
      motivo: 'defecto',
      items: [{ pedido_detalle_id: '999999', cantidad: 1 }],
    },
  })
  verificar('una linea que no es del pedido se rechaza', lineaAjena.estado === 422, `estado ${lineaAjena.estado}`)

  const devolucion = await pedir('POST', '/api/devoluciones', {
    ip,
    token: tokenClienta,
    cuerpo: {
      pedido_id: pedidoId,
      motivo: 'defecto',
      detalle: 'Vino con una costura abierta',
      items: [{ pedido_detalle_id: lineaId, cantidad: 2 }],
    },
  })
  verificar('la clienta solicita la devolucion', devolucion.estado === 201, `estado ${devolucion.estado}`)
  verificar('nace solicitada', devolucion.json?.datos?.estado === 'solicitada')
  verificar('con numero correlativo', /^DEV-\d{6}$/.test(devolucion.json?.datos?.numero ?? ''), devolucion.json?.datos?.numero)
  verificar(
    'y calcula cuanto corresponderia reembolsar',
    devolucion.json?.datos?.monto_estimado === 400,
    `estimado ${devolucion.json?.datos?.monto_estimado}`
  )

  const devolucionId = devolucion.json.datos.id

  const recibirSinAprobar = await pedir('POST', `/api/devoluciones/${devolucionId}/recibir`, {
    ip,
    token,
    cuerpo: { items: [{ variante_id: varM.id, estado_prenda: 'nueva' }] },
  })
  verificar('no se recibe lo que no se aprobo', recibirSinAprobar.estado === 409, `estado ${recibirSinAprobar.estado}`)

  const clientaAprueba = await pedir('POST', `/api/devoluciones/${devolucionId}/resolver`, {
    ip,
    token: tokenClienta,
    cuerpo: { aprobada: true },
  })
  verificar('la clienta no aprueba su propia devolucion', clientaAprueba.estado === 403, `estado ${clientaAprueba.estado}`)

  const aprobada = await pedir('POST', `/api/devoluciones/${devolucionId}/resolver`, {
    ip,
    token,
    cuerpo: { aprobada: true },
  })
  verificar('el personal la aprueba', aprobada.json?.datos?.estado === 'aprobada')

  const reembolsarSinRecibir = await pedir('POST', `/api/devoluciones/${devolucionId}/reembolsar`, {
    ip,
    token,
    cuerpo: { monto: 400 },
  })
  verificar(
    'no se reembolsa antes de tener la prenda',
    reembolsarSinRecibir.estado === 409,
    `estado ${reembolsarSinRecibir.estado}`
  )

  // Llegan las dos: una en buen estado y otra rota.
  const recibida = await pedir('POST', `/api/devoluciones/${devolucionId}/recibir`, {
    ip,
    token,
    cuerpo: { items: [{ variante_id: varM.id, estado_prenda: 'danada' }] },
  })
  verificar('se reciben las prendas', recibida.estado === 200, `estado ${recibida.estado}`)
  verificar('queda en recibida', recibida.json?.datos?.estado === 'recibida')
  verificar(
    'una prenda daniada no vuelve al stock',
    recibida.json?.datos?.items?.[0]?.reingresa_stock === false
  )

  const stockTrasDaniada = await stockDe(token, varM.id)
  verificar(
    'y el inventario no subio',
    stockTrasDaniada.stock === stockTrasVenta.stock,
    `${stockTrasVenta.stock} -> ${stockTrasDaniada.stock}`
  )

  const deMasMonto = await pedir('POST', `/api/devoluciones/${devolucionId}/reembolsar`, {
    ip,
    token,
    cuerpo: { monto: 5000 },
  })
  verificar('no se reembolsa mas de lo que valia', deMasMonto.estado === 422, `estado ${deMasMonto.estado}`)

  const reembolsada = await pedir('POST', `/api/devoluciones/${devolucionId}/reembolsar`, {
    ip,
    token,
    cuerpo: { monto: 400 },
  })
  verificar('se registra el reembolso', reembolsada.json?.datos?.estado === 'reembolsada')
  verificar('por el monto correcto', reembolsada.json?.datos?.monto_reembolso === 400)

  const pedidoTrasParcial = await pedir('GET', `/api/pedidos/${pedidoId}`, { ip, token })
  verificar(
    'devolver una parte no marca el pedido como devuelto',
    pedidoTrasParcial.json?.datos?.estado === 'entregado',
    `estado ${pedidoTrasParcial.json?.datos?.estado}`
  )

  // La tercera unidad, esta vez en buen estado: tiene que volver al stock.
  const segunda = await pedir('POST', '/api/devoluciones', {
    ip,
    token: tokenClienta,
    cuerpo: {
      pedido_id: pedidoId,
      motivo: 'arrepentimiento',
      items: [{ pedido_detalle_id: lineaId, cantidad: 1 }],
    },
  })
  await pedir('POST', `/api/devoluciones/${segunda.json.datos.id}/resolver`, {
    ip,
    token,
    cuerpo: { aprobada: true },
  })
  await pedir('POST', `/api/devoluciones/${segunda.json.datos.id}/recibir`, {
    ip,
    token,
    cuerpo: { items: [{ variante_id: varM.id, estado_prenda: 'nueva' }] },
  })

  const stockTrasNueva = await stockDe(token, varM.id)
  verificar(
    'una prenda nueva si reingresa al almacen de venta',
    stockTrasNueva.stock === stockTrasVenta.stock + 1,
    `${stockTrasVenta.stock} -> ${stockTrasNueva.stock}`
  )

  await pedir('POST', `/api/devoluciones/${segunda.json.datos.id}/reembolsar`, {
    ip,
    token,
    cuerpo: { monto: 200 },
  })

  const pedidoDevuelto = await pedir('GET', `/api/pedidos/${pedidoId}`, { ip, token })
  verificar(
    'devuelto todo, el pedido queda devuelto',
    pedidoDevuelto.json?.datos?.estado === 'devuelto',
    `estado ${pedidoDevuelto.json?.datos?.estado}`
  )

  const usada = await pedir('GET', `/api/inventario?variante_id=${varM.id}&almacen_id=${DEVOLUCIONES_NACIONAL}`, {
    ip,
    token,
  })
  verificar(
    'el almacen de devoluciones existe para las prendas usadas',
    usada.estado === 200,
    `estado ${usada.estado}`
  )

  // --------------------------------------------------------------------------
  titulo('[R3] Envios a domicilio')

  const direccion = await pedir('POST', '/api/clientes/mis-direcciones', {
    ip,
    token: tokenClienta,
    cuerpo: {
      alias: 'Casa',
      ciudad_id: CIUDAD_SANTA_CRUZ,
      direccion: 'Av. Banzer 3er anillo, edificio Aurora, depto 4B',
      referencia: 'Puerta negra',
      telefono: '+591 70012345',
    },
  })
  verificar('la clienta guarda una direccion', direccion.estado === 201, `estado ${direccion.estado}`)
  verificar('y la primera queda como principal', direccion.json?.datos?.[0]?.es_principal === true)

  const direccionPersonal = await pedir('GET', '/api/clientes/mis-direcciones', { ip, token })
  verificar(
    'el personal no tiene direcciones de entrega',
    direccionPersonal.estado === 403,
    `estado ${direccionPersonal.estado}`
  )

  const direccionId = direccion.json.datos[0].id

  const pedidoRetiro = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: {
      sucursal_id: SUCURSAL_CENTRO,
      tipo_entrega: 'recojo_tienda',
      items: [{ variante_id: varM.id, cantidad: 1 }],
    },
  })
  await pedir('POST', `/api/pedidos/${pedidoRetiro.json.datos.id}/estado`, {
    ip,
    token,
    cuerpo: { estado: 'preparando' },
  })

  const envioDeRetiro = await pedir('POST', '/api/envios', {
    ip,
    token,
    cuerpo: { pedido_id: pedidoRetiro.json.datos.id },
  })
  verificar(
    'un pedido para retirar en tienda no lleva envio',
    envioDeRetiro.estado === 409,
    `estado ${envioDeRetiro.estado}`
  )

  const pedidoEnvio = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: {
      sucursal_id: SUCURSAL_CENTRO,
      tipo_entrega: 'domicilio',
      direccion_id: direccionId,
      costo_envio: 25,
      items: [{ variante_id: varM.id, cantidad: 1 }],
    },
  })
  verificar('se crea el pedido a domicilio', pedidoEnvio.estado === 201, `estado ${pedidoEnvio.estado}`)
  verificar('con su costo de envio', pedidoEnvio.json?.datos?.costo_envio === 25)
  verificar('sumado al total', pedidoEnvio.json?.datos?.total === 225, `total ${pedidoEnvio.json?.datos?.total}`)

  const pedidoEnvioId = pedidoEnvio.json.datos.id

  const envioPendiente = await pedir('POST', '/api/envios', {
    ip,
    token,
    cuerpo: { pedido_id: pedidoEnvioId },
  })
  verificar('no se despacha un pedido sin pagar', envioPendiente.estado === 409, `estado ${envioPendiente.estado}`)

  await pedir('POST', `/api/pedidos/${pedidoEnvioId}/pagos`, {
    ip,
    token,
    cuerpo: { metodo_pago_id: 4, monto: 225 },
  })

  // Un repartidor de verdad, dado de alta por administracion.
  const roles = await pedir('GET', '/api/roles', { ip, token })
  const rolRepartidor = roles.json.datos.find((r) => r.nombre === 'repartidor')

  const repartidor = await pedir('POST', '/api/usuarios', {
    ip,
    token,
    cuerpo: {
      rol_id: rolRepartidor.id,
      sucursal_id: SUCURSAL_CENTRO,
      nombre: 'Ramiro',
      apellido: `Reparto${s}`,
      email: `prueba+rep${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  const repartidorId = repartidor.json.datos.id

  const noEsRepartidor = await pedir('POST', '/api/envios', {
    ip,
    token,
    cuerpo: { pedido_id: pedidoEnvioId, repartidor_id: admin.usuario.id },
  })
  verificar(
    'no se asigna el reparto a quien no es repartidor',
    noEsRepartidor.estado === 422,
    `estado ${noEsRepartidor.estado}`
  )

  const envio = await pedir('POST', '/api/envios', {
    ip,
    token,
    cuerpo: { pedido_id: pedidoEnvioId, repartidor_id: repartidorId, tracking: `TRK-${s}` },
  })
  verificar('se crea el envio', envio.estado === 201, `estado ${envio.estado}`)
  verificar('en estado preparando', envio.json?.datos?.estado === 'preparando')
  verificar('con la direccion del pedido', envio.json?.datos?.direccion?.includes('Banzer'))
  verificar('y toma el costo ya cobrado', envio.json?.datos?.costo === 25, `costo ${envio.json?.datos?.costo}`)

  const envioId = envio.json.datos.id

  const duplicado = await pedir('POST', '/api/envios', {
    ip,
    token,
    cuerpo: { pedido_id: pedidoEnvioId },
  })
  verificar('no se crean dos envios del mismo pedido', duplicado.estado === 409, `estado ${duplicado.estado}`)

  const saltoInvalido = await pedir('PUT', `/api/envios/${envioId}`, {
    ip,
    token,
    cuerpo: { estado: 'entregado' },
  })
  verificar(
    'no se entrega algo que nunca salio a la calle',
    saltoInvalido.estado === 409,
    `estado ${saltoInvalido.estado}`
  )

  const enRuta = await pedir('PUT', `/api/envios/${envioId}`, {
    ip,
    token,
    cuerpo: { estado: 'en_ruta' },
  })
  verificar('sale a la calle', enRuta.json?.datos?.estado === 'en_ruta')

  const fallido = await pedir('PUT', `/api/envios/${envioId}`, {
    ip,
    token,
    cuerpo: { estado: 'fallido', comentario: 'No habia nadie' },
  })
  verificar('un intento fallido se registra', fallido.json?.datos?.estado === 'fallido')

  const reintento = await pedir('PUT', `/api/envios/${envioId}`, {
    ip,
    token,
    cuerpo: { estado: 'en_ruta' },
  })
  verificar('y se puede reintentar', reintento.json?.datos?.estado === 'en_ruta', `estado ${reintento.json?.datos?.estado}`)

  const sesionRepartidor = await pedir('POST', '/api/auth/login', {
    ip,
    cuerpo: { email: `prueba+rep${s}@aurora.bo`, password: 'ClaveSegura123' },
  })
  const tokenRepartidor = sesionRepartidor.json?.datos?.token

  const hojaDeRuta = await pedir('GET', '/api/envios', { ip, token: tokenRepartidor })
  verificar(
    'el repartidor ve su hoja de ruta',
    hojaDeRuta.estado === 200 && (hojaDeRuta.json?.meta?.total ?? 0) >= 1,
    `estado ${hojaDeRuta.estado}, total ${hojaDeRuta.json?.meta?.total}`
  )

  const entregado = await pedir('PUT', `/api/envios/${envioId}`, {
    ip,
    token,
    cuerpo: { estado: 'entregado', evidencia_url: 'https://aurora.bo/evidencias/foto.jpg' },
  })
  verificar('se entrega', entregado.json?.datos?.estado === 'entregado')
  verificar('y queda la hora de entrega', entregado.json?.datos?.entregado_en !== null)

  const pedidoCerrado = await pedir('GET', `/api/pedidos/${pedidoEnvioId}`, { ip, token })
  verificar(
    'entregar el envio cierra el pedido',
    pedidoCerrado.json?.datos?.estado === 'entregado',
    `estado ${pedidoCerrado.json?.datos?.estado}`
  )

  const historial = await pedir('GET', `/api/pedidos/${pedidoEnvioId}/historial`, { ip, token })
  verificar(
    'y lo deja asentado en el historial',
    historial.json?.datos?.some((h) => h.estado === 'entregado')
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  probarPosventa()
    .then(() => process.exit(resumen()))
    .catch((e) => {
      console.error('\nLa prueba se corto:', e.message)
      process.exit(1)
    })
}
