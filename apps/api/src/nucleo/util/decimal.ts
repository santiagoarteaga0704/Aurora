import { Prisma } from '@prisma/client'

/**
 * Los montos son DECIMAL(12,2) en la base, y Prisma los entrega como Decimal
 * para no perder centavos. Al salir por JSON se pasan a numero: el cliente los
 * muestra, no hace contabilidad con ellos. Todo calculo de dinero se hace en el
 * servidor.
 */
export const aNumero = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : typeof v === 'number' ? v : v.toNumber()

/**
 * Monto en bolivianos, para los textos que el asistente dice en voz alta.
 *
 * El resto de la API devuelve numeros y deja el formato al cliente; aqui hace
 * falta la cadena armada, porque lo que viaja ES la frase.
 */
export const bs = (monto: number): string =>
  new Intl.NumberFormat('es-BO', {
    style: 'currency',
    currency: 'BOB',
    minimumFractionDigits: 2,
  }).format(monto)
