import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { contarPendientes, sincronizar } from './cola'

interface Conexion {
  enLinea: boolean
  /** Operaciones esperando irse al servidor. */
  pendientes: number
  sincronizando: boolean
  ultimaSync: number | null
  /** Vuelve a contar la cola; lo llaman las pantallas que encolan algo. */
  refrescarCola: () => Promise<void>
  /** Fuerza un intento de sincronizacion. */
  sincronizarYa: () => Promise<void>
}

const Contexto = createContext<Conexion | null>(null)

/**
 * Estado de conexion de la aplicacion.
 *
 * `navigator.onLine` no alcanza: dice si hay una interfaz de red levantada, no
 * si el servidor contesta. Un wifi de cafeteria sin salida, o la API caida, dan
 * onLine=true y la venta se perderia igual. Por eso se pregunta a /api/salud,
 * que es justo para lo que existe ese endpoint.
 */
export function ProveedorConexion({ children }: { children: ReactNode }) {
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  const [pendientes, setPendientes] = useState(0)
  const [sincronizando, setSincronizando] = useState(false)
  const [ultimaSync, setUltimaSync] = useState<number | null>(null)
  const sincronizandoRef = useRef(false)

  const refrescarCola = useCallback(async () => {
    setPendientes(await contarPendientes())
  }, [])

  const intentarSincronizar = useCallback(async () => {
    // Un solo ciclo a la vez: dos en paralelo mandarian la misma operacion dos
    // veces y, aunque la idempotencia lo aguantaria, el conteo quedaria mal.
    if (sincronizandoRef.current) return
    if ((await contarPendientes()) === 0) {
      await refrescarCola()
      return
    }

    sincronizandoRef.current = true
    setSincronizando(true)
    try {
      await sincronizar()
      setUltimaSync(Date.now())
    } finally {
      sincronizandoRef.current = false
      setSincronizando(false)
      await refrescarCola()
    }
  }, [refrescarCola])

  /** Le pregunta al servidor si de verdad esta ahi. */
  const comprobar = useCallback(async (): Promise<boolean> => {
    try {
      const control = new AbortController()
      const corte = setTimeout(() => control.abort(), 4000)
      const res = await fetch('/api/salud', { signal: control.signal, cache: 'no-store' })
      clearTimeout(corte)
      const cuerpo = await res.json()
      return res.ok && cuerpo?.datos?.bd === true
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    let vivo = true

    const evaluar = async () => {
      const alcanzable = navigator.onLine ? await comprobar() : false
      if (!vivo) return

      setEnLinea((antes) => {
        // Al recuperar la conexion se vacia la cola sola. Es lo que hace que el
        // vendedor no tenga que acordarse de sincronizar nada.
        if (!antes && alcanzable) void intentarSincronizar()
        return alcanzable
      })
    }

    void evaluar()
    void refrescarCola()

    // Los eventos del navegador avisan rapido; el intervalo cubre el caso de la
    // red que sigue conectada pero el servidor dejo de responder.
    const alConectar = () => void evaluar()
    const alDesconectar = () => setEnLinea(false)
    window.addEventListener('online', alConectar)
    window.addEventListener('offline', alDesconectar)
    const reloj = setInterval(evaluar, 20_000)

    return () => {
      vivo = false
      window.removeEventListener('online', alConectar)
      window.removeEventListener('offline', alDesconectar)
      clearInterval(reloj)
    }
  }, [comprobar, intentarSincronizar, refrescarCola])

  // El estado de conexion pinta el cromo entero de la aplicacion.
  useEffect(() => {
    document.documentElement.dataset.conexion = enLinea ? 'online' : 'offline'
  }, [enLinea])

  const valor = useMemo<Conexion>(
    () => ({
      enLinea,
      pendientes,
      sincronizando,
      ultimaSync,
      refrescarCola,
      sincronizarYa: intentarSincronizar,
    }),
    [enLinea, pendientes, sincronizando, ultimaSync, refrescarCola, intentarSincronizar]
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useConexion(): Conexion {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useConexion necesita estar dentro de ProveedorConexion')
  return ctx
}
