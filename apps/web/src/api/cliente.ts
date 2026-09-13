import type { MetaPagina } from '@aurora/contratos'

/**
 * Cliente HTTP de la API.
 *
 * Concentra tres cosas que si estuvieran repartidas por los componentes se
 * volverian inconsistentes:
 *
 *  1. Las cabeceras de identidad: el token, el dispositivo y el carrito.
 *  2. El refresco del token de acceso cuando caduca, transparente para quien
 *     llama y sin dejar que dos peticiones simultaneas disparen dos refrescos.
 *  3. La forma unica de respuesta y de error de la API.
 */

const CLAVE_TOKEN = 'aurora.token'
const CLAVE_REFRESH = 'aurora.refresh'
const CLAVE_CARRITO = 'aurora.carrito'
const CLAVE_DISPOSITIVO = 'aurora.dispositivo'

/** Error de negocio con el detalle por campo que pintan los formularios. */
export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
    readonly errores?: Record<string, string>
  ) {
    super(mensaje)
    this.name = 'ErrorApi'
  }

  /** Cierto cuando el error viene de no haber podido salir a la red. */
  get esDeRed(): boolean {
    return this.estado === 0
  }
}

export const almacen = {
  token: () => localStorage.getItem(CLAVE_TOKEN),
  refresh: () => localStorage.getItem(CLAVE_REFRESH),
  carrito: () => localStorage.getItem(CLAVE_CARRITO),

  guardarSesion(token: string, refresh: string) {
    localStorage.setItem(CLAVE_TOKEN, token)
    localStorage.setItem(CLAVE_REFRESH, refresh)
  },

  borrarSesion() {
    localStorage.removeItem(CLAVE_TOKEN)
    localStorage.removeItem(CLAVE_REFRESH)
  },

  guardarCarrito(token: string) {
    localStorage.setItem(CLAVE_CARRITO, token)
  },

  /**
   * Identificador estable de este navegador. Lo usa la cola sin conexion para
   * que el servidor sepa de que dispositivo vino cada venta encolada.
   */
  dispositivo(): string {
    let id = localStorage.getItem(CLAVE_DISPOSITIVO)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(CLAVE_DISPOSITIVO, id)
    }
    return id
  },
}

interface Opciones {
  cuerpo?: unknown
  idempotencia?: string
  /** Rutas publicas donde no conviene mandar el token (login, registro). */
  sinSesion?: boolean
}

interface SobreOk<T> {
  ok: true
  mensaje?: string
  datos: T
  meta?: MetaPagina
}

interface SobreError {
  ok: false
  mensaje: string
  errores?: Record<string, string>
}

/** Respuesta paginada, con la metadata que devuelve la API. */
export interface Pagina<T> {
  datos: T[]
  meta: MetaPagina
}

let refrescoEnCurso: Promise<boolean> | null = null

/**
 * Renueva el token de acceso. Si llegan varias peticiones caducadas a la vez,
 * todas esperan el mismo refresco: dos refrescos en paralelo se pisarian, porque
 * el token de refresco es rotatorio y el segundo llegaria con uno ya revocado.
 */
async function refrescarSesion(): Promise<boolean> {
  if (refrescoEnCurso) return refrescoEnCurso

  refrescoEnCurso = (async () => {
    const refresh = almacen.refresh()
    if (!refresh) return false

    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      })
      if (!res.ok) {
        almacen.borrarSesion()
        return false
      }
      const sobre = (await res.json()) as SobreOk<{ token: string; refresh_token: string }>
      almacen.guardarSesion(sobre.datos.token, sobre.datos.refresh_token)
      return true
    } catch {
      // Sin red no se puede refrescar, pero tampoco hay que borrar la sesion:
      // el token guardado vuelve a servir en cuanto la conexion regrese.
      return false
    } finally {
      refrescoEnCurso = null
    }
  })()

  return refrescoEnCurso
}

async function ejecutar<T>(
  metodo: string,
  ruta: string,
  opciones: Opciones,
  reintentado = false
): Promise<SobreOk<T>> {
  const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' }

  const token = almacen.token()
  if (token && !opciones.sinSesion) cabeceras.Authorization = `Bearer ${token}`

  const carrito = almacen.carrito()
  if (carrito) cabeceras['X-Carrito'] = carrito

  cabeceras['X-Dispositivo'] = almacen.dispositivo()
  if (opciones.idempotencia) cabeceras['Idempotency-Key'] = opciones.idempotencia

  let res: Response
  try {
    res = await fetch(ruta, {
      method: metodo,
      headers: cabeceras,
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    })
  } catch {
    throw new ErrorApi(0, 'No se pudo conectar con el servidor')
  }

  if (res.status === 204) {
    return { ok: true, datos: null as T }
  }

  let sobre: SobreOk<T> | SobreError
  try {
    sobre = await res.json()
  } catch {
    throw new ErrorApi(res.status, 'El servidor devolvio una respuesta que no se entiende')
  }

  if (!res.ok || sobre.ok === false) {
    // Token caducado: se refresca una sola vez y se repite la peticion.
    if (res.status === 401 && !reintentado && !opciones.sinSesion && almacen.refresh()) {
      if (await refrescarSesion()) {
        return ejecutar<T>(metodo, ruta, opciones, true)
      }
    }
    const error = sobre as SobreError
    throw new ErrorApi(res.status, error.mensaje ?? 'Error inesperado', error.errores)
  }

  return sobre as SobreOk<T>
}

/** Arma la query string, salteando lo vacio. */
export function consulta(params: Record<string, unknown>): string {
  const partes = new URLSearchParams()
  for (const [clave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null || valor === '') continue
    partes.set(clave, String(valor))
  }
  const texto = partes.toString()
  return texto ? `?${texto}` : ''
}

export const api = {
  async obtener<T>(ruta: string): Promise<T> {
    return (await ejecutar<T>('GET', ruta, {})).datos
  },

  /** Como obtener, pero conservando la metadata de paginacion. */
  async pagina<T>(ruta: string): Promise<Pagina<T>> {
    const sobre = await ejecutar<T[]>('GET', ruta, {})
    return {
      datos: sobre.datos,
      meta: sobre.meta ?? { total: sobre.datos.length, pagina: 1, por_pagina: sobre.datos.length, paginas: 1 },
    }
  },

  async enviar<T>(ruta: string, cuerpo?: unknown, opciones: Omit<Opciones, 'cuerpo'> = {}): Promise<T> {
    return (await ejecutar<T>('POST', ruta, { ...opciones, cuerpo })).datos
  },

  async actualizar<T>(ruta: string, cuerpo?: unknown): Promise<T> {
    return (await ejecutar<T>('PUT', ruta, { cuerpo })).datos
  },

  async quitar<T>(ruta: string): Promise<T> {
    return (await ejecutar<T>('DELETE', ruta, {})).datos
  },

  /** Igual que enviar, pero devolviendo tambien el mensaje de la API. */
  async enviarConMensaje<T>(
    ruta: string,
    cuerpo?: unknown,
    opciones: Omit<Opciones, 'cuerpo'> = {}
  ): Promise<{ datos: T; mensaje?: string }> {
    const sobre = await ejecutar<T>('POST', ruta, { ...opciones, cuerpo })
    return { datos: sobre.datos, mensaje: sobre.mensaje }
  },
}
