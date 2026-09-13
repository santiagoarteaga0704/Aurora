/**
 * Pruebas de inventario y transferencias.
 *
 *   node scripts/probar-inventario.mjs
 *
 * Se apoyan en los almacenes que siembra el seed:
 *   1 Piso de venta Centro (sucursal 1)   2 Deposito Centro (sucursal 1)
 *   7 Almacen central     (sucursal 5)    8 Devoluciones nacionales (sucursal 5)
 */
import { pathToFileURL } from 'node:url'
import { pedir, resumen, sesionAdmin, sufijo, titulo, verificar } from './ayuda-pruebas.mjs'

const ip = '10.3.0.1'
const s = sufijo()

const PISO_CENTRO = 1
const DEPOSITO_CENTRO = 2
const CENTRAL = 7

export async function probarInventario() {
  const admin = await sesionAdmin(ip)
  const token = admin.token

  const cliente = await pedir('POST', '/api/auth/registro', {
    ip,
    cuerpo: {
      nombre: 'Clienta',
      apellido: 'Inventario',
      email: `prueba+inv${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  const tokenCliente = cliente.json?.datos?.token

  // Producto propio de esta suite, para no depender de lo que dejaron otras.
  const producto = await pedir('POST', '/api/catalogo/productos', {
    ip,
    token,
    cuerpo: {
      categoria_id: 3,
      codigo: `BLU-${s}`,
      nombre: `Blusa de lino ${s}`,
      descripcion: 'Blusa de lino con botones de nacar.',
      tipo_prenda: 'superior',
      variantes: [
        { talla_id: 2, color_id: 2, sku: `BLU-${s}-S-BL`, precio_menor: 220, precio_mayor: 170 },
        { talla_id: 3, color_id: 2, sku: `BLU-${s}-M-BL`, precio_menor: 220, precio_mayor: 170 },
      ],
    },
  })
  const [varS, varM] = producto.json.datos.variantes
  const slug = producto.json.datos.slug

  // --------------------------------------------------------------------------
  titulo('[V1] Permisos del inventario')

  const sinSesion = await pedir('GET', '/api/inventario', { ip })
  verificar('sin sesion no se consulta stock', sinSesion.estado === 401, `estado ${sinSesion.estado}`)

  const comoCliente = await pedir('GET', '/api/inventario', { ip, token: tokenCliente })
  verificar('un cliente no ve el inventario', comoCliente.estado === 403, `estado ${comoCliente.estado}`)

  const ajusteCliente = await pedir('POST', '/api/inventario/ajuste', {
    ip,
    token: tokenCliente,
    cuerpo: { variante_id: varS.id, almacen_id: PISO_CENTRO, stock_contado: 100, motivo: 'no deberia' },
  })
  verificar('ni ajusta stock', ajusteCliente.estado === 403, `estado ${ajusteCliente.estado}`)

  // --------------------------------------------------------------------------
  titulo('[V2] Ajuste por conteo fisico')

  const sinMotivo = await pedir('POST', '/api/inventario/ajuste', {
    ip,
    token,
    cuerpo: { variante_id: varS.id, almacen_id: PISO_CENTRO, stock_contado: 10 },
  })
  verificar('el motivo es obligatorio', sinMotivo.estado === 422, `estado ${sinMotivo.estado}`)

  const negativo = await pedir('POST', '/api/inventario/ajuste', {
    ip,
    token,
    cuerpo: { variante_id: varS.id, almacen_id: PISO_CENTRO, stock_contado: -5, motivo: 'imposible' },
  })
  verificar('no se puede contar stock negativo', negativo.estado === 422)

  const almacenFalso = await pedir('POST', '/api/inventario/ajuste', {
    ip,
    token,
    cuerpo: { variante_id: varS.id, almacen_id: 9999, stock_contado: 10, motivo: 'almacen inexistente' },
  })
  verificar('un almacen inexistente se rechaza', almacenFalso.json?.errores?.almacen_id !== undefined)

  const primerAjuste = await pedir('POST', '/api/inventario/ajuste', {
    ip,
    token,
    cuerpo: {
      variante_id: varS.id,
      almacen_id: PISO_CENTRO,
      stock_contado: 24,
      stock_minimo: 5,
      motivo: 'Carga inicial de temporada',
    },
  })
  verificar('el primer ajuste crea la fila de stock', primerAjuste.estado === 200, `estado ${primerAjuste.estado}`)
  verificar('parte de cero', primerAjuste.json?.datos?.stock_previo === 0)
  verificar('y registra la diferencia', primerAjuste.json?.datos?.diferencia === 24)

  const segundoAjuste = await pedir('POST', '/api/inventario/ajuste', {
    ip,
    token,
    cuerpo: {
      variante_id: varS.id,
      almacen_id: PISO_CENTRO,
      stock_contado: 21,
      motivo: 'Conteo semanal: faltaban 3',
    },
  })
  verificar('un conteo menor da diferencia negativa', segundoAjuste.json?.datos?.diferencia === -3)
  verificar('y deja el stock en lo contado', segundoAjuste.json?.datos?.stock_actual === 21)

  const sinCambio = await pedir('POST', '/api/inventario/ajuste', {
    ip,
    token,
    cuerpo: { variante_id: varS.id, almacen_id: PISO_CENTRO, stock_contado: 21, motivo: 'Conteo sin novedad' },
  })
  verificar('un conteo que coincide no mueve nada', sinCambio.json?.datos?.diferencia === 0)

  await pedir('POST', '/api/inventario/ajuste', {
    ip,
    token,
    cuerpo: { variante_id: varM.id, almacen_id: CENTRAL, stock_contado: 40, motivo: 'Carga inicial central' },
  })
  await pedir('POST', '/api/inventario/ajuste', {
    ip,
    token,
    cuerpo: {
      variante_id: varS.id,
      almacen_id: CENTRAL,
      stock_contado: 3,
      stock_minimo: 10,
      motivo: 'Carga inicial central',
    },
  })

  // --------------------------------------------------------------------------
  titulo('[V3] Consulta de stock')

  const consulta = await pedir('GET', `/api/inventario?q=BLU-${s}`, { ip, token })
  verificar('la consulta devuelve las filas cargadas', (consulta.json?.meta?.total ?? 0) >= 3, `total ${consulta.json?.meta?.total}`)

  const fila = consulta.json.datos.find((f) => f.almacen_id === PISO_CENTRO && f.sku === varS.sku)
  verificar('trae producto, talla, color y almacen resueltos', fila?.producto?.startsWith('Blusa de lino'))
  verificar('el disponible descuenta lo reservado', fila?.disponible === 21 && fila?.reservado === 0)

  const bajoMinimo = await pedir('GET', `/api/inventario?q=BLU-${s}&solo_bajo_minimo=true`, { ip, token })
  verificar(
    'el filtro de bajo minimo trae solo lo que esta en o por debajo',
    bajoMinimo.json?.datos?.every((f) => f.bajo_minimo === true) &&
      bajoMinimo.json?.datos?.some((f) => f.almacen_id === CENTRAL && f.sku === varS.sku),
    `${bajoMinimo.json?.meta?.total} fila(s)`
  )

  const porSucursal = await pedir('GET', `/api/inventario/sucursal?q=BLU-${s}`, { ip, token })
  verificar('la vista por sucursal responde', porSucursal.estado === 200, `estado ${porSucursal.estado}`)
  const centro = porSucursal.json?.datos?.find((f) => f.sucursal_id === 1 && f.sku === varS.sku)
  verificar('y consolida el stock de la sucursal', centro?.stock_total === 21, `stock_total ${centro?.stock_total}`)

  const fichaConStock = await pedir('GET', `/api/catalogo/productos/${slug}`, { ip })
  verificar(
    'el catalogo ya muestra el stock disponible',
    fichaConStock.json?.datos?.disponible === 64,
    `disponible ${fichaConStock.json?.datos?.disponible}`
  )

  // --------------------------------------------------------------------------
  titulo('[V4] Kardex de movimientos')

  const kardex = await pedir('GET', `/api/inventario/movimientos?variante_id=${varS.id}`, { ip, token })
  verificar('el kardex lista los movimientos', (kardex.json?.meta?.total ?? 0) >= 3, `total ${kardex.json?.meta?.total}`)
  verificar('todos son de tipo ajuste', kardex.json?.datos?.every((m) => m.tipo === 'ajuste'))
  verificar('cada uno guarda el stock resultante', typeof kardex.json?.datos?.[0]?.stock_resultante === 'number')
  verificar('y quien lo hizo', kardex.json?.datos?.[0]?.usuario?.includes('Administrador'))
  verificar('el conteo sin diferencia no genero movimiento', kardex.json?.meta?.total === 3, `total ${kardex.json?.meta?.total}`)

  // --------------------------------------------------------------------------
  titulo('[V5] Transferencia completa entre almacenes')

  const mismoAlmacen = await pedir('POST', '/api/transferencias', {
    ip,
    token,
    cuerpo: {
      almacen_origen_id: CENTRAL,
      almacen_destino_id: CENTRAL,
      items: [{ variante_id: varM.id, cantidad: 1 }],
    },
  })
  verificar('origen y destino iguales se rechaza', mismoAlmacen.estado === 422, `estado ${mismoAlmacen.estado}`)

  const varianteRepetida = await pedir('POST', '/api/transferencias', {
    ip,
    token,
    cuerpo: {
      almacen_origen_id: CENTRAL,
      almacen_destino_id: PISO_CENTRO,
      items: [
        { variante_id: varM.id, cantidad: 1 },
        { variante_id: varM.id, cantidad: 2 },
      ],
    },
  })
  verificar('una variante repetida en el detalle se rechaza', varianteRepetida.estado === 422)

  const transferencia = await pedir('POST', '/api/transferencias', {
    ip,
    token,
    cuerpo: {
      almacen_origen_id: CENTRAL,
      almacen_destino_id: PISO_CENTRO,
      observacion: 'Reposicion de temporada',
      items: [{ variante_id: varM.id, cantidad: 10 }],
    },
  })
  verificar('la transferencia se crea', transferencia.estado === 201, `estado ${transferencia.estado}`)
  verificar('nace en estado solicitada', transferencia.json?.datos?.estado === 'solicitada')
  verificar('y recibe un numero correlativo', /^TRF-\d{6}$/.test(transferencia.json?.datos?.numero ?? ''), transferencia.json?.datos?.numero)

  const idTr = transferencia.json.datos.id

  const stockAntes = await pedir('GET', `/api/inventario?variante_id=${varM.id}&almacen_id=${CENTRAL}`, { ip, token })
  verificar(
    'solicitar todavia no mueve el stock del origen',
    stockAntes.json?.datos?.[0]?.stock === 40,
    `stock ${stockAntes.json?.datos?.[0]?.stock}`
  )

  const recibirAntesDeAprobar = await pedir('POST', `/api/transferencias/${idTr}/recibir`, {
    ip,
    token,
    cuerpo: { items: [{ variante_id: varM.id, cantidad_recibida: 10 }] },
  })
  verificar(
    'no se puede recibir algo que no se despacho',
    recibirAntesDeAprobar.estado === 409,
    `estado ${recibirAntesDeAprobar.estado}`
  )

  const aprobada = await pedir('POST', `/api/transferencias/${idTr}/aprobar`, { ip, token })
  verificar('se aprueba', aprobada.estado === 200, `estado ${aprobada.estado}`)
  verificar('y pasa a en transito', aprobada.json?.datos?.estado === 'en_transito')

  const stockDespacho = await pedir('GET', `/api/inventario?variante_id=${varM.id}&almacen_id=${CENTRAL}`, { ip, token })
  verificar(
    'al aprobar sale del origen',
    stockDespacho.json?.datos?.[0]?.stock === 30,
    `stock ${stockDespacho.json?.datos?.[0]?.stock}`
  )

  const dobleAprobacion = await pedir('POST', `/api/transferencias/${idTr}/aprobar`, { ip, token })
  verificar('no se puede aprobar dos veces', dobleAprobacion.estado === 409, `estado ${dobleAprobacion.estado}`)

  const rechazarEnTransito = await pedir('POST', `/api/transferencias/${idTr}/rechazar`, {
    ip,
    token,
    cuerpo: { motivo: 'ya salio, no corresponde' },
  })
  verificar('ni rechazar lo que ya salio', rechazarEnTransito.estado === 409, `estado ${rechazarEnTransito.estado}`)

  const recibirDeMas = await pedir('POST', `/api/transferencias/${idTr}/recibir`, {
    ip,
    token,
    cuerpo: { items: [{ variante_id: varM.id, cantidad_recibida: 99 }] },
  })
  verificar('no se puede recibir mas de lo enviado', recibirDeMas.estado === 422, `estado ${recibirDeMas.estado}`)

  const recibida = await pedir('POST', `/api/transferencias/${idTr}/recibir`, {
    ip,
    token,
    cuerpo: { items: [{ variante_id: varM.id, cantidad_recibida: 8 }], observacion: 'Llegaron 8 de 10' },
  })
  verificar('se recibe', recibida.estado === 200, `estado ${recibida.estado}`)
  verificar('queda en estado recibida', recibida.json?.datos?.estado === 'recibida')
  verificar('y el faltante queda registrado', recibida.json?.datos?.faltantes?.length === 1, JSON.stringify(recibida.json?.datos?.faltantes))

  const stockDestino = await pedir('GET', `/api/inventario?variante_id=${varM.id}&almacen_id=${PISO_CENTRO}`, { ip, token })
  verificar(
    'al destino entra lo que llego, no lo que salio',
    stockDestino.json?.datos?.[0]?.stock === 8,
    `stock ${stockDestino.json?.datos?.[0]?.stock}`
  )

  const kardexTr = await pedir('GET', `/api/inventario/movimientos?variante_id=${varM.id}`, { ip, token })
  const tipos = kardexTr.json?.datos?.map((m) => m.tipo) ?? []
  verificar('el kardex muestra la salida y la entrada', tipos.includes('transferencia_salida') && tipos.includes('transferencia_entrada'))
  verificar(
    'y las dos apuntan a la transferencia',
    kardexTr.json?.datos?.filter((m) => m.referencia?.startsWith('transferencia:')).length === 2
  )

  // --------------------------------------------------------------------------
  titulo('[V6] El stock no se puede poner en negativo')

  const deMas = await pedir('POST', '/api/transferencias', {
    ip,
    token,
    cuerpo: {
      almacen_origen_id: DEPOSITO_CENTRO,
      almacen_destino_id: PISO_CENTRO,
      items: [{ variante_id: varS.id, cantidad: 500 }],
    },
  })
  verificar('se puede solicitar aunque no haya stock', deMas.estado === 201, `estado ${deMas.estado}`)

  const aprobarDeMas = await pedir('POST', `/api/transferencias/${deMas.json.datos.id}/aprobar`, { ip, token })
  verificar(
    'pero al despachar se frena por falta de stock',
    aprobarDeMas.estado === 409,
    `estado ${aprobarDeMas.estado}`
  )
  verificar('y el error dice cuanto habia', aprobarDeMas.json?.errores?.disponible !== undefined, JSON.stringify(aprobarDeMas.json?.errores))

  const sigueSolicitada = await pedir('GET', `/api/transferencias/${deMas.json.datos.id}`, { ip, token })
  verificar(
    'la transferencia fallida no cambio de estado',
    sigueSolicitada.json?.datos?.estado === 'solicitada',
    `estado ${sigueSolicitada.json?.datos?.estado}`
  )

  const rechazada = await pedir('POST', `/api/transferencias/${deMas.json.datos.id}/rechazar`, {
    ip,
    token,
    cuerpo: { motivo: 'No hay stock en el deposito' },
  })
  verificar('y se puede rechazar', rechazada.json?.datos?.estado === 'rechazada')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  probarInventario()
    .then(() => process.exit(resumen()))
    .catch((e) => {
      console.error('\nLa prueba se corto:', e.message)
      process.exit(1)
    })
}
