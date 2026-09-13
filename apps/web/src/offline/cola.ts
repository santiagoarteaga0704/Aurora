import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { EntidadSync, RespuestaLoteSync } from '@aurora/contratos'
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
  /**
   * Que entidad representa, para el endpoint de lote.
   *
   * Es opcional porque puede haber operaciones encoladas por una version
   * anterior de la aplicacion, guardadas antes de que este campo existiera. Una
   * venta que quedo en la cola de una vendedora no se puede perder porque el
   * equipo se actualizo entre que la registro y la pudo mandar: si falta, se
   * deduce de la ruta.
   */
  entidad?: EntidadSync
}

/** De que entidad es una ruta, para las operaciones encoladas sin `entidad`. */
function entidadDe(op: OperacionEncolada): EntidadSync {
  if (op.entidad) return op.entidad
  return op.ruta.includes('/pagos') ? 'pago' : 'pedido'
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

/** Tope de operaciones por envio; el servidor acepta 50. */
const POR_LOTE = 50

/**
 * Manda al servidor todo lo que quedo pendiente.
 *
 * Va por `POST /api/sync/lote` y no operacion por operacion contra cada
 * endpoint. La diferencia que importa no es el ahorro de peticiones: es que el
 * servidor deja constancia de cada una en `sync_operacion`, con su resultado y
 * su motivo. Antes, una venta rechazada porque el stock ya no alcanzaba dejaba
 * el motivo unicamente en el navegador de esa vendedora; si esa persona
 * limpiaba el almacenamiento, la venta desaparecia sin que quedara rastro de
 * que habia existido.
 *
 * Las operaciones van EN ORDEN y el servidor las aplica en orden. En paralelo
 * seria mas rapido y estaria mal: dos ventas del mismo articulo se pasarian el
 * stock por delante y el conflicto caeria en la que el azar decida, no en la
 * segunda.
 *
 * Que hace con cada respuesta:
 *
 *   aplicado    se borra de la cola.
 *   conflicto   el mundo cambio mientras no habia conexion. Reintentarla no la
 *               va a arreglar: queda marcada para que una persona decida.
 *   rechazado   la operacion esta mal. Tambien queda marcada, pero no se
 *               ofrece rehacerla.
 */
export async function sincronizar(): Promise<ResultadoSync> {
  const db = await base()
  const cola = await pendientes()

  let aplicadas = 0
  let enConflicto = 0

  for (let desde = 0; desde < cola.length; desde += POR_LOTE) {
    const tanda = cola.slice(desde, desde + POR_LOTE)

    for (const op of tanda) {
      if (op.id !== undefined) {
        await db.put('operaciones', { ...op, estado: 'enviando', intentos: op.intentos + 1 })
      }
    }

    let respuesta: RespuestaLoteSync
    try {
      respuesta = await api.enviar<RespuestaLoteSync>('/api/sync/lote', {
        operaciones: tanda.map((op) => ({
          idempotency_key: op.idempotencia,
          entidad: entidadDe(op),
          operacion: 'crear',
          payload: op.cuerpo,
          creado_en_cliente: new Date(op.creada_en).toISOString(),
        })),
      })
    } catch (e) {
      const error = e as ErrorApi

      // Se corto la conexion otra vez, o el servidor devolvio algo inesperado.
      // En los dos casos la tanda vuelve a pendiente y se corta: reintentar
      // contra un servidor que no responde solo gasta bateria.
      for (const op of tanda) {
        if (op.id !== undefined) {
          await db.put('operaciones', {
            ...op,
            estado: 'pendiente',
            motivo: error.esDeRed ? undefined : error.message,
          })
        }
      }
      break
    }

    // El servidor responde por clave de idempotencia, no por posicion: si algun
    // dia el lote se reordenara o se filtrara, emparejar por indice empezaria a
    // marcar la operacion equivocada.
    const porClave = new Map(respuesta.resultados.map((r) => [r.idempotency_key, r]))

    for (const op of tanda) {
      if (op.id === undefined) continue
      const r = porClave.get(op.idempotencia)

      if (!r) {
        // El servidor no dijo nada de esta: se deja pendiente para el proximo
        // intento en vez de darla por perdida.
        await db.put('operaciones', { ...op, estado: 'pendiente' })
        continue
      }

      if (r.estado === 'aplicado') {
        await db.delete('operaciones', op.id)
        aplicadas++
      } else {
        await db.put('operaciones', {
          ...op,
          estado: 'conflicto',
          motivo: r.error ?? 'No se pudo aplicar',
        })
        enConflicto++
      }
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
