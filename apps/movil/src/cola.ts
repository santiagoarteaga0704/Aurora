import * as SQLite from 'expo-sqlite'
import { api, ErrorApi } from './api'

/**
 * Cola de ventas hechas sin conexion.
 *
 * Es la misma pieza que en el PWA y con las mismas dos reglas, porque las dos
 * las impone el negocio y no la plataforma:
 *
 * 1. **La clave de idempotencia se genera AL ENCOLAR**, no al enviar. Si se
 *    generara al enviar, un reintento despues de una respuesta perdida llevaria
 *    una clave nueva y la venta se cobraria dos veces, que es exactamente lo
 *    que la clave existe para evitar.
 *
 * 2. **Se envia EN ORDEN y de a una.** En paralelo seria mas rapido y estaria
 *    mal: dos ventas del mismo articulo se pasarian el stock por delante y el
 *    conflicto caeria en la que el azar decida, no en la segunda.
 *
 * Lo que cambia es el almacen: en el navegador es IndexedDB, aqui SQLite. Es
 * mejor para esto —una base de verdad, con transacciones— y de paso sobrevive a
 * que Android mate la aplicacion por memoria, que en un telefono de mostrador
 * con la camara abierta pasa.
 */

export type EstadoOperacion = 'pendiente' | 'enviando' | 'conflicto'

export interface OperacionEncolada {
  id: number
  entidad: 'pedido' | 'pago'
  cuerpo: string
  idempotencia: string
  resumen: string
  monto: number
  creada_en: number
  estado: EstadoOperacion
  intentos: number
  motivo: string | null
}

let bd: SQLite.SQLiteDatabase | null = null

async function base(): Promise<SQLite.SQLiteDatabase> {
  if (bd) return bd

  bd = await SQLite.openDatabaseAsync('aurora.db')

  await bd.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS operacion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entidad TEXT NOT NULL,
      cuerpo TEXT NOT NULL,
      idempotencia TEXT NOT NULL UNIQUE,
      resumen TEXT NOT NULL,
      monto REAL NOT NULL DEFAULT 0,
      creada_en INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      intentos INTEGER NOT NULL DEFAULT 0,
      motivo TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_operacion_estado ON operacion(estado);
  `)

  return bd
}

/**
 * Una clave de idempotencia.
 *
 * No se usa `crypto.randomUUID`: en React Native no existe sin un polyfill, y
 * meter uno para esto seria mas dependencia de la que hace falta. Lo que se
 * necesita es que dos ventas distintas nunca compartan clave, y el reloj mas el
 * azar alcanzan para un mostrador.
 */
export function claveIdempotencia(): string {
  return `mov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export async function encolar(op: {
  entidad: 'pedido' | 'pago'
  cuerpo: unknown
  idempotencia: string
  resumen: string
  monto: number
}): Promise<void> {
  const db = await base()
  await db.runAsync(
    `INSERT INTO operacion (entidad, cuerpo, idempotencia, resumen, monto, creada_en)
     VALUES (?, ?, ?, ?, ?, ?)`,
    op.entidad,
    JSON.stringify(op.cuerpo),
    op.idempotencia,
    op.resumen,
    op.monto,
    Date.now()
  )
}

export async function pendientes(): Promise<OperacionEncolada[]> {
  const db = await base()
  return db.getAllAsync<OperacionEncolada>(
    `SELECT * FROM operacion WHERE estado IN ('pendiente', 'enviando') ORDER BY creada_en ASC`
  )
}

export async function conflictos(): Promise<OperacionEncolada[]> {
  const db = await base()
  return db.getAllAsync<OperacionEncolada>(
    `SELECT * FROM operacion WHERE estado = 'conflicto' ORDER BY creada_en DESC`
  )
}

export async function contarPendientes(): Promise<number> {
  const db = await base()
  const fila = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM operacion WHERE estado IN ('pendiente', 'enviando')`
  )
  return fila?.n ?? 0
}

export async function descartar(id: number): Promise<void> {
  const db = await base()
  await db.runAsync(`DELETE FROM operacion WHERE id = ?`, id)
}

interface ResultadoLote {
  aplicadas: number
  conflictos: number
  resultados: {
    idempotency_key: string
    estado: 'aplicado' | 'conflicto' | 'rechazado' | 'pendiente'
    error: string | null
  }[]
}

/** Tope por envio; el servidor acepta 50. */
const POR_LOTE = 50

/**
 * Manda lo pendiente por `POST /api/sync/lote`.
 *
 * El mismo endpoint que usa el PWA, asi que una venta hecha en el telefono deja
 * constancia en `sync_operacion` igual que una hecha en la caja: si se rechaza
 * por falta de stock, el motivo se puede revisar desde cualquier equipo y no
 * queda solo dentro de este telefono.
 */
export async function sincronizar(): Promise<{ aplicadas: number; conflictos: number }> {
  const db = await base()
  const cola = await pendientes()

  let aplicadas = 0
  let enConflicto = 0

  for (let desde = 0; desde < cola.length; desde += POR_LOTE) {
    const tanda = cola.slice(desde, desde + POR_LOTE)

    for (const op of tanda) {
      await db.runAsync(
        `UPDATE operacion SET estado = 'enviando', intentos = intentos + 1 WHERE id = ?`,
        op.id
      )
    }

    let respuesta: ResultadoLote
    try {
      respuesta = await api.enviar<ResultadoLote>('/api/sync/lote', {
        operaciones: tanda.map((op) => ({
          idempotency_key: op.idempotencia,
          entidad: op.entidad,
          operacion: 'crear',
          payload: JSON.parse(op.cuerpo),
          creado_en_cliente: new Date(op.creada_en).toISOString(),
        })),
      })
    } catch (e) {
      const error = e as ErrorApi

      // Sin red, o el servidor devolvio algo inesperado: la tanda vuelve a
      // pendiente y se corta. Reintentar contra un servidor que no responde
      // solo gasta bateria.
      for (const op of tanda) {
        await db.runAsync(
          `UPDATE operacion SET estado = 'pendiente', motivo = ? WHERE id = ?`,
          error.esDeRed ? null : error.message,
          op.id
        )
      }
      break
    }

    // Se empareja por clave y no por posicion: si el lote se reordenara o se
    // filtrara, por indice se marcaria la operacion equivocada.
    const porClave = new Map(respuesta.resultados.map((r) => [r.idempotency_key, r]))

    for (const op of tanda) {
      const r = porClave.get(op.idempotencia)

      if (!r) {
        await db.runAsync(`UPDATE operacion SET estado = 'pendiente' WHERE id = ?`, op.id)
        continue
      }

      if (r.estado === 'aplicado') {
        await db.runAsync(`DELETE FROM operacion WHERE id = ?`, op.id)
        aplicadas++
      } else {
        await db.runAsync(
          `UPDATE operacion SET estado = 'conflicto', motivo = ? WHERE id = ?`,
          r.error ?? 'No se pudo aplicar',
          op.id
        )
        enConflicto++
      }
    }
  }

  return { aplicadas, conflictos: enConflicto }
}
