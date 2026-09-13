import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { almacen, api, ErrorApi } from './api'

/** Lo que la app necesita saber de quien inicio sesion. */
export interface Perfil {
  id: number
  nombre: string
  apellido: string
  email: string
  rol: string
  sucursal_id: number | null
  sucursal: string | null
  permisos: string[]
}

interface Sesion {
  perfil: Perfil | null
  cargando: boolean
  entrar: (email: string, password: string) => Promise<void>
  salir: () => Promise<void>
  puede: (permiso: string) => boolean
}

const Contexto = createContext<Sesion | null>(null)

/**
 * Sesion de la app movil.
 *
 * Repite a proposito la decision que costo encontrar en el PWA: si al arrancar
 * no se puede consultar el perfil por falta de red, la sesion NO se cierra. Se
 * sigue con el perfil que se conoce.
 *
 * En el navegador ese error expulsaba a la vendedora al login justo cuando no
 * habia internet, que es exactamente cuando la aplicacion tiene que seguir
 * vendiendo. En un telefono de mostrador el problema seria peor: la senial se
 * cae sola varias veces al dia.
 *
 * La sesion se cierra solo cuando el servidor responde 401, que es el servidor
 * diciendo que ese token ya no vale.
 */
export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    void (async () => {
      const token = await almacen.token()
      if (!token) {
        setCargando(false)
        return
      }

      try {
        setPerfil(await api.obtener<Perfil>('/api/auth/yo'))
      } catch (e) {
        const error = e as ErrorApi
        if (!error.esDeRed && error.estado === 401) await almacen.borrarSesion()
        // Sin red no se toca nada: el token sigue guardado y se reintenta al
        // volver la senial.
      } finally {
        setCargando(false)
      }
    })()
  }, [])

  const entrar = useCallback(async (email: string, password: string) => {
    const r = await api.enviar<{ token: string; refresh_token?: string; usuario?: Perfil }>(
      '/api/auth/login',
      { email, password },
      { sinSesion: true }
    )

    await almacen.guardarSesion(r.token, r.refresh_token ?? null)
    setPerfil(r.usuario ?? (await api.obtener<Perfil>('/api/auth/yo')))
  }, [])

  const salir = useCallback(async () => {
    await api.enviar('/api/auth/salir').catch(() => null)
    await almacen.borrarSesion()
    setPerfil(null)
  }, [])

  const puede = useCallback(
    (permiso: string) =>
      perfil !== null && (perfil.permisos.includes('*') || perfil.permisos.includes(permiso)),
    [perfil]
  )

  const valor = useMemo<Sesion>(
    () => ({ perfil, cargando, entrar, salir, puede }),
    [perfil, cargando, entrar, salir, puede]
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSesion(): Sesion {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useSesion necesita estar dentro de ProveedorSesion')
  return ctx
}
