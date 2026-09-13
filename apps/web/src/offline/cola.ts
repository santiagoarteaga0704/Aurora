import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { api, ErrorApi } from '../api/cliente'

/**
 * Cola de operaciones hechas sin conexion.
 *
 * Esta es la pieza que separa "la app muestra un error bonito sin internet" de
 * "la app puede vender sin internet". Una venta registrada sin red se guarda
 * aqui con su clave de idempotencia y se manda al servidor cuando la conexion
 * vuelve.
 *
 * La clave de idempotencia se genera EN EL MOMENTO de encolar, no al enviar. Si
 * se generara al enviar, un reintento despues de una respuesta perdida crearia
 * una clave nueva y la venta se cobraria dos veces, que es justo lo que la clave
 * existe para evitar.
 */

export type EstadoOperacion = 'pendiente' | 'enviando' | 'aplicada' | 'conflicto'

export interface OperacionEncolada {
  id?: number
  /** Ruta de la API a la que hay que mandarla. */
  ruta: string
  cuerpo: unknown
  idempotencia: string
  /** Que es, para poder mostrarlo en la lista de pendientes. */
  resumen: string
  monto: number
  creada_en: number
  estado: EstadoOperacion
  intentos: number
  motivo?: string
}

interface EsquemaAurora extends DBSchema {
  operaciones: {
    key: number
    value: OperacionEncolada
    indexes: { 'por-estado': EstadoOperacion }
  }
  catalogo: {
    key: string
    value: { clave: string; datos: unknown; guardado_en: number }
  }
}

let bd: Promise<IDBPDatabase<EsquemaAurora>> | null = null

function base() {
  if (!bd) {
    bd = openDB<EsquemaAurora>('aurora', 1, {
      upgrade(db) {
        const ops = db.createObjectStore('operaciones', {
          keyPath: 'id',
          autoIncrement: true,
        })
        ops.createIndex('por-estado', 'estado')
        db.createObjectStore('catalogo', { keyPath: 'clave' })
      },
    })
  }
  return bd
}

export async function encolar(
  op: Omit<OperacionEncolada, 'id' | 'creada_en' | 'estado' | 'intentos'>
): Promise<number> {
  const db = await base()
  return db.add('operaciones', {
    ...op,
    creada_en: Date.now(),
    estado: 'pendiente',
    intentos: 0,
  })
}

export async function pendientes(): Promise<OperacionEncolada[]> {
  const db = await base()
  const todas = await db.getAll('operaciones')
  return todas
    .filter((o) => o.estado === 'pendiente' || o.estado === 'enviando')
    .sort((a, b) => a.creada_en - b.creada_en)
}

export async function conflictos(): Promise<OperacionEncolada[]> {
  const db = await base()
  return (await db.getAll('operaciones')).filter((o) => o.estado === 'conflicto')
}

export async function contarPendientes(): Promise<number> {
  return (await pendientes()).length
}

export async function descartar(id: number): Promise<void> {
  const db = await base()
  await db.delete('operaciones', id)
}

export interface ResultadoSync {
  aplicadas: number
  conflictos: number
}

/**
 * Manda al servidor todo lo que quedo pendiente.
 *
 * Se envian EN ORDEN y de a una. En paralelo seria mas rapido, pero dos ventas
 * del mismo articulo podrian pasarse el stock por delante y el conflicto
 * quedaria en la que no corresponde.
 *
 * Que hacer con cada respuesta:
 *
 *   2xx      aplicada. Se borra de la cola.
 *   409/422  el servidor la rechazo por una razon de negocio (no hay stock, el
 *            precio cambio). Reintentarla no la va a arreglar: queda marcada
 *            como conflicto para que una persona decida.
 *   red      no hay conexion todavia. Se deja pendiente y se corta el ciclo.
 */
export async function sincronizar(): Promise<ResultadoSync> {
  const db = await base()
  const cola = await pendientes()
  let aplicadas = 0
  let enConflicto = 0

  for (const op of cola) {
    if (op.id === undefined) continue

    await db.put('operaciones', { ...op, estado: 'enviando', intentos: op.intentos + 1 })

    try {
      await api.enviar(op.ruta, op.cuerpo, { idempotencia: op.idempotencia })
      await db.delete('operaciones', op.id)
      aplicadas++
    } catch (e) {
      const error = e as ErrorApi

      if (error.esDeRed) {
        // Se fue la conexion otra vez: se deja como estaba y se corta.
        await db.put('operaciones', { ...op, estado: 'pendiente' })
        break
      }

      if (error.estado === 409 || error.estado === 422) {
        await db.put('operaciones', {
          ...op,
          estado: 'conflicto',
          motivo: error.message,
        })
        enConflicto++
        continue
      }

      // 5xx o algo inesperado: puede ser transitorio, se reintenta despues.
      await db.put('operaciones', { ...op, estado: 'pendiente', motivo: error.message })
      break
    }
  }

  return { aplicadas, conflictos: enConflicto }
}

/* --------------------------------------------------------------------------
   Cache del catalogo para el punto de venta
   --------------------------------------------------------------------------
   El Service Worker ya cachea las respuestas del catalogo, pero el punto de
   venta necesita buscar por SKU entre todo lo que hay, no pedirle al servidor
   una busqueda por vez. Se guarda una copia local y se refresca cada vez que
   hay conexion.
   -------------------------------------------------------------------------- */

export async function guardarEnCache(clave: string, datos: unknown): Promise<void> {
  const db = await base()
  await db.put('catalogo', { clave, datos, guardado_en: Date.now() })
}

export async function leerDeCache<T>(clave: string): Promise<{ datos: T; guardado_en: number } | null> {
  const db = await base()
  const fila = await db.get('catalogo', clave)
  return fila ? { datos: fila.datos as T, guardado_en: fila.guardado_en } : null
}
