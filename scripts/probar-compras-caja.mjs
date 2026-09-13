/**
 * Pruebas de compras a proveedores y de caja.
 *
 *   node scripts/probar-compras-caja.mjs
 *
 * Lo que se comprueba en compras es cuando sube el stock (solo al recibir) y
 * que una recepcion parcial corrija el documento en vez de inventar mercaderia.
 * En caja, que el arqueo cuadre y que un cobro en efectivo de mostrador entre
 * solo al turno abierto.
 */
import { pathToFileURL } from 'node:url'
import { pedir, resumen, sesionAdmin, sufijo, titulo, verificar } from './ayuda-pruebas.mjs'

const ip = '10.5.0.1'
const s = sufijo()

const SUCURSAL_CENTRO = 1
const PISO_CENTRO = 1
const CENTRAL = 7

async function stockDe(token, varianteId, almacenId) {
  const r = await pedir('GET', `/api/inventario?variante_id=${varianteId}&almacen_id=${almacenId}`, {
    ip,
    token,
  })
  return r.json?.datos?.[0]?.stock ?? 0
}

export async function probarComprasYCaja() {
  const admin = await sesionAdmin(ip)
  const token = admin.token

  const cliente = await pedir('POST', '/api/auth/registro', {
    ip,
    cuerpo: {
      nombre: 'Clienta',
      apellido: 'Compras',
      email: `prueba+com${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  const tokenCliente = cliente.json.datos.token

  const producto = await pedir('POST', '/api/catalogo/productos', {
    ip,
    token,
    cuerpo: {
      categoria_id: 5,
      codigo: `FAL-${s}`,
      nombre: `Falda plisada ${s}`,
      tipo_prenda: 'inferior',
      variantes: [
        { talla_id: 2, color_id: 1, sku: `FAL-${s}-S-NE`, precio_menor: 260, precio_mayor: 200 },
        { talla_id: 3, color_id: 1, sku: `FAL-${s}-M-NE`, precio_menor: 260, precio_mayor: 200 },
      ],
    },
  })
  const [varS, varM] = producto.json.datos.variantes

  // --------------------------------------------------------------------------
  titulo('[K1] Proveedores')

  const sinPermiso = await pedir('GET', '/api/proveedores', { ip, token: tokenCliente })
  verificar('un cliente no ve los proveedores', sinPermiso.estado === 403, `estado ${sinPermiso.estado}`)

  const sembrados = await pedir('GET', '/api/proveedores', { ip, token })
  verificar('el seed dejo proveedores cargados', (sembrados.json?.datos?.length ?? 0) >= 3)

  const correoMalo = await pedir('POST', '/api/proveedores', {
    ip,
    token,
    cuerpo: { nombre: 'Proveedor Raro', email: 'no-es-correo' },
  })
  verificar('un correo invalido se rechaza', correoMalo.estado === 422)

  const proveedor = await pedir('POST', '/api/proveedores', {
    ip,
    token,
    cuerpo: {
      nombre: `Textiles Prueba ${s}`,
      nit: '9876543210',
      contacto: 'Rosa Mamani',
      email: `ventas${s}@textiles.bo`,
    },
  })
  verificar('se da de alta un proveedor', proveedor.estado === 201, `estado ${proveedor.estado}`)

  const proveedorId = proveedor.json.datos.id

  // --------------------------------------------------------------------------
  titulo('[K2] Compra: el stock sube solo al recibir')

  const repetida = await pedir('POST', '/api/compras', {
    ip,
    token,
    cuerpo: {
      proveedor_id: proveedorId,
      almacen_id: CENTRAL,
      items: [
        { variante_id: varS.id, cantidad: 10, costo_unitario: 120 },
        { variante_id: varS.id, cantidad: 5, costo_unitario: 120 },
      ],
    },
  })
  verificar('una variante repetida se rechaza', repetida.estado === 422, `estado ${repetida.estado}`)

  const descuentoExcesivo = await pedir('POST', '/api/compras', {
    ip,
    token,
    cuerpo: {
      proveedor_id: proveedorId,
      almacen_id: CENTRAL,
      descuento: 99999,
      items: [{ variante_id: varS.id, cantidad: 10, costo_unitario: 120 }],
    },
  })
  verificar('un descuento mayor al subtotal se rechaza', descuentoExcesivo.estado === 422)

  const compra = await pedir('POST', '/api/compras', {
    ip,
    token,
    cuerpo: {
      proveedor_id: proveedorId,
      almacen_id: CENTRAL,
      descuento: 200,
      items: [
        { variante_id: varS.id, cantidad: 30, costo_unitario: 120 },
        { variante_id: varM.id, cantidad: 20, costo_unitario: 120 },
      ],
    },
  })
  verificar('la compra se registra', compra.estado === 201, `estado ${compra.estado}`)
  verificar('nace en borrador', compra.json?.datos?.estado === 'borrador')
  verificar('con numero correlativo', /^COM-\d{6}$/.test(compra.json?.datos?.numero ?? ''), compra.json?.datos?.numero)
  verificar('calcula el subtotal', compra.json?.datos?.subtotal === 6000, `subtotal ${compra.json?.datos?.subtotal}`)
  verificar('y aplica el descuento al total', compra.json?.datos?.total === 5800, `total ${compra.json?.datos?.total}`)

  const compraId = compra.json.datos.id

  const stockAntes = await stockDe(token, varS.id, CENTRAL)
  verificar('registrar la compra no toca el stock', stockAntes === 0, `stock ${stockAntes}`)

  const confirmada = await pedir('POST', `/api/compras/${compraId}/confirmar`, { ip, token })
  verificar('se confirma ante el proveedor', confirmada.json?.datos?.estado === 'confirmada')

  const stockTrasConfirmar = await stockDe(token, varS.id, CENTRAL)
  verificar('confirmar tampoco toca el stock', stockTrasConfirmar === 0, `stock ${stockTrasConfirmar}`)

  const dobleConfirmacion = await pedir('POST', `/api/compras/${compraId}/confirmar`, { ip, token })
  verificar('no se confirma dos veces', dobleConfirmacion.estado === 409, `estado ${dobleConfirmacion.estado}`)

  const recibirDeMas = await pedir('POST', `/api/compras/${compraId}/recibir`, {
    ip,
    token,
    cuerpo: { items: [{ variante_id: varS.id, cantidad_recibida: 999 }] },
  })
  verificar('no se puede recibir mas de lo pedido', recibirDeMas.estado === 422, `estado ${recibirDeMas.estado}`)

  // Llegan 25 de 30 de la primera variante; de la segunda, todo.
  const recibida = await pedir('POST', `/api/compras/${compraId}/recibir`, {
    ip,
    token,
    cuerpo: { items: [{ variante_id: varS.id, cantidad_recibida: 25 }] },
  })
  verificar('se recibe', recibida.estado === 200, `estado ${recibida.estado}`)
  verificar('queda en estado recibida', recibida.json?.datos?.estado === 'recibida')

  const stockDespues = await stockDe(token, varS.id, CENTRAL)
  verificar('entra al almacen lo que llego, no lo pedido', stockDespues === 25, `stock ${stockDespues}`)

  const stockOtra = await stockDe(token, varM.id, CENTRAL)
  verificar('la linea no declarada entra completa', stockOtra === 20, `stock ${stockOtra}`)

  verificar(
    'el documento se corrige a lo recibido',
    recibida.json?.datos?.items?.find((i) => i.variante_id === varS.id)?.cantidad === 25
  )
  verificar(
    'y el total se recalcula sobre lo que llego',
    recibida.json?.datos?.total === 5200,
    `total ${recibida.json?.datos?.total}`
  )

  const kardex = await pedir('GET', `/api/inventario/movimientos?variante_id=${varS.id}`, { ip, token })
  verificar('el kardex registra la entrada', kardex.json?.datos?.[0]?.tipo === 'entrada')
  verificar('apuntando a la compra', kardex.json?.datos?.[0]?.referencia?.startsWith('compra:'))

  const anularRecibida = await pedir('POST', `/api/compras/${compraId}/anular`, {
    ip,
    token,
    cuerpo: { motivo: 'me arrepenti' },
  })
  verificar('una compra recibida no se anula', anularRecibida.estado === 409, `estado ${anularRecibida.estado}`)

  const paraAnular = await pedir('POST', '/api/compras', {
    ip,
    token,
    cuerpo: {
      proveedor_id: proveedorId,
      almacen_id: CENTRAL,
      items: [{ variante_id: varS.id, cantidad: 5, costo_unitario: 120 }],
    },
  })
  const anulada = await pedir('POST', `/api/compras/${paraAnular.json.datos.id}/anular`, {
    ip,
    token,
    cuerpo: { motivo: 'El proveedor no tiene stock' },
  })
  verificar('una compra sin recibir si se anula', anulada.json?.datos?.estado === 'anulada')

  const stockTrasAnular = await stockDe(token, varS.id, CENTRAL)
  verificar('y anular no movio el inventario', stockTrasAnular === 25, `stock ${stockTrasAnular}`)

  // --------------------------------------------------------------------------
  titulo('[K3] Caja: apertura, movimientos y arqueo')

  const cajaCliente = await pedir('POST', '/api/caja/abrir', {
    ip,
    token: tokenCliente,
    cuerpo: { sucursal_id: SUCURSAL_CENTRO, monto_apertura: 100 },
  })
  verificar('un cliente no abre caja', cajaCliente.estado === 403, `estado ${cajaCliente.estado}`)

  const sinCaja = await pedir('GET', '/api/caja/mia', { ip, token })
  verificar('sin turno abierto no hay caja', sinCaja.json?.datos === null)

  const caja = await pedir('POST', '/api/caja/abrir', {
    ip,
    token,
    cuerpo: { sucursal_id: SUCURSAL_CENTRO, monto_apertura: 500 },
  })
  verificar('se abre la caja', caja.estado === 201, `estado ${caja.estado}`)
  verificar('con su monto de apertura', caja.json?.datos?.monto_apertura === 500)
  verificar('y el esperado arranca igual', caja.json?.datos?.monto_esperado === 500)

  const cajaId = caja.json.datos.id

  const segunda = await pedir('POST', '/api/caja/abrir', {
    ip,
    token,
    cuerpo: { sucursal_id: SUCURSAL_CENTRO, monto_apertura: 100 },
  })
  verificar('no se abren dos cajas a la vez', segunda.estado === 409, `estado ${segunda.estado}`)

  const mia = await pedir('GET', '/api/caja/mia', { ip, token })
  verificar('la caja abierta aparece como mia', mia.json?.datos?.id === cajaId)

  const egresoImposible = await pedir('POST', `/api/caja/${cajaId}/movimientos`, {
    ip,
    token,
    cuerpo: { tipo: 'egreso', monto: 5000, concepto: 'Retiro imposible' },
  })
  verificar('no se saca mas de lo que hay', egresoImposible.estado === 422, `estado ${egresoImposible.estado}`)

  const sinConcepto = await pedir('POST', `/api/caja/${cajaId}/movimientos`, {
    ip,
    token,
    cuerpo: { tipo: 'ingreso', monto: 50 },
  })
  verificar('el concepto es obligatorio', sinConcepto.estado === 422)

  const egreso = await pedir('POST', `/api/caja/${cajaId}/movimientos`, {
    ip,
    token,
    cuerpo: { tipo: 'egreso', monto: 120, concepto: 'Compra de bolsas y etiquetas' },
  })
  verificar('se registra un egreso', egreso.estado === 200, `estado ${egreso.estado}`)
  verificar('y baja el esperado', egreso.json?.datos?.monto_esperado === 380, `esperado ${egreso.json?.datos?.monto_esperado}`)

  // --------------------------------------------------------------------------
  titulo('[K4] El cobro en efectivo entra solo a la caja')

  await pedir('POST', '/api/inventario/ajuste', {
    ip,
    token,
    cuerpo: {
      variante_id: varM.id,
      almacen_id: PISO_CENTRO,
      stock_contado: 10,
      motivo: 'Carga para venta de mostrador',
    },
  })

  const venta = await pedir('POST', '/api/pedidos', {
    ip,
    token,
    cuerpo: {
      canal: 'tienda',
      tipo_entrega: 'inmediata',
      sucursal_id: SUCURSAL_CENTRO,
      items: [{ variante_id: varM.id, cantidad: 2 }],
    },
  })
  const totalVenta = venta.json.datos.total
  verificar('la venta de mostrador suma 520', totalVenta === 520, `total ${totalVenta}`)

  await pedir('POST', `/api/pedidos/${venta.json.datos.id}/pagos`, {
    ip,
    token,
    cuerpo: { metodo_pago_id: 1, monto: totalVenta },
  })

  const trasCobro = await pedir('GET', `/api/caja/${cajaId}`, { ip, token })
  verificar(
    'el cobro en efectivo entro a la caja sin que nadie lo anotara',
    trasCobro.json?.datos?.ingresos === 520,
    `ingresos ${trasCobro.json?.datos?.ingresos}`
  )
  verificar(
    'el movimiento queda atado al pago',
    trasCobro.json?.datos?.movimientos?.some((m) => m.pago_id !== null)
  )
  verificar(
    'y el esperado sube',
    trasCobro.json?.datos?.monto_esperado === 900,
    `esperado ${trasCobro.json?.datos?.monto_esperado}`
  )

  // Una tarjeta no pone billetes en el cajon, asi que no debe tocar el arqueo.
  const ventaTarjeta = await pedir('POST', '/api/pedidos', {
    ip,
    token,
    cuerpo: {
      canal: 'tienda',
      tipo_entrega: 'inmediata',
      sucursal_id: SUCURSAL_CENTRO,
      items: [{ variante_id: varM.id, cantidad: 1 }],
    },
  })
  await pedir('POST', `/api/pedidos/${ventaTarjeta.json.datos.id}/pagos`, {
    ip,
    token,
    cuerpo: { metodo_pago_id: 3, monto: ventaTarjeta.json.datos.total },
  })

  const trasTarjeta = await pedir('GET', `/api/caja/${cajaId}`, { ip, token })
  verificar(
    'un cobro con tarjeta no entra al arqueo de efectivo',
    trasTarjeta.json?.datos?.ingresos === 520,
    `ingresos ${trasTarjeta.json?.datos?.ingresos}`
  )

  // --------------------------------------------------------------------------
  titulo('[K5] Cierre con arqueo')

  const faltante = await pedir('POST', `/api/caja/${cajaId}/cerrar`, {
    ip,
    token,
    cuerpo: { monto_contado: 880, observacion: 'Faltaron 20' },
  })
  verificar('la caja se cierra', faltante.estado === 200, `estado ${faltante.estado}`)
  verificar('guarda lo esperado', faltante.json?.datos?.monto_esperado === 900)
  verificar('lo contado', faltante.json?.datos?.monto_cierre === 880)
  verificar('y la diferencia', faltante.json?.datos?.diferencia === -20, `diferencia ${faltante.json?.datos?.diferencia}`)
  verificar('el mensaje avisa del faltante', /faltante/i.test(faltante.json?.mensaje ?? ''), faltante.json?.mensaje)

  const cerrarDeNuevo = await pedir('POST', `/api/caja/${cajaId}/cerrar`, {
    ip,
    token,
    cuerpo: { monto_contado: 900 },
  })
  verificar('una caja cerrada no se vuelve a cerrar', cerrarDeNuevo.estado === 409, `estado ${cerrarDeNuevo.estado}`)

  const nuevaCaja = await pedir('POST', '/api/caja/abrir', {
    ip,
    token,
    cuerpo: { sucursal_id: SUCURSAL_CENTRO, monto_apertura: 300 },
  })
  verificar('cerrada la anterior, se puede abrir otra', nuevaCaja.estado === 201, `estado ${nuevaCaja.estado}`)

  await pedir('POST', `/api/caja/${nuevaCaja.json.datos.id}/cerrar`, {
    ip,
    token,
    cuerpo: { monto_contado: 300 },
  })

  const historial = await pedir('GET', `/api/caja?sucursal_id=${SUCURSAL_CENTRO}`, { ip, token })
  verificar('el historial lista las cajas', (historial.json?.meta?.total ?? 0) >= 2, `total ${historial.json?.meta?.total}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  probarComprasYCaja()
    .then(() => process.exit(resumen()))
    .catch((e) => {
      console.error('\nLa prueba se corto:', e.message)
      process.exit(1)
    })
}
