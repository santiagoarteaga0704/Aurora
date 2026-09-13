/**
 * Pruebas de administracion: personal, roles, permisos y mayoristas.
 *
 *   node scripts/probar-administracion.mjs
 *
 * Lo mas importante que se comprueba aqui es que los permisos se configuren sin
 * tocar codigo y que el cambio rija de inmediato: es el requisito RF-04 y la
 * razon de que exista la tabla rol_permiso.
 */
import { pathToFileURL } from 'node:url'
import { pedir, resumen, sesionAdmin, sufijo, titulo, verificar } from './ayuda-pruebas.mjs'

const ip = '10.6.0.1'
const s = sufijo()

const SUCURSAL_CENTRO = 1
const SUCURSAL_VENTURA = 2

export async function probarAdministracion() {
  const admin = await sesionAdmin(ip)
  const token = admin.token

  const clienta = await pedir('POST', '/api/auth/registro', {
    ip,
    cuerpo: {
      nombre: 'Clienta',
      apellido: 'Admin',
      email: `prueba+adm${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  const tokenClienta = clienta.json.datos.token
  const clientaId = clienta.json.datos.usuario.id

  // --------------------------------------------------------------------------
  titulo('[A1] Alta de personal')

  const comoCliente = await pedir('GET', '/api/usuarios', { ip, token: tokenClienta })
  verificar('un cliente no lista usuarios', comoCliente.estado === 403, `estado ${comoCliente.estado}`)

  const roles = await pedir('GET', '/api/roles', { ip, token })
  verificar('los roles se listan', roles.estado === 200, `estado ${roles.estado}`)
  verificar('son los 6 del seed', roles.json?.datos?.length === 6, `${roles.json?.datos?.length} roles`)

  const rolGerente = roles.json.datos.find((r) => r.nombre === 'gerente')
  const rolVendedor = roles.json.datos.find((r) => r.nombre === 'vendedor')
  const rolCliente = roles.json.datos.find((r) => r.nombre === 'cliente')
  const rolRepartidor = roles.json.datos.find((r) => r.nombre === 'repartidor')

  verificar('el administrador tiene el comodin', roles.json.datos.find((r) => r.nombre === 'administrador')?.permisos?.includes('*'))
  verificar('el gerente tiene permisos concretos', (rolGerente?.permisos?.length ?? 0) > 5, `${rolGerente?.permisos?.length} permisos`)

  const sinSucursal = await pedir('POST', '/api/usuarios', {
    ip,
    token,
    cuerpo: {
      rol_id: rolVendedor.id,
      nombre: 'Sin',
      apellido: 'Sucursal',
      email: `prueba+sin${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  verificar('el personal necesita sucursal', sinSucursal.estado === 422, `estado ${sinSucursal.estado}`)

  const comoClienteRol = await pedir('POST', '/api/usuarios', {
    ip,
    token,
    cuerpo: {
      rol_id: rolCliente.id,
      sucursal_id: SUCURSAL_CENTRO,
      nombre: 'Cliente',
      apellido: 'Creado',
      email: `prueba+cli${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  verificar(
    'no se crean clientes desde administracion',
    comoClienteRol.estado === 422,
    `estado ${comoClienteRol.estado}`
  )

  const gerente = await pedir('POST', '/api/usuarios', {
    ip,
    token,
    cuerpo: {
      rol_id: rolGerente.id,
      sucursal_id: SUCURSAL_CENTRO,
      nombre: 'Gabriela',
      apellido: `Gerente${s}`,
      email: `prueba+ger${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  verificar('se da de alta un gerente', gerente.estado === 201, `estado ${gerente.estado}`)
  verificar('con su rol y sucursal', gerente.json?.datos?.rol === 'gerente' && gerente.json?.datos?.sucursal_id === SUCURSAL_CENTRO)

  const repetido = await pedir('POST', '/api/usuarios', {
    ip,
    token,
    cuerpo: {
      rol_id: rolVendedor.id,
      sucursal_id: SUCURSAL_CENTRO,
      nombre: 'Otro',
      apellido: 'Igual',
      email: `prueba+ger${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  verificar('el correo repetido se rechaza', repetido.json?.errores?.email !== undefined)

  // --------------------------------------------------------------------------
  titulo('[A2] El gerente queda limitado a su sucursal')

  const sesionGerente = await pedir('POST', '/api/auth/login', {
    ip,
    cuerpo: { email: `prueba+ger${s}@aurora.bo`, password: 'ClaveSegura123' },
  })
  verificar('el gerente puede entrar', sesionGerente.estado === 200, `estado ${sesionGerente.estado}`)
  const tokenGerente = sesionGerente.json.datos.token

  // El seed le da al gerente `usuario.ver` pero NO `usuario.crear`: dar de alta
  // personal es decision de administracion.
  const sinPermisoDeAlta = await pedir('POST', '/api/usuarios', {
    ip,
    token: tokenGerente,
    cuerpo: {
      rol_id: rolVendedor.id,
      sucursal_id: SUCURSAL_CENTRO,
      nombre: 'Valeria',
      apellido: `Vendedora${s}`,
      email: `prueba+ven2${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  verificar(
    'el gerente no da de alta personal: el seed no le dio ese permiso',
    sinPermisoDeAlta.estado === 403,
    `estado ${sinPermisoDeAlta.estado}`
  )

  // Aqui se ve el requisito completo: administracion le agrega el permiso al rol
  // y el gerente pasa a poder hacerlo, sin recompilar ni desplegar nada.
  await pedir('PUT', `/api/roles/${rolGerente.id}/permisos`, {
    ip,
    token,
    cuerpo: { permisos: [...rolGerente.permisos, 'usuario.crear'] },
  })

  const conPermisoNuevo = await pedir('POST', '/api/usuarios', {
    ip,
    token: tokenGerente,
    cuerpo: {
      rol_id: rolVendedor.id,
      sucursal_id: SUCURSAL_CENTRO,
      nombre: 'Valeria',
      apellido: `Vendedora${s}`,
      email: `prueba+ven2${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  verificar(
    'agregarle el permiso al rol lo habilita de inmediato',
    conPermisoNuevo.estado === 201,
    `estado ${conPermisoNuevo.estado}`
  )

  const ajena = await pedir('POST', '/api/usuarios', {
    ip,
    token: tokenGerente,
    cuerpo: {
      rol_id: rolVendedor.id,
      sucursal_id: SUCURSAL_VENTURA,
      nombre: 'Vendedora',
      apellido: 'Ajena',
      email: `prueba+aje${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  verificar(
    'pero el alcance por sucursal sigue valiendo: no puede en otra sucursal',
    ajena.estado === 403,
    `estado ${ajena.estado}`
  )

  const listaGerente = await pedir('GET', '/api/usuarios', { ip, token: tokenGerente })
  verificar(
    'solo ve usuarios de su sucursal',
    listaGerente.json?.datos?.every((u) => u.sucursal_id === SUCURSAL_CENTRO),
    JSON.stringify(listaGerente.json?.datos?.map((u) => u.sucursal_id))
  )

  // --------------------------------------------------------------------------
  titulo('[A3] Nadie se dispara en el pie')

  const autoBaja = await pedir('PUT', `/api/usuarios/${admin.usuario.id}`, {
    ip,
    token,
    cuerpo: { activo: false },
  })
  verificar('el administrador no se desactiva a si mismo', autoBaja.estado === 409, `estado ${autoBaja.estado}`)

  const autoRol = await pedir('PUT', `/api/usuarios/${admin.usuario.id}`, {
    ip,
    token,
    cuerpo: { rol_id: rolVendedor.id },
  })
  verificar('ni se cambia su propio rol', autoRol.estado === 409, `estado ${autoRol.estado}`)

  const permisosAdmin = await pedir('PUT', `/api/roles/${roles.json.datos.find((r) => r.nombre === 'administrador').id}/permisos`, {
    ip,
    token,
    cuerpo: { permisos: ['usuario.ver'] },
  })
  verificar(
    'los permisos del rol administrador no se tocan',
    permisosAdmin.estado === 409,
    `estado ${permisosAdmin.estado}`
  )

  // --------------------------------------------------------------------------
  titulo('[A4] Permisos configurables sin tocar codigo')

  const permisos = await pedir('GET', '/api/permisos', { ip, token })
  verificar('los permisos se listan agrupados por modulo', (permisos.json?.datos?.length ?? 0) > 5)
  verificar(
    'y suman los 32 del seed',
    permisos.json?.datos?.reduce((n, m) => n + m.permisos.length, 0) === 32,
    `${permisos.json?.datos?.reduce((n, m) => n + m.permisos.length, 0)} permisos`
  )

  const rolNuevo = await pedir('POST', '/api/roles', {
    ip,
    token,
    cuerpo: { nombre: `auditor_${s}`, descripcion: 'Solo consulta inventario' },
  })
  verificar('se crea un rol nuevo', rolNuevo.estado === 201, `estado ${rolNuevo.estado}`)

  const permisoInexistente = await pedir('PUT', `/api/roles/${rolNuevo.json.datos.id}/permisos`, {
    ip,
    token,
    cuerpo: { permisos: ['inventario.ver', 'permiso.que.no.existe'] },
  })
  verificar('un permiso inexistente se rechaza', permisoInexistente.estado === 422, `estado ${permisoInexistente.estado}`)

  const asignados = await pedir('PUT', `/api/roles/${rolNuevo.json.datos.id}/permisos`, {
    ip,
    token,
    cuerpo: { permisos: ['inventario.ver'] },
  })
  verificar('se asignan los permisos', asignados.json?.datos?.permisos?.length === 1)

  const auditor = await pedir('POST', '/api/usuarios', {
    ip,
    token,
    cuerpo: {
      rol_id: rolNuevo.json.datos.id,
      sucursal_id: SUCURSAL_CENTRO,
      nombre: 'Andres',
      apellido: `Auditor${s}`,
      email: `prueba+aud${s}@aurora.bo`,
      password: 'ClaveSegura123',
    },
  })
  verificar('se crea un usuario con el rol nuevo', auditor.estado === 201, `estado ${auditor.estado}`)

  const sesionAuditor = await pedir('POST', '/api/auth/login', {
    ip,
    cuerpo: { email: `prueba+aud${s}@aurora.bo`, password: 'ClaveSegura123' },
  })
  const tokenAuditor = sesionAuditor.json.datos.token
  verificar(
    'su sesion trae el permiso configurado',
    sesionAuditor.json?.datos?.usuario?.permisos?.includes('inventario.ver'),
    JSON.stringify(sesionAuditor.json?.datos?.usuario?.permisos)
  )

  const puedeVer = await pedir('GET', '/api/inventario', { ip, token: tokenAuditor })
  verificar('y puede consultar el inventario', puedeVer.estado === 200, `estado ${puedeVer.estado}`)

  const noPuedeAjustar = await pedir('POST', '/api/inventario/ajuste', {
    ip,
    token: tokenAuditor,
    cuerpo: { variante_id: 1, almacen_id: 1, stock_contado: 5, motivo: 'no deberia' },
  })
  verificar('pero no ajustar', noPuedeAjustar.estado === 403, `estado ${noPuedeAjustar.estado}`)

  // Quitarle el permiso tiene que notarse ya, sin esperar que caduque la cache.
  await pedir('PUT', `/api/roles/${rolNuevo.json.datos.id}/permisos`, {
    ip,
    token,
    cuerpo: { permisos: [] },
  })

  const yaNoPuede = await pedir('GET', '/api/inventario', { ip, token: tokenAuditor })
  verificar(
    'quitarle el permiso rige en la peticion siguiente',
    yaNoPuede.estado === 403,
    `estado ${yaNoPuede.estado}`
  )

  // --------------------------------------------------------------------------
  titulo('[A5] Desactivar a alguien lo echa de sus sesiones')

  await pedir('DELETE', `/api/usuarios/${auditor.json.datos.id}`, { ip, token })

  const echado = await pedir('GET', '/api/auth/yo', { ip, token: tokenAuditor })
  verificar('un usuario dado de baja no sigue operando', echado.estado === 401, `estado ${echado.estado}`)

  const noEntra = await pedir('POST', '/api/auth/login', {
    ip,
    cuerpo: { email: `prueba+aud${s}@aurora.bo`, password: 'ClaveSegura123' },
  })
  verificar('ni puede volver a entrar', noEntra.estado === 403, `estado ${noEntra.estado}`)

  // --------------------------------------------------------------------------
  titulo('[A6] Aprobacion de mayorista y precios de mayoreo')

  const producto = await pedir('POST', '/api/catalogo/productos', {
    ip,
    token,
    cuerpo: {
      categoria_id: 2,
      codigo: `MAY-${s}`,
      nombre: `Vestido mayoreo ${s}`,
      tipo_prenda: 'vestido',
      variantes: [
        { talla_id: 3, color_id: 1, sku: `MAY-${s}-M-NE`, precio_menor: 400, precio_mayor: 300 },
      ],
    },
  })
  const slug = producto.json.datos.slug
  const varianteId = producto.json.datos.variantes[0].id

  await pedir('PUT', `/api/catalogo/variantes/${varianteId}/escalas`, {
    ip,
    token,
    cuerpo: { escalas: [{ cantidad_min: 12, precio_unitario: 250 }] },
  })

  const mayorista = await pedir('POST', '/api/auth/registro', {
    ip,
    cuerpo: {
      nombre: 'Boutique',
      apellido: `Mayor${s}`,
      email: `prueba+may2${s}@aurora.bo`,
      password: 'ClaveSegura123',
      tipo: 'mayorista',
      nit: '1122334455',
      razon_social: 'Boutique Mayor SRL',
    },
  })
  const tokenMayorista = mayorista.json.datos.token
  const mayoristaId = mayorista.json.datos.usuario.id

  const antesAprobar = await pedir('GET', `/api/catalogo/productos/${slug}`, { ip, token: tokenMayorista })
  verificar(
    'sin aprobar paga precio de menudeo',
    antesAprobar.json?.datos?.variantes?.[0]?.precio === 400,
    `precio ${antesAprobar.json?.datos?.variantes?.[0]?.precio}`
  )

  const aprobarMinorista = await pedir('POST', `/api/usuarios/${clientaId}/aprobar-mayorista`, {
    ip,
    token,
    cuerpo: { aprobado: true },
  })
  verificar(
    'no se aprueba como mayorista a un minorista',
    aprobarMinorista.estado === 409,
    `estado ${aprobarMinorista.estado}`
  )

  const aprobado = await pedir('POST', `/api/usuarios/${mayoristaId}/aprobar-mayorista`, {
    ip,
    token,
    cuerpo: { aprobado: true },
  })
  verificar('se aprueba al mayorista', aprobado.estado === 200, `estado ${aprobado.estado}`)
  verificar('y queda marcado', aprobado.json?.datos?.mayorista_aprobado === true)

  const trasAprobar = await pedir('GET', `/api/catalogo/productos/${slug}`, { ip, token: tokenMayorista })
  verificar(
    'ahora ve el precio de mayoreo',
    trasAprobar.json?.datos?.variantes?.[0]?.precio === 300,
    `precio ${trasAprobar.json?.datos?.variantes?.[0]?.precio}`
  )

  // La escala por volumen se aplica segun la cantidad del carrito.
  const pocas = await pedir('POST', '/api/carrito/items', {
    ip,
    token: tokenMayorista,
    cuerpo: { variante_id: varianteId, cantidad: 5 },
  })
  verificar(
    'con 5 unidades paga el precio de mayoreo',
    pocas.json?.datos?.items?.[0]?.precio_unitario === 300,
    `precio ${pocas.json?.datos?.items?.[0]?.precio_unitario}`
  )

  const muchas = await pedir('PUT', `/api/carrito/items/${varianteId}`, {
    ip,
    token: tokenMayorista,
    cuerpo: { cantidad: 15 },
  })
  verificar(
    'con 15 entra la escala por volumen',
    muchas.json?.datos?.items?.[0]?.precio_unitario === 250,
    `precio ${muchas.json?.datos?.items?.[0]?.precio_unitario}`
  )
  verificar('y el subtotal usa ese precio', muchas.json?.datos?.subtotal === 3750, `subtotal ${muchas.json?.datos?.subtotal}`)

  const desaprobado = await pedir('POST', `/api/usuarios/${mayoristaId}/aprobar-mayorista`, {
    ip,
    token,
    cuerpo: { aprobado: false },
  })
  verificar('se le puede retirar la aprobacion', desaprobado.json?.datos?.mayorista_aprobado === false)

  const trasRetirar = await pedir('GET', `/api/catalogo/productos/${slug}`, { ip, token: tokenMayorista })
  verificar(
    'y vuelve a pagar menudeo',
    trasRetirar.json?.datos?.variantes?.[0]?.precio === 400,
    `precio ${trasRetirar.json?.datos?.variantes?.[0]?.precio}`
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  probarAdministracion()
    .then(() => process.exit(resumen()))
    .catch((e) => {
      console.error('\nLa prueba se corto:', e.message)
      process.exit(1)
    })
}
