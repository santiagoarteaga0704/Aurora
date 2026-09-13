/**
 * @aurora/contratos
 *
 * Contrato compartido entre la API (NestJS), el PWA (React) y la app movil
 * (React Native). Un solo lugar donde se declaran los esquemas de validacion,
 * la forma de las respuestas y los codigos de permiso.
 *
 * Ventaja frente al diseno anterior: antes el contrato estaba escrito tres
 * veces (validador en PHP, formularios en JS, modelos en Dart) y nada garantizaba
 * que coincidieran. Ahora si la API cambia una regla, los clientes dejan de
 * compilar.
 */
export * from './respuesta'
export * from './comun'
export * from './permisos'
export * from './auth'
export * from './catalogo'
export * from './inventario'
export * from './ventas'
export * from './compras'
export * from './caja'
export * from './posventa'
export * from './promociones'
export * from './administracion'
export * from './clientes'
export * from './reportes'
export * from './asistente'
export * from './probador'
export * from './resenas'
