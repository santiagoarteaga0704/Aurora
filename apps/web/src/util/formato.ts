/**
 * Formato de moneda, fechas y cantidades.
 *
 * Todo en boliviano y en es-BO. Se centraliza para que un precio se vea igual en
 * el catalogo, en el carrito y en el ticket: si cada pantalla lo formatea a su
 * manera, el mismo numero parece dos numeros distintos.
 */

const bolivianos = new Intl.NumberFormat('es-BO', {
  style: 'currency',
  currency: 'BOB',
  minimumFractionDigits: 2,
})

const enteros = new Intl.NumberFormat('es-BO')

export const bs = (monto: number): string => bolivianos.format(monto)

/** Sin el simbolo, para tablas donde la columna ya dice la moneda. */
export const bsCorto = (monto: number): string =>
  monto.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const numero = (n: number): string => enteros.format(n)

const fechaHora = new Intl.DateTimeFormat('es-BO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const soloFecha = new Intl.DateTimeFormat('es-BO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

/**
 * Formatea una fecha.
 *
 * Un valor de solo fecha —"2026-09-13", que es lo que devuelven las columnas
 * DATE— lo parsea JavaScript como medianoche UTC. En Bolivia, que va cuatro
 * horas atras, eso cae a las 20:00 del dia ANTERIOR: una compra registrada hoy
 * aparecia con la fecha de ayer, en todas las pantallas que muestran una
 * columna DATE.
 *
 * Con hora incluida no pasa: ahi el instante es el mismo en cualquier huso y
 * convertirlo a la hora local es justamente lo que hay que hacer.
 */
export const fecha = (iso: string | Date): string => {
  if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [anio, mes, dia] = iso.split('-').map(Number)
    return soloFecha.format(new Date(anio, mes - 1, dia))
  }
  return soloFecha.format(new Date(iso))
}
export const fechaCompleta = (iso: string | Date): string => fechaHora.format(new Date(iso))

/** "hace 3 minutos", para la cola de sincronizacion. */
export function hace(momento: number | string | Date): string {
  const ms = Date.now() - new Date(momento).getTime()
  const minutos = Math.floor(ms / 60000)

  if (minutos < 1) return 'recien'
  if (minutos === 1) return 'hace 1 minuto'
  if (minutos < 60) return `hace ${minutos} minutos`

  const horas = Math.floor(minutos / 60)
  if (horas === 1) return 'hace 1 hora'
  if (horas < 24) return `hace ${horas} horas`

  const dias = Math.floor(horas / 24)
  return dias === 1 ? 'hace 1 dia' : `hace ${dias} dias`
}

/** Une clases salteando lo falso, para no escribir ternarios en el JSX. */
export const clases = (...partes: (string | false | null | undefined)[]): string =>
  partes.filter(Boolean).join(' ')
