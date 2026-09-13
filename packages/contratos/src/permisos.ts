/**
 * Catalogo de permisos, identico a los 31 codigos que siembra
 * database/seed.postgres.sql en la tabla `permiso`.
 *
 * Los permisos viven en la base de datos, no en el codigo: un administrador
 * puede crear un rol nuevo y asignarle permisos sin recompilar nada. Esta lista
 * existe solo para que el backend y el front se refieran a ellos sin escribir
 * cadenas sueltas, y para que un permiso mal escrito sea un error de
 * compilacion en vez de un 403 silencioso.
 */

export const PERMISOS = {
  COMODIN: '*',

  USUARIO_VER: 'usuario.ver',
  USUARIO_CREAR: 'usuario.crear',
  USUARIO_EDITAR: 'usuario.editar',
  USUARIO_ELIMINAR: 'usuario.eliminar',
  ROL_GESTIONAR: 'rol.gestionar',
  BITACORA_VER: 'bitacora.ver',

  SUCURSAL_VER: 'sucursal.ver',
  SUCURSAL_VER_TODAS: 'sucursal.ver_todas',
  SUCURSAL_GESTIONAR: 'sucursal.gestionar',

  PRODUCTO_VER: 'producto.ver',
  PRODUCTO_CREAR: 'producto.crear',
  PRODUCTO_EDITAR: 'producto.editar',
  PRODUCTO_ELIMINAR: 'producto.eliminar',

  INVENTARIO_VER: 'inventario.ver',
  INVENTARIO_AJUSTAR: 'inventario.ajustar',
  INVENTARIO_TRANSFERIR: 'inventario.transferir',

  COMPRA_VER: 'compra.ver',
  COMPRA_GESTIONAR: 'compra.gestionar',

  VENTA_VER: 'venta.ver',
  VENTA_CREAR: 'venta.crear',
  VENTA_ANULAR: 'venta.anular',
  VENTA_DESPACHAR: 'venta.despachar',

  PAGO_CONFIRMAR: 'pago.confirmar',
  CAJA_OPERAR: 'caja.operar',
  DEVOLUCION_GESTIONAR: 'devolucion.gestionar',
  PROMOCION_GESTIONAR: 'promocion.gestionar',

  REPORTE_VER: 'reporte.ver',
  REPORTE_DEMANDA: 'reporte.demanda',
  REPORTE_EXPORTAR: 'reporte.exportar',

  IA_ASISTENTE: 'ia.asistente',
} as const

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS]

/** Los 6 roles del sistema que siembra el seed. */
export const ROLES = {
  ADMINISTRADOR: 'administrador',
  GERENTE: 'gerente',
  VENDEDOR: 'vendedor',
  ALMACENERO: 'almacenero',
  REPARTIDOR: 'repartidor',
  CLIENTE: 'cliente',
} as const

export type Rol = (typeof ROLES)[keyof typeof ROLES]
