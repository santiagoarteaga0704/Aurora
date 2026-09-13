import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'

/**
 * Cliente de API de la app movil.
 *
 * Es el hermano del de la web y comparte con el las dos decisiones que
 * importan: el sobre `{ ok, datos, mensaje, errores }` se desenvuelve aqui —las
 * pantallas trabajan con los datos, no con el sobre— y un fallo de red se
 * distingue de un error del servidor, porque con uno se encola y con el otro se
 * avisa.
 *
 * Lo que cambia es donde vive el token. En el navegador va a localStorage; aqui
 * va al llavero del sistema por `expo-secure-store`, que es almacenamiento
 * cifrado del dispositivo. Un telefono de mostrador se pierde o se lo prestan, y
 * un token en texto plano en el disco lo lee cualquiera.
 */

const CLAVE_TOKEN = 'aurora.token'
const CLAVE_REFRESH = 'aurora.refresh'
const CLAVE_DISPOSITIVO = 'aurora.dispositivo'

/**
 * A donde apunta la app.
 *
 * `EXPO_PUBLIC_API_URL` gana sobre lo que diga app.json: es lo que permite
 * apuntar a la API de Azure al compilar el APK sin editar el codigo.
 *
 * El valor por defecto es 10.0.2.2, que es como el emulador de Android ve el
 * `localhost` de la maquina que lo hospeda. En un telefono real hay que poner
 * la IP de la computadora en la red local.
 */
export const API =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://10.0.2.2:8000'

export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
    readonly errores?: Record<string, string>
  ) {
    super(mensaje)
    this.name = 'ErrorApi'
  }

  /**
   * Si el problema fue llegar al servidor.
   *
   * Es la pregunta que decide si una venta se encola o se descarta, asi que
   * tiene que ser una sola condicion y no una interpretacion en cada pantalla.
   */
  get esDeRed(): boolean {
    return this.estado === 0
  }
}

/** Guarda y lee el token en el llavero del sistema. */
export const almacen = {
  async token(): Promise<string | null> {
    return SecureStore.getItemAsync(CLAVE_TOKEN)
  },

  async guardarSesion(token: string, refresh: string | null): Promise<void> {
    await SecureStore.setItemAsync(CLAVE_TOKEN, token)
    if (refresh) await SecureStore.setItemAsync(CLAVE_REFRESH, refresh)
  },

  async borrarSesion(): Promise<void> {
    await SecureStore.deleteItemAsync(CLAVE_TOKEN)
    await SecureStore.deleteItemAsync(CLAVE_REFRESH)
  },

  /**
   * Identificador de este telefono.
   *
   * Se genera una vez y se guarda: el servidor lo usa para saber de que equipo
   * vino cada venta sincronizada, que es lo que despues permite encontrar una
   * venta perdida sin adivinar en que caja se registro.
   */
  async dispositivo(): Promise<string> {
    let uuid = await SecureStore.getItemAsync(CLAVE_DISPOSITIVO)
    if (!uuid) {
      uuid = `movil-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
      await SecureStore.setItemAsync(CLAVE_DISPOSITIVO, uuid)
    }
    return uuid
  },
}

interface Sobre<T> {
  ok: boolean
  datos: T
  mensaje?: string
  errores?: Record<string, string>
  meta?: { total: number; pagina: number; por_pagina: number; paginas: number }
}

interface Opciones {
  cuerpo?: unknown
  /** Clave de idempotencia, para las ventas que vienen de la cola. */
  idempotencia?: string
  /** Peticiones publicas: el login no manda token. */
  sinSesion?: boolean
}

async function ejecutar<T>(
  metodo: 'GET' | 'POST' | 'PUT' | 'DELETE',
  ruta: string,
  opciones: Opciones = {}
): Promise<Sobre<T>> {
  const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' }

  if (!opciones.sinSesion) {
    const token = await almacen.token()
    if (token) cabeceras.Authorization = `Bearer ${token}`
  }

  cabeceras['X-Dispositivo'] = await almacen.dispositivo()
  if (opciones.idempotencia) cabeceras['Idempotency-Key'] = opciones.idempotencia

  let respuesta: Response
  try {
    respuesta = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    })
  } catch {
    // Estado 0 es la convencion de este cliente para "no se llego al servidor".
    // Distinguirlo es lo que permite encolar en vez de perder la venta.
    throw new ErrorApi(0, 'No se pudo contactar al servidor')
  }

  let sobre: Sobre<T> | null = null
  try {
    sobre = (await respuesta.json()) as Sobre<T>
  } catch {
    /* respuestas sin cuerpo */
  }

  if (!respuesta.ok || !sobre?.ok) {
    throw new ErrorApi(
      respuesta.status,
      sobre?.mensaje ?? `Error ${respuesta.status}`,
      sobre?.errores
    )
  }

  return sobre
}

export const api = {
  async obtener<T>(ruta: string): Promise<T> {
    return (await ejecutar<T>('GET', ruta)).datos
  },

  async pagina<T>(ruta: string): Promise<{ datos: T[]; total: number }> {
    const sobre = await ejecutar<T[]>('GET', ruta)
    return { datos: sobre.datos, total: sobre.meta?.total ?? sobre.datos.length }
  },

  async enviar<T>(ruta: string, cuerpo?: unknown, opciones: Omit<Opciones, 'cuerpo'> = {}): Promise<T> {
    return (await ejecutar<T>('POST', ruta, { ...opciones, cuerpo })).datos
  },

  async actualizar<T>(ruta: string, cuerpo?: unknown): Promise<T> {
    return (await ejecutar<T>('PUT', ruta, { cuerpo })).datos
  },
}
