import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ParTokens, PerfilCompleto } from '@aurora/contratos'
import { PERMISOS } from '@aurora/contratos'
import { almacen, api, ErrorApi } from '../api/cliente'

interface Sesion {
  perfil: PerfilCompleto | null
  cargando: boolean
  /** Cierto mientras no se sepa todavia si hay sesion. */
  entrar: (email: string, password: string) => Promise<void>
  registrarse: (datos: DatosAlta) => Promise<void>
  salir: () => Promise<void>
  puede: (permiso: string) => boolean
  /** Cierto para el personal; falso para un cliente o un visitante. */
  esPersonal: boolean
  refrescarPerfil: () => Promise<void>
}

export interface DatosAlta {
  nombre: string
  apellido: string
  email: string
  password: string
  telefono?: string
  tipo?: 'minorista' | 'mayorista'
  nit?: string
  razon_social?: string
}

const Contexto = createContext<Sesion | null>(null)

/**
 * El perfil se guarda en el navegador ademas de pedirse al servidor.
 *
 * Sin esto, al abrir la aplicacion sin conexion la peticion a /api/auth/yo
 * falla, el perfil queda en null y la ruta protegida manda al login: la
 * vendedora no puede vender porque la aplicacion la echa. Es exactamente lo
 * contrario de lo que promete el modo sin conexion.
 *
 * La sesion se cierra SOLO cuando el servidor dice que el token ya no vale. Un
 * fallo de red no es una respuesta del servidor.
 */
const CLAVE_PERFIL = 'aurora.perfil'

function perfilGuardado(): PerfilCompleto | null {
  try {
    const crudo = localStorage.getItem(CLAVE_PERFIL)
    return crudo ? (JSON.parse(crudo) as PerfilCompleto) : null
  } catch {
    return null
  }
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  // Se arranca con lo ultimo que se supo, para que la aplicacion abra con
  // sesion aunque el servidor no conteste.
  const [perfil, setPerfil] = useState<PerfilCompleto | null>(() =>
    almacen.token() ? perfilGuardado() : null
  )
  const [cargando, setCargando] = useState(true)

  const cargarPerfil = useCallback(async () => {
    if (!almacen.token()) {
      localStorage.removeItem(CLAVE_PERFIL)
      setPerfil(null)
      setCargando(false)
      return
    }

    try {
      const fresco = await api.obtener<PerfilCompleto>('/api/auth/yo')
      localStorage.setItem(CLAVE_PERFIL, JSON.stringify(fresco))
      setPerfil(fresco)
    } catch (e) {
      const fallo = e as ErrorApi

      // El servidor contesto que el token no vale: ahi si se cierra la sesion.
      if (fallo instanceof ErrorApi && !fallo.esDeRed && fallo.estado === 401) {
        almacen.borrarSesion()
        localStorage.removeItem(CLAVE_PERFIL)
        setPerfil(null)
      } else {
        // Sin red se sigue con el perfil conocido. Los permisos son los de la
        // ultima vez que se pudo preguntar; el servidor los vuelve a validar en
        // cuanto la conexion regrese, asi que no hay forma de ganar permisos
        // quedandose sin internet.
        setPerfil(perfilGuardado())
      }
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargarPerfil()
  }, [cargarPerfil])

  const aplicarTokens = useCallback(
    async (par: ParTokens) => {
      almacen.guardarSesion(par.token, par.refresh_token)
      await cargarPerfil()
    },
    [cargarPerfil]
  )

  const entrar = useCallback(
    async (email: string, password: string) => {
      const par = await api.enviar<ParTokens>(
        '/api/auth/login',
        { email, password },
        { sinSesion: true }
      )
      await aplicarTokens(par)
    },
    [aplicarTokens]
  )

  const registrarse = useCallback(
    async (datos: DatosAlta) => {
      const par = await api.enviar<ParTokens>('/api/auth/registro', datos, { sinSesion: true })
      await aplicarTokens(par)
    },
    [aplicarTokens]
  )

  const salir = useCallback(async () => {
    const refresh = almacen.refresh()
    try {
      await api.enviar('/api/auth/logout', { refresh_token: refresh ?? undefined })
    } catch {
      // Si no hay red, igual se cierra la sesion local: el refresh caduca solo.
    }
    almacen.borrarSesion()
    localStorage.removeItem(CLAVE_PERFIL)
    setPerfil(null)
  }, [])

  const puede = useCallback(
    (permiso: string) => {
      const permisos = perfil?.permisos ?? []
      return permisos.includes(PERMISOS.COMODIN) || permisos.includes(permiso)
    },
    [perfil]
  )

  const valor = useMemo<Sesion>(
    () => ({
      perfil,
      cargando,
      entrar,
      registrarse,
      salir,
      puede,
      // Un cliente tiene rol 'cliente'; cualquier otro rol es personal.
      esPersonal: perfil !== null && perfil.rol !== 'cliente',
      refrescarPerfil: cargarPerfil,
    }),
    [perfil, cargando, entrar, registrarse, salir, puede, cargarPerfil]
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSesion(): Sesion {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useSesion necesita estar dentro de ProveedorSesion')
  return ctx
}
