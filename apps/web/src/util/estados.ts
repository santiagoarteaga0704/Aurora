import type { EstadoPedido } from '@aurora/contratos'

/**
 * Como se ve cada estado de un pedido.
 *
 * El color no es decoracion: `pendiente` y `cancelado` tienen que distinguirse
 * de un vistazo en una lista de cincuenta pedidos.
 */
export const ESTADO_PEDIDO: Record<EstadoPedido, { texto: string; marca: string }> = {
  pendiente: { texto: 'Pendiente', marca: 'marca--ojo' },
  pagado: { texto: 'Pagado', marca: 'marca--vino' },
  preparando: { texto: 'Preparando', marca: 'marca--vino' },
  listo: { texto: 'Listo', marca: 'marca--bien' },
  enviado: { texto: 'En camino', marca: 'marca--bien' },
  entregado: { texto: 'Entregado', marca: 'marca--bien' },
  cancelado: { texto: 'Cancelado', marca: 'marca--mala' },
  devuelto: { texto: 'Devuelto', marca: 'marca--neutra' },
}

export const ESTADO_ENVIO: Record<string, { texto: string; marca: string }> = {
  preparando: { texto: 'Preparando', marca: 'marca--ojo' },
  en_ruta: { texto: 'En ruta', marca: 'marca--vino' },
  entregado: { texto: 'Entregado', marca: 'marca--bien' },
  fallido: { texto: 'Fallido', marca: 'marca--mala' },
  devuelto: { texto: 'Devuelto', marca: 'marca--neutra' },
}

export const TEMPORADA: Record<string, string> = {
  verano: 'Verano',
  invierno: 'Invierno',
  otono: 'Otonio',
  primavera: 'Primavera',
  todo_ano: 'Todo el anio',
}

export const TIPO_PRENDA: Record<string, string> = {
  superior: 'Superior',
  inferior: 'Inferior',
  vestido: 'Vestido',
  abrigo: 'Abrigo',
  calzado: 'Calzado',
  accesorio: 'Accesorio',
  ropa_interior: 'Ropa interior',
}
