/**
 * Pruebas de la cadena de venta: carrito, pedido y pago.
 *
 *   node scripts/probar-ventas.mjs
 *
 * Lo que mas importa comprobar aqui no son los totales sino el stock: cuando se
 * reserva, cuando sale de verdad del almacen y cuando vuelve. Es donde un error
 * se traduce en vender algo que no esta o en trabar mercaderia para siempre.
 */
import { pathToFileURL } from 'node:url'
import { pedir, resumen, sesionAdmin, sufijo, titulo, verificar } from './ayuda-pruebas.mjs'

const ip = '10.4.0.1'
const s = sufijo()

const SUCURSAL_CENTRO = 1
const PISO_CENTRO = 1

/** Lee stock, reservado y disponible de una variante en un almacen. */
async function stockDe(token, varianteId, almacenId = PISO_CENTRO) {
  const r = await pedir('GET', `/api/inventario?variante_id=${varianteId}&almacen_id=${almacenId}`, {
    ip,
    token,
  })
  const f = r.json?.datos?.[0]
  return f
    ? { stock: f.stock, reservado: f.reservado, disponible: f.disponible }
    : { stock: 0, reservado: 0, disponible: 0 }
}

export async function probarVentas() {
  const admin = await sesionAdmin(ip)
  const token = admin.token

  // Producto con stock conocido, para poder afirmar numeros exactos.
  const producto = await pedir('POST', '/api/catalogo/productos', {
    ip,
    token,
    cuerpo: {
      categoria_id: 4,
      codigo: `PAN-${s}`,
      nombre: `Pantalon recto ${s}`,
      tipo_prenda: 'inferior',
      variantes: [
        { talla_id: 2, color_id: 1, sku: `PAN-${s}-S-NE`, precio_menor: 300, precio_mayor: 240 },
        { talla_id: 3, color_id: 1, sku: `PAN-${s}-M-NE`, precio_menor: 300, precio_mayor: 240 },
      ],
    },
  })
  const [varS, varM] = producto.json.datos.variantes

  for (const v of [varS, varM]) {
    await pedir('POST', '/api/inventario/ajuste', {
      ip,
      token,
      cuerpo: {
        variante_id: v.id,
        almacen_id: PISO_CENTRO,
        stock_contado: 20,
        motivo: 'Carga para pruebas de venta',
      },
    })
  }

  const clienta = await pedir('POST', '/api/auth/registro', {
    ip,
    cuerpo: {
      nombre: 'Clienta',
      apellido: 'Ventas',
      email: `prueba+ven${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  const tokenClienta = clienta.json.datos.token

  // --------------------------------------------------------------------------
  titulo('[P1] Carrito anonimo y fusion al iniciar sesion')

  const carritoVacio = await pedir('GET', '/api/carrito', { ip })
  verificar('el carrito funciona sin sesion', carritoVacio.estado === 200, `estado ${carritoVacio.estado}`)
  verificar('y devuelve un token para guardarlo', typeof carritoVacio.json?.datos?.session_token === 'string')

  const anonimo = carritoVacio.json.datos.session_token

  const agregado = await pedir('POST', '/api/carrito/items', {
    ip,
    carrito: anonimo,
    cuerpo: { variante_id: varS.id, cantidad: 2 },
  })
  verificar('se puede agregar sin sesion', agregado.estado === 200, `estado ${agregado.estado}`)
  verificar('y el carrito conserva su token', agregado.json?.datos?.session_token === anonimo)

  const sumar = await pedir('POST', '/api/carrito/items', {
    ip,
    carrito: anonimo,
    cuerpo: { variante_id: varS.id, cantidad: 1 },
  })
  verificar('agregar de nuevo suma en vez de reemplazar', sumar.json?.datos?.items?.[0]?.cantidad === 3)

  // Al iniciar sesion, lo que la visitante habia juntado tiene que seguir ahi.
  const fusionado = await pedir('GET', '/api/carrito', {
    ip,
    token: tokenClienta,
    carrito: anonimo,
  })
  verificar(
    'el carrito anonimo se fusiona con el de la cuenta',
    fusionado.json?.datos?.items?.[0]?.cantidad === 3,
    JSON.stringify(fusionado.json?.datos?.items?.map((i) => i.cantidad))
  )
  verificar('y pasa a tener el token de la cuenta', fusionado.json?.datos?.session_token !== anonimo)

  const anonimoBorrado = await pedir('GET', '/api/carrito', { ip, carrito: anonimo })
  verificar(
    'el carrito anonimo ya no arrastra los articulos',
    anonimoBorrado.json?.datos?.items?.length === 0
  )

  await pedir('DELETE', '/api/carrito', { ip, token: tokenClienta })

  // El carrito de la clienta: se arma ya con sesion, que es el caso comun.
  const suCarrito = await pedir('POST', '/api/carrito/items', {
    ip,
    token: tokenClienta,
    cuerpo: { variante_id: varS.id, cantidad: 3 },
  })
  verificar('el carrito con sesion calcula el subtotal', suCarrito.json?.datos?.subtotal === 900, `subtotal ${suCarrito.json?.datos?.subtotal}`)
  verificar('y usa el precio de menudeo', suCarrito.json?.datos?.items?.[0]?.precio_unitario === 300)
  verificar('reporta el disponible del articulo', suCarrito.json?.datos?.items?.[0]?.disponible === 20)

  const cambiada = await pedir('PUT', `/api/carrito/items/${varS.id}`, {
    ip,
    token: tokenClienta,
    cuerpo: { cantidad: 2 },
  })
  verificar('se puede fijar la cantidad', cambiada.json?.datos?.items?.[0]?.cantidad === 2)
  verificar('y el subtotal se recalcula', cambiada.json?.datos?.subtotal === 600)

  const otroArticulo = await pedir('POST', '/api/carrito/items', {
    ip,
    token: tokenClienta,
    cuerpo: { variante_id: varM.id, cantidad: 1 },
  })
  verificar('entra un segundo articulo', otroArticulo.json?.datos?.items?.length === 2)
  verificar('y el total del carrito los suma', otroArticulo.json?.datos?.subtotal === 900)

  const quitado = await pedir('DELETE', `/api/carrito/items/${varM.id}`, { ip, token: tokenClienta })
  verificar('se puede quitar un articulo', quitado.json?.datos?.items?.length === 1)

  // --------------------------------------------------------------------------
  titulo('[P2] Checkout online: la mercaderia se reserva, no sale')

  const antes = await stockDe(token, varS.id)
  verificar('antes del pedido hay 20 disponibles', antes.disponible === 20, JSON.stringify(antes))

  const sinSesion = await pedir('POST', '/api/pedidos', {
    ip,
    cuerpo: { sucursal_id: SUCURSAL_CENTRO, items: [{ variante_id: varS.id, cantidad: 1 }] },
  })
  verificar('el checkout exige sesion', sinSesion.estado === 401, `estado ${sinSesion.estado}`)

  const domicilioSinDireccion = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: { sucursal_id: SUCURSAL_CENTRO, tipo_entrega: 'domicilio' },
  })
  verificar('un envio a domicilio sin direccion se rechaza', domicilioSinDireccion.estado === 422)

  const pedido = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: { sucursal_id: SUCURSAL_CENTRO, tipo_entrega: 'recojo_tienda' },
  })
  verificar('el pedido se crea desde el carrito', pedido.estado === 201, `estado ${pedido.estado}`)
  verificar('nace pendiente', pedido.json?.datos?.estado === 'pendiente')
  verificar('con numero correlativo', /^PED-\d{6}$/.test(pedido.json?.datos?.numero ?? ''), pedido.json?.datos?.numero)
  verificar('toma los 2 articulos del carrito', pedido.json?.datos?.items?.[0]?.cantidad === 2)
  verificar('y calcula el total', pedido.json?.datos?.total === 600, `total ${pedido.json?.datos?.total}`)
  verificar('el saldo arranca igual al total', pedido.json?.datos?.saldo === 600)

  const pedidoId = pedido.json.datos.id

  const trasPedido = await stockDe(token, varS.id)
  verificar('el stock fisico no bajo', trasPedido.stock === 20, JSON.stringify(trasPedido))
  verificar('pero quedo reservado', trasPedido.reservado === 2, JSON.stringify(trasPedido))
  verificar('asi que el disponible bajo a 18', trasPedido.disponible === 18)

  const carritoTrasPedido = await pedir('GET', '/api/carrito', { ip, token: tokenClienta })
  verificar('el carrito queda vacio despues de comprar', carritoTrasPedido.json?.datos?.items?.length === 0)

  const deMas = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: {
      sucursal_id: SUCURSAL_CENTRO,
      tipo_entrega: 'recojo_tienda',
      items: [{ variante_id: varS.id, cantidad: 500 }],
    },
  })
  verificar('no se puede pedir mas de lo disponible', deMas.estado === 409, `estado ${deMas.estado}`)

  // --------------------------------------------------------------------------
  titulo('[P3] Pagos')

  const metodos = await pedir('GET', '/api/pagos/metodos?canal=online', { ip })
  verificar('los metodos de pago son publicos', metodos.estado === 200)
  verificar(
    'y el canal online no ofrece efectivo de mostrador',
    !metodos.json?.datos?.some((m) => m.codigo === 'efectivo'),
    JSON.stringify(metodos.json?.datos?.map((m) => m.codigo))
  )

  const efectivoEnLinea = await pedir('POST', `/api/pedidos/${pedidoId}/pagos`, {
    ip,
    token: tokenClienta,
    cuerpo: { metodo_pago_id: 1, monto: 600 },
  })
  verificar('un metodo de otro canal se rechaza', efectivoEnLinea.estado === 422, `estado ${efectivoEnLinea.estado}`)

  const deMasMonto = await pedir('POST', `/api/pedidos/${pedidoId}/pagos`, {
    ip,
    token: tokenClienta,
    cuerpo: { metodo_pago_id: 4, monto: 1000 },
  })
  verificar('no se puede pagar mas que el saldo', deMasMonto.estado === 422, `estado ${deMasMonto.estado}`)

  const qrSinComprobante = await pedir('POST', `/api/pedidos/${pedidoId}/pagos`, {
    ip,
    token: tokenClienta,
    cuerpo: { metodo_pago_id: 2, monto: 600 },
  })
  verificar('el QR exige comprobante o referencia', qrSinComprobante.estado === 422)

  const parcial = await pedir('POST', `/api/pedidos/${pedidoId}/pagos`, {
    ip,
    token: tokenClienta,
    cuerpo: { metodo_pago_id: 4, monto: 200 },
  })
  verificar('se registra un pago parcial', parcial.estado === 201, `estado ${parcial.estado}`)
  verificar(
    'y como lo carga el cliente queda pendiente de confirmar',
    parcial.json?.datos?.estado === 'pendiente',
    `estado ${parcial.json?.datos?.estado}`
  )

  const trasParcial = await pedir('GET', `/api/pedidos/${pedidoId}`, { ip, token: tokenClienta })
  verificar('un pago sin confirmar no baja el saldo', trasParcial.json?.datos?.saldo === 600)

  const confirmado = await pedir('POST', `/api/pagos/${parcial.json.datos.id}/resolver`, {
    ip,
    token,
    cuerpo: { aprobado: true },
  })
  verificar('el personal lo confirma', confirmado.json?.datos?.estado === 'confirmado')

  const trasConfirmar = await pedir('GET', `/api/pedidos/${pedidoId}`, { ip, token: tokenClienta })
  verificar('ahora si baja el saldo', trasConfirmar.json?.datos?.saldo === 400, `saldo ${trasConfirmar.json?.datos?.saldo}`)
  verificar('el pedido sigue pendiente porque falta plata', trasConfirmar.json?.datos?.estado === 'pendiente')

  const dobleConfirmacion = await pedir('POST', `/api/pagos/${parcial.json.datos.id}/resolver`, {
    ip,
    token,
    cuerpo: { aprobado: true },
  })
  verificar('un pago ya confirmado no se vuelve a confirmar', dobleConfirmacion.estado === 409)

  const resto = await pedir('POST', `/api/pedidos/${pedidoId}/pagos`, {
    ip,
    token,
    cuerpo: { metodo_pago_id: 4, monto: 400 },
  })
  verificar(
    'un pago cargado por el personal se confirma solo',
    resto.json?.datos?.estado === 'confirmado',
    `estado ${resto.json?.datos?.estado}`
  )

  const saldado = await pedir('GET', `/api/pedidos/${pedidoId}`, { ip, token: tokenClienta })
  verificar('el saldo queda en cero', saldado.json?.datos?.saldo === 0)
  verificar('y el pedido pasa a pagado', saldado.json?.datos?.estado === 'pagado', `estado ${saldado.json?.datos?.estado}`)

  const clienteResuelve = await pedir('POST', `/api/pagos/${parcial.json.datos.id}/resolver`, {
    ip,
    token: tokenClienta,
    cuerpo: { aprobado: true },
  })
  verificar('un cliente no puede confirmar pagos', clienteResuelve.estado === 403, `estado ${clienteResuelve.estado}`)

  // --------------------------------------------------------------------------
  titulo('[P4] Ciclo de vida: la reserva se convierte en salida')

  const saltoInvalido = await pedir('POST', `/api/pedidos/${pedidoId}/estado`, {
    ip,
    token,
    cuerpo: { estado: 'entregado' },
  })
  verificar('no se puede saltar de pagado a entregado', saltoInvalido.estado === 409, `estado ${saltoInvalido.estado}`)
  verificar('y el error dice que transiciones valen', saltoInvalido.json?.errores?.estado !== undefined)

  const preparando = await pedir('POST', `/api/pedidos/${pedidoId}/estado`, {
    ip,
    token,
    cuerpo: { estado: 'preparando', comentario: 'Preparado en deposito' },
  })
  verificar('pasa a preparando', preparando.json?.datos?.estado === 'preparando')

  const trasPreparar = await stockDe(token, varS.id)
  verificar('al preparar sale del almacen', trasPreparar.stock === 18, JSON.stringify(trasPreparar))
  verificar('y se libera la reserva', trasPreparar.reservado === 0, JSON.stringify(trasPreparar))
  verificar('el disponible no cambia por prepararlo', trasPreparar.disponible === 18)

  await pedir('POST', `/api/pedidos/${pedidoId}/estado`, { ip, token, cuerpo: { estado: 'listo' } })
  const entregado = await pedir('POST', `/api/pedidos/${pedidoId}/estado`, {
    ip,
    token,
    cuerpo: { estado: 'entregado' },
  })
  verificar('se puede entregar un pedido listo', entregado.json?.datos?.estado === 'entregado')

  const historial = await pedir('GET', `/api/pedidos/${pedidoId}/historial`, { ip, token: tokenClienta })
  verificar('el historial guarda cada paso', (historial.json?.datos?.length ?? 0) >= 5, `${historial.json?.datos?.length} pasos`)
  verificar('con quien lo hizo', historial.json?.datos?.at(-1)?.usuario?.includes('Administrador'))

  const cancelarEntregado = await pedir('POST', `/api/pedidos/${pedidoId}/cancelar`, {
    ip,
    token,
    cuerpo: { motivo: 'tarde' },
  })
  verificar('un pedido entregado no se cancela', cancelarEntregado.estado === 409, `estado ${cancelarEntregado.estado}`)
  verificar(
    'y el mensaje explica que corresponde una devolucion',
    /devoluci/i.test(cancelarEntregado.json?.mensaje ?? '')
  )

  // --------------------------------------------------------------------------
  titulo('[P5] Cancelacion: la reserva vuelve al disponible')

  const paraCancelar = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: {
      sucursal_id: SUCURSAL_CENTRO,
      tipo_entrega: 'recojo_tienda',
      items: [{ variante_id: varS.id, cantidad: 5 }],
    },
  })
  const reservado = await stockDe(token, varS.id)
  verificar('el pedido nuevo reserva 5', reservado.reservado === 5, JSON.stringify(reservado))
  verificar('y el disponible baja a 13', reservado.disponible === 13, JSON.stringify(reservado))

  const cancelado = await pedir('POST', `/api/pedidos/${paraCancelar.json.datos.id}/cancelar`, {
    ip,
    token: tokenClienta,
    cuerpo: { motivo: 'Me equivoque de talla' },
  })
  verificar('el propio cliente puede cancelar lo suyo', cancelado.json?.datos?.estado === 'cancelado')

  const liberado = await stockDe(token, varS.id)
  verificar('la reserva se libera', liberado.reservado === 0, JSON.stringify(liberado))
  verificar('el disponible vuelve a 18', liberado.disponible === 18, JSON.stringify(liberado))
  verificar('y el stock fisico nunca se toco', liberado.stock === 18)

  // Cancelar despues de preparar: ahi el stock ya salio y tiene que volver.
  const paraDevolver = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: {
      sucursal_id: SUCURSAL_CENTRO,
      tipo_entrega: 'recojo_tienda',
      items: [{ variante_id: varS.id, cantidad: 4 }],
    },
  })
  await pedir('POST', `/api/pedidos/${paraDevolver.json.datos.id}/estado`, {
    ip,
    token,
    cuerpo: { estado: 'preparando' },
  })
  const trasPrepararlo = await stockDe(token, varS.id)
  verificar('preparado, el stock bajo a 14', trasPrepararlo.stock === 14, JSON.stringify(trasPrepararlo))

  await pedir('POST', `/api/pedidos/${paraDevolver.json.datos.id}/cancelar`, {
    ip,
    token,
    cuerpo: { motivo: 'La clienta no vino a retirar' },
  })
  const devuelto = await stockDe(token, varS.id)
  verificar(
    'cancelar algo ya preparado devuelve el stock al almacen',
    devuelto.stock === 18,
    JSON.stringify(devuelto)
  )

  // --------------------------------------------------------------------------
  titulo('[P6] Venta de mostrador: la mercaderia sale en el acto')

  const clienteVendeEnTienda = await pedir('POST', '/api/pedidos', {
    ip,
    token: tokenClienta,
    cuerpo: {
      canal: 'tienda',
      tipo_entrega: 'inmediata',
      sucursal_id: SUCURSAL_CENTRO,
      items: [{ variante_id: varM.id, cantidad: 1 }],
    },
  })
  verificar(
    'un cliente no puede registrar una venta de mostrador',
    clienteVendeEnTienda.estado === 403,
    `estado ${clienteVendeEnTienda.estado}`
  )

  const antesMostrador = await stockDe(token, varM.id)

  const mostrador = await pedir('POST', '/api/pedidos', {
    ip,
    token,
    cuerpo: {
      canal: 'tienda',
      tipo_entrega: 'inmediata',
      sucursal_id: SUCURSAL_CENTRO,
      items: [{ variante_id: varM.id, cantidad: 3 }],
    },
  })
  verificar('el personal registra la venta', mostrador.estado === 201, `estado ${mostrador.estado}`)
  verificar('queda registrado el vendedor', mostrador.json?.datos?.vendedor?.includes('Administrador'))

  const trasMostrador = await stockDe(token, varM.id)
  verificar(
    'la venta de mostrador descuenta el stock en el acto',
    trasMostrador.stock === antesMostrador.stock - 3,
    JSON.stringify(trasMostrador)
  )
  verificar('sin dejar nada reservado', trasMostrador.reservado === 0)

  const efectivo = await pedir('POST', `/api/pedidos/${mostrador.json.datos.id}/pagos`, {
    ip,
    token,
    cuerpo: { metodo_pago_id: 1, monto: mostrador.json.datos.total },
  })
  verificar('el efectivo en mostrador se confirma al registrarlo', efectivo.json?.datos?.estado === 'confirmado')

  const ventaPagada = await pedir('GET', `/api/pedidos/${mostrador.json.datos.id}`, { ip, token })
  verificar('y la venta queda pagada', ventaPagada.json?.datos?.estado === 'pagado')

  // --------------------------------------------------------------------------
  titulo('[P7] Idempotencia: la venta offline no se duplica')

  const clave = `prueba-${s}-idem`
  const primera = await pedir('POST', '/api/pedidos', {
    ip,
    token,
    idempotencia: clave,
    cuerpo: {
      canal: 'tienda',
      tipo_entrega: 'inmediata',
      sucursal_id: SUCURSAL_CENTRO,
      creado_offline: true,
      items: [{ variante_id: varM.id, cantidad: 1 }],
    },
  })
  verificar('la venta sincronizada se registra', primera.estado === 201, `estado ${primera.estado}`)
  verificar('y queda marcada como hecha sin conexion', primera.json?.datos?.creado_offline === true)

  const stockTrasPrimera = await stockDe(token, varM.id)

  const reintento = await pedir('POST', '/api/pedidos', {
    ip,
    token,
    idempotencia: clave,
    cuerpo: {
      canal: 'tienda',
      tipo_entrega: 'inmediata',
      sucursal_id: SUCURSAL_CENTRO,
      creado_offline: true,
      items: [{ variante_id: varM.id, cantidad: 1 }],
    },
  })
  verificar(
    'el reintento devuelve el mismo pedido',
    reintento.json?.datos?.id === primera.json?.datos?.id,
    `${primera.json?.datos?.numero} vs ${reintento.json?.datos?.numero}`
  )

  const stockTrasReintento = await stockDe(token, varM.id)
  verificar(
    'y no descuenta el stock dos veces',
    stockTrasReintento.stock === stockTrasPrimera.stock,
    `${stockTrasPrimera.stock} -> ${stockTrasReintento.stock}`
  )

  // --------------------------------------------------------------------------
  titulo('[P8] Un cliente no ve los pedidos de otro')

  const otra = await pedir('POST', '/api/auth/registro', {
    ip,
    cuerpo: {
      nombre: 'Otra',
      apellido: 'Clienta',
      email: `prueba+otr${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  const tokenOtra = otra.json.datos.token

  const ajeno = await pedir('GET', `/api/pedidos/${pedidoId}`, { ip, token: tokenOtra })
  verificar('leer el pedido ajeno da 404', ajeno.estado === 404, `estado ${ajeno.estado}`)

  const suLista = await pedir('GET', '/api/pedidos', { ip, token: tokenOtra })
  verificar('y su listado viene vacio', suLista.json?.meta?.total === 0, `total ${suLista.json?.meta?.total}`)

  const listaClienta = await pedir('GET', '/api/pedidos', { ip, token: tokenClienta })
  verificar('cada quien ve los suyos', (listaClienta.json?.meta?.total ?? 0) >= 3, `total ${listaClienta.json?.meta?.total}`)

  const listaAdmin = await pedir('GET', `/api/pedidos?sucursal_id=${SUCURSAL_CENTRO}`, { ip, token })
  verificar('el personal ve los de la sucursal', (listaAdmin.json?.meta?.total ?? 0) >= 5, `total ${listaAdmin.json?.meta?.total}`)

  const cancelarAjeno = await pedir('POST', `/api/pedidos/${pedidoId}/cancelar`, {
    ip,
    token: tokenOtra,
    cuerpo: { motivo: 'no es mio' },
  })
  verificar('no se puede cancelar un pedido ajeno', cancelarAjeno.estado === 404, `estado ${cancelarAjeno.estado}`)
  verificar(
    'y el 404 no revela en que estado esta',
    !/entregado|preparando|pagado/i.test(cancelarAjeno.json?.mensaje ?? ''),
    cancelarAjeno.json?.mensaje
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  probarVentas()
    .then(() => process.exit(resumen()))
    .catch((e) => {
      console.error('\nLa prueba se corto:', e.message)
      process.exit(1)
    })
}
