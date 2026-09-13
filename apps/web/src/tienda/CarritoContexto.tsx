import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Carrito } from '@aurora/contratos'
import { almacen, api } from '../api/cliente'
import { useSesion } from '../sesion/SesionContexto'

interface EstadoCarrito {
  carrito: Carrito | null
  cargando: boolean
  agregar: (varianteId: number, cantidad?: number) => Promise<void>
  cambiar: (varianteId: number, cantidad: number) => Promise<void>
  quitar: (varianteId: number) => Promise<void>
  vaciar: () => Promise<void>
  recargar: () => Promise<void>
  unidades: number
}

const Contexto = createContext<EstadoCarrito | null>(null)

/**
 * Carrito de la tienda.
 *
 * El token del carrito anonimo se guarda en localStorage y viaja en cada
 * peticion; al iniciar sesion, el servidor lo fusiona con el de la cuenta. Por
 * eso el carrito se recarga cuando cambia la sesion: es el momento en que esa
 * fusion ocurre y lo que se muestra tiene que reflejarla.
 */
export function ProveedorCarrito({ children }: { children: ReactNode }) {
  const { perfil, esPersonal } = useSesion()
  const [carrito, setCarrito] = useState<Carrito | null>(null)
  const [cargando, setCargando] = useState(false)

  const recibir = useCallback((nuevo: Carrito) => {
    setCarrito(nuevo)
    almacen.guardarCarrito(nuevo.session_token)
  }, [])

  const recargar = useCallback(async () => {
    // El personal vende desde el punto de venta, no tiene carrito.
    if (esPersonal) {
      setCarrito(null)
      return
    }
    setCargando(true)
    try {
      recibir(await api.obtener<Carrito>('/api/carrito'))
    } catch {
      // Sin red el carrito no se puede leer; se deja lo que haya en pantalla.
    } finally {
      setCargando(false)
    }
  }, [esPersonal, recibir])

  useEffect(() => {
    void recargar()
  }, [recargar, perfil?.id])

  const agregar = useCallback(
    async (varianteId: number, cantidad = 1) => {
      recibir(
        await api.enviar<Carrito>('/api/carrito/items', {
          variante_id: varianteId,
          cantidad,
        })
      )
    },
    [recibir]
  )

  const cambiar = useCallback(
    async (varianteId: number, cantidad: number) => {
      recibir(await api.actualizar<Carrito>(`/api/carrito/items/${varianteId}`, { cantidad }))
    },
    [recibir]
  )

  const quitar = useCallback(
    async (varianteId: number) => {
      recibir(await api.quitar<Carrito>(`/api/carrito/items/${varianteId}`))
    },
    [recibir]
  )

  const vaciar = useCallback(async () => {
    recibir(await api.quitar<Carrito>('/api/carrito'))
  }, [recibir])

  const valor = useMemo<EstadoCarrito>(
    () => ({
      carrito,
      cargando,
      agregar,
      cambiar,
      quitar,
      vaciar,
      recargar,
      unidades: carrito?.unidades ?? 0,
    }),
    [carrito, cargando, agregar, cambiar, quitar, vaciar, recargar]
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useCarrito(): EstadoCarrito {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useCarrito necesita estar dentro de ProveedorCarrito')
  return ctx
}
