import { useCallback, useEffect, useState } from 'react'
import type { RolConPermisos } from '@aurora/contratos'
import { api, ErrorApi } from '../api/cliente'
import { Cargando, ErrorCarga } from '../componentes/Estados'
import { clases } from '../util/formato'

interface PermisoDisponible {
  codigo: string
  descripcion: string
}

interface ModuloDePermisos {
  modulo: string
  permisos: PermisoDisponible[]
}

/**
 * Permisos por rol.
 *
 * Los permisos viven en la base, no en el codigo: esta pantalla es lo que hace
 * que esa decision sirva de algo. Un administrador puede armar un rol nuevo
 * —"encargada de vitrina", "cajera de fin de semana"— y darle exactamente lo
 * que necesita, sin que nadie recompile nada.
 *
 * El cambio tiene efecto en la siguiente peticion de esa persona, no cuando
 * caduque su token: los permisos se releen por peticion y la cache se invalida
 * al guardar.
 */
export function Roles() {
  const [roles, setRoles] = useState<RolConPermisos[] | null>(null)
  const [modulos, setModulos] = useState<ModuloDePermisos[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [elegido, setElegido] = useState<number | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState(false)

  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [errorAlta, setErrorAlta] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const [rs, ms] = await Promise.all([
        api.obtener<RolConPermisos[]>('/api/roles'),
        api.obtener<ModuloDePermisos[]>('/api/permisos').catch(() => []),
      ])
      setRoles(rs)
      setModulos(ms)
      setElegido((actual) => actual ?? rs.find((r) => !r.es_sistema)?.id ?? rs[0]?.id ?? null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Al cambiar de rol se recargan sus permisos: si se arrastraran los del rol
  // anterior, un guardado descuidado se los copiaria.
  useEffect(() => {
    const rol = roles?.find((r) => r.id === elegido)
    setMarcados(new Set(rol?.permisos ?? []))
    setAviso(null)
  }, [elegido, roles])

  const alternar = (codigo: string) => {
    setMarcados((previos) => {
      const nuevos = new Set(previos)
      if (nuevos.has(codigo)) nuevos.delete(codigo)
      else nuevos.add(codigo)
      return nuevos
    })
  }

  const guardar = async () => {
    if (elegido === null) return
    setGuardando(true)
    setAviso(null)
    try {
      await api.actualizar(`/api/roles/${elegido}/permisos`, { permisos: [...marcados] })
      setAviso('Permisos actualizados. Tiene efecto en la próxima pantalla que abran.')
      await cargar()
    } catch (e) {
      setAviso((e as ErrorApi).message)
    } finally {
      setGuardando(false)
    }
  }

  const crear = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorAlta(null)
    try {
      const rol = await api.enviar<RolConPermisos>('/api/roles', {
        nombre,
        descripcion: descripcion || undefined,
      })
      setCreando(false)
      setNombre('')
      setDescripcion('')
      await cargar()
      setElegido(rol.id)
      setAviso(`Rol "${rol.nombre}" creado. Ahora elegí qué puede hacer.`)
    } catch (e) {
      setErrorAlta((e as ErrorApi).message)
    }
  }

  if (error) return <ErrorCarga mensaje={error} reintentar={() => void cargar()} />
  if (roles === null) return <Cargando texto="Buscando roles" />

  const rol = roles.find((r) => r.id === elegido) ?? null
  const comodin = marcados.has('*')

  // Un rol del sistema no se toca desde aqui: dejar sin permisos al
  // administrador cerraria la puerta con la llave adentro.
  const bloqueado = rol?.es_sistema === true

  const sinGuardar =
    rol !== null &&
    (marcados.size !== rol.permisos.length || rol.permisos.some((p) => !marcados.has(p)))

  return (
    <div className="pantalla">
      <header className="pantalla__cabecera">
        <div>
          <h1 className="pantalla__titulo">Roles</h1>
          <p className="rotulo">Qué puede hacer cada quien</p>
        </div>

        <button type="button" className="boton boton--vino" onClick={() => setCreando(true)}>
          Crear rol
        </button>
      </header>

      {aviso && <p className="aviso aviso--bien">{aviso}</p>}

      <div className="roles">
        <ul className="roles__lista">
          {roles.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={clases('roles__item', r.id === elegido && 'roles__item--activo')}
                onClick={() => setElegido(r.id)}
              >
                <span className="roles__nombre">{r.nombre}</span>
                <span className="roles__meta">
                  {r.usuarios} persona{r.usuarios === 1 ? '' : 's'} ·{' '}
                  {r.permisos.includes('*') ? 'todo' : `${r.permisos.length} permisos`}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="roles__panel">
          {rol === null ? (
            <p className="rotulo">Elegí un rol de la lista.</p>
          ) : (
            <>
              <header className="pantalla__cabecera">
                <div>
                  <h2 className="pantalla__titulo">{rol.nombre}</h2>
                  <p className="rotulo">{rol.descripcion ?? 'Sin descripción'}</p>
                </div>

                {!bloqueado && (
                  <button
                    type="button"
                    className="boton boton--vino"
                    onClick={() => void guardar()}
                    disabled={guardando || !sinGuardar}
                  >
                    {guardando ? 'Guardando' : sinGuardar ? 'Guardar cambios' : 'Sin cambios'}
                  </button>
                )}
              </header>

              {bloqueado && (
                <p className="roles__aviso-sistema">
                  Es un rol del sistema y no se edita desde acá. El administrador tiene el comodín{' '}
                  <code>*</code>: quitárselo cerraría la puerta con la llave adentro.
                </p>
              )}

              {comodin && !bloqueado && (
                <p className="roles__aviso-sistema">
                  Este rol tiene el comodín <code>*</code>, así que puede todo sin importar lo que
                  esté marcado abajo.
                </p>
              )}

              {modulos.map((m) => (
                <section key={m.modulo} className="roles__modulo">
                  <h3 className="rotulo roles__modulo-nombre">{m.modulo}</h3>

                  <ul className="roles__permisos">
                    {m.permisos.map((p) => (
                      <li key={p.codigo}>
                        <label className="roles__permiso">
                          <input
                            type="checkbox"
                            checked={marcados.has(p.codigo)}
                            disabled={bloqueado}
                            onChange={() => alternar(p.codigo)}
                          />
                          <span>
                            {p.descripcion}
                            <span className="roles__permiso-codigo">{p.codigo}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>
      </div>

      {creando && (
        <div className="modal" role="dialog" aria-modal="true">
          <form className="modal__caja" onSubmit={(e) => void crear(e)}>
            <h2 className="modal__titulo">Crear rol</h2>
            <p className="modal__bajada">
              Nace sin permisos: los elegís después, en la lista de la derecha.
            </p>

            <div className="modal__campos">
              <label className="campo">
                <span className="campo__etiqueta">Nombre</span>
                <input
                  className="campo__control"
                  required
                  placeholder="encargada_vitrina"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
                <span className="campo__ayuda">
                  Minúsculas, sin espacios. Es el identificador, no el título.
                </span>
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Descripción</span>
                <input
                  className="campo__control"
                  placeholder="Atiende vitrina y arma pedidos"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              </label>
            </div>

            {errorAlta && <p className="aviso aviso--error">{errorAlta}</p>}

            <div className="modal__acciones">
              <button
                type="button"
                className="boton boton--fantasma"
                onClick={() => setCreando(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="boton boton--vino">
                Crear
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
