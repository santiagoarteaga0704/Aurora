import { useCallback, useEffect, useState } from 'react'
import type {
  DatosCrearUsuario,
  MetaPagina,
  RolConPermisos,
  UsuarioAdmin,
} from '@aurora/contratos'
import { PERMISOS } from '@aurora/contratos'
import { api, consulta, ErrorApi } from '../api/cliente'
import { useSesion } from '../sesion/SesionContexto'
import { Cargando, ErrorCarga, Vacio } from '../componentes/Estados'
import { bs, clases, hace } from '../util/formato'

interface Sucursal {
  id: number
  nombre: string
}

const VACIO = {
  rol_id: '',
  sucursal_id: '',
  nombre: '',
  apellido: '',
  email: '',
  telefono: '',
  ci: '',
  password: '',
}

/**
 * Personal y clientes.
 *
 * Una sola pantalla para los dos porque son la misma tabla y la misma pregunta:
 * quien puede entrar y con que puede. Separarlas obligaria a saber de antemano
 * en cual buscar a alguien, que es justo lo que no se sabe cuando se lo esta
 * buscando.
 *
 * Lo que cambia segun de quien se trate es la accion: al personal se le edita
 * el rol y la sucursal; a un cliente mayorista se le aprueban los precios de
 * mayoreo.
 */
export function Usuarios() {
  const { puede, perfil } = useSesion()

  const [filas, setFilas] = useState<UsuarioAdmin[] | null>(null)
  const [meta, setMeta] = useState<MetaPagina | null>(null)
  const [roles, setRoles] = useState<RolConPermisos[]>([])
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [busqueda, setBusqueda] = useState('')
  const [rolFiltro, setRolFiltro] = useState('')
  const [soloActivos, setSoloActivos] = useState(true)
  const [pagina, setPagina] = useState(1)

  const [alta, setAlta] = useState(false)
  const [forma, setForma] = useState({ ...VACIO })
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorForma, setErrorForma] = useState<string | null>(null)

  const [mayorista, setMayorista] = useState<UsuarioAdmin | null>(null)
  const [descuento, setDescuento] = useState('0')
  const [credito, setCredito] = useState('0')

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const r = await api.pagina<UsuarioAdmin>(
        `/api/usuarios${consulta({
          q: busqueda.trim() || undefined,
          rol_id: rolFiltro || undefined,
          solo_activos: soloActivos ? 'true' : 'false',
          pagina,
          por_pagina: 25,
        })}`
      )
      setFilas(r.datos)
      setMeta(r.meta)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [busqueda, rolFiltro, soloActivos, pagina])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    void api.obtener<RolConPermisos[]>('/api/roles').then(setRoles).catch(() => setRoles([]))
    void api
      .obtener<Sucursal[]>('/api/sucursales')
      .then(setSucursales)
      .catch(() => setSucursales([]))
  }, [])

  // --- Alta y edicion -------------------------------------------------------

  const abrirAlta = () => {
    setForma({ ...VACIO })
    setErrores({})
    setErrorForma(null)
    setEditando(null)
    setAlta(true)
  }

  const abrirEdicion = (u: UsuarioAdmin) => {
    setForma({
      rol_id: String(u.rol_id),
      sucursal_id: u.sucursal_id ? String(u.sucursal_id) : '',
      nombre: u.nombre,
      apellido: u.apellido,
      email: u.email,
      telefono: u.telefono ?? '',
      ci: u.ci ?? '',
      password: '',
    })
    setErrores({})
    setErrorForma(null)
    setEditando(u)
    setAlta(true)
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setErrores({})
    setErrorForma(null)

    try {
      if (editando) {
        // Solo lo que cambio: mandar el resto reescribiria campos que nadie
        // toco, y una contrasenia vacia cerraria las sesiones sin querer.
        const cambios: Record<string, unknown> = {
          rol_id: Number(forma.rol_id),
          sucursal_id: forma.sucursal_id ? Number(forma.sucursal_id) : null,
          nombre: forma.nombre,
          apellido: forma.apellido,
          telefono: forma.telefono || undefined,
          ci: forma.ci || undefined,
        }
        if (forma.password) cambios.password = forma.password

        await api.actualizar(`/api/usuarios/${editando.id}`, cambios)
        setAviso(`${forma.nombre} actualizado`)
      } else {
        const datos: DatosCrearUsuario = {
          rol_id: Number(forma.rol_id),
          sucursal_id: forma.sucursal_id ? Number(forma.sucursal_id) : undefined,
          nombre: forma.nombre,
          apellido: forma.apellido,
          email: forma.email,
          telefono: forma.telefono || undefined,
          ci: forma.ci || undefined,
          password: forma.password,
        }
        await api.enviar('/api/usuarios', datos)
        setAviso(`${forma.nombre} dado de alta`)
      }

      setAlta(false)
      await cargar()
    } catch (e) {
      const err = e as ErrorApi
      setErrores(err.errores ?? {})
      setErrorForma(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const darDeBaja = async (u: UsuarioAdmin) => {
    try {
      await api.quitar(`/api/usuarios/${u.id}`)
      setAviso(`${u.nombre} ${u.apellido} dado de baja`)
      await cargar()
    } catch (e) {
      setAviso((e as Error).message)
    }
  }

  // --- Mayoristas -----------------------------------------------------------

  const abrirMayorista = (u: UsuarioAdmin) => {
    setMayorista(u)
    setDescuento('0')
    setCredito('0')
  }

  const resolverMayorista = async (aprobado: boolean) => {
    if (!mayorista) return
    try {
      await api.enviar(`/api/usuarios/${mayorista.id}/aprobar-mayorista`, {
        aprobado,
        descuento_extra: aprobado ? Number(descuento || 0) : undefined,
        limite_credito: aprobado ? Number(credito || 0) : undefined,
      })
      setAviso(
        aprobado
          ? `${mayorista.nombre} ya tiene precios de mayoreo`
          : `Se le quitaron los precios de mayoreo a ${mayorista.nombre}`
      )
      setMayorista(null)
      await cargar()
    } catch (e) {
      setAviso((e as Error).message)
    }
  }

  // --- Pantalla -------------------------------------------------------------

  if (error) return <ErrorCarga mensaje={error} reintentar={() => void cargar()} />

  const puedeCrear = puede(PERMISOS.USUARIO_CREAR)
  const puedeEditar = puede(PERMISOS.USUARIO_EDITAR)
  const puedeBorrar = puede(PERMISOS.USUARIO_ELIMINAR)

  return (
    <div className="pantalla">
      <header className="pantalla__cabecera">
        <div>
          <h1 className="pantalla__titulo">Usuarios</h1>
          <p className="rotulo">
            {meta ? `${meta.total} cuenta${meta.total === 1 ? '' : 's'}` : 'Personal y clientes'}
          </p>
        </div>

        {puedeCrear && (
          <button type="button" className="boton boton--vino" onClick={abrirAlta}>
            Dar de alta
          </button>
        )}
      </header>

      <div className="pantalla__controles">
        <input
          className="campo__control"
          placeholder="Buscar por nombre o correo"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value)
            setPagina(1)
          }}
        />

        <select
          className="campo__control"
          value={rolFiltro}
          onChange={(e) => {
            setRolFiltro(e.target.value)
            setPagina(1)
          }}
        >
          <option value="">Todos los roles</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>

        <label className="interruptor">
          <input
            type="checkbox"
            checked={soloActivos}
            onChange={(e) => {
              setSoloActivos(e.target.checked)
              setPagina(1)
            }}
          />
          <span>Solo activos</span>
        </label>
      </div>

      {aviso && <p className="aviso aviso--bien">{aviso}</p>}

      {filas === null ? (
        <Cargando texto="Buscando cuentas" />
      ) : filas.length === 0 ? (
        <Vacio titulo="No hay cuentas que coincidan" detalle="Probá con otra búsqueda." />
      ) : (
        <div className="tabla-envoltorio">
          <table className="tabla tabla--oscura">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Sucursal</th>
                <th>Último acceso</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filas.map((u) => (
                <tr key={u.id} className={clases(!u.activo && 'fila--baja')}>
                  <td>
                    {u.nombre} {u.apellido}
                    {!u.activo && <span className="marca marca--mala">De baja</span>}
                    {u.tipo_cliente === 'mayorista' && (
                      <span
                        className={clases(
                          'marca',
                          u.mayorista_aprobado ? 'marca--bien' : 'marca--ojo'
                        )}
                      >
                        {u.mayorista_aprobado ? 'Mayorista' : 'Mayorista sin aprobar'}
                      </span>
                    )}
                  </td>
                  <td className="cifra">{u.email}</td>
                  <td>{u.rol}</td>
                  <td>{u.sucursal ?? '—'}</td>
                  <td className="cifra">{u.ultimo_acceso ? hace(u.ultimo_acceso) : 'Nunca'}</td>
                  <td className="tabla__acciones">
                    {puedeEditar && (
                      <button
                        type="button"
                        className="boton boton--linea"
                        onClick={() => abrirEdicion(u)}
                      >
                        Editar
                      </button>
                    )}

                    {puedeEditar && u.tipo_cliente === 'mayorista' && (
                      <button
                        type="button"
                        className="boton boton--linea"
                        onClick={() => abrirMayorista(u)}
                      >
                        {u.mayorista_aprobado ? 'Revisar mayoreo' : 'Aprobar mayoreo'}
                      </button>
                    )}

                    {/* Nadie se da de baja a si mismo: quedaria fuera del
                        sistema sin forma de volver a entrar. */}
                    {puedeBorrar && u.activo && u.id !== perfil?.id && (
                      <button
                        type="button"
                        className="boton boton--fantasma"
                        onClick={() => void darDeBaja(u)}
                      >
                        Dar de baja
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.paginas > 1 && (
        <nav className="paginador">
          <button
            type="button"
            className="boton boton--linea"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </button>
          <span className="cifra paginador__posicion">
            {meta.pagina} / {meta.paginas}
          </span>
          <button
            type="button"
            className="boton boton--linea"
            disabled={pagina >= meta.paginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Siguiente
          </button>
        </nav>
      )}

      {/* --- Alta y edicion --- */}
      {alta && (
        <div className="modal" role="dialog" aria-modal="true">
          <form className="modal__caja" onSubmit={(e) => void guardar(e)}>
            <h2 className="modal__titulo">
              {editando ? `Editar a ${editando.nombre}` : 'Dar de alta'}
            </h2>

            <div className="modal__campos">
              <label className="campo">
                <span className="campo__etiqueta">Nombre</span>
                <input
                  className="campo__control"
                  required
                  value={forma.nombre}
                  onChange={(e) => setForma((f) => ({ ...f, nombre: e.target.value }))}
                />
                {errores.nombre && <span className="campo__error">{errores.nombre}</span>}
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Apellido</span>
                <input
                  className="campo__control"
                  required
                  value={forma.apellido}
                  onChange={(e) => setForma((f) => ({ ...f, apellido: e.target.value }))}
                />
                {errores.apellido && <span className="campo__error">{errores.apellido}</span>}
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Correo</span>
                <input
                  className="campo__control"
                  type="email"
                  required
                  // El correo identifica la cuenta: cambiarlo seria otra cuenta.
                  disabled={editando !== null}
                  value={forma.email}
                  onChange={(e) => setForma((f) => ({ ...f, email: e.target.value }))}
                />
                {errores.email && <span className="campo__error">{errores.email}</span>}
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Rol</span>
                <select
                  className="campo__control"
                  required
                  value={forma.rol_id}
                  onChange={(e) => setForma((f) => ({ ...f, rol_id: e.target.value }))}
                >
                  <option value="">Elegir</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
                {errores.rol_id && <span className="campo__error">{errores.rol_id}</span>}
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Sucursal</span>
                <select
                  className="campo__control"
                  value={forma.sucursal_id}
                  onChange={(e) => setForma((f) => ({ ...f, sucursal_id: e.target.value }))}
                >
                  <option value="">Sin sucursal (ve todas)</option>
                  {sucursales.map((su) => (
                    <option key={su.id} value={su.id}>
                      {su.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Teléfono</span>
                <input
                  className="campo__control"
                  value={forma.telefono}
                  onChange={(e) => setForma((f) => ({ ...f, telefono: e.target.value }))}
                />
              </label>

              <label className="campo">
                <span className="campo__etiqueta">
                  {editando ? 'Nueva contraseña' : 'Contraseña'}
                </span>
                <input
                  className="campo__control"
                  type="password"
                  required={!editando}
                  placeholder={editando ? 'Dejar vacío para no cambiarla' : ''}
                  value={forma.password}
                  onChange={(e) => setForma((f) => ({ ...f, password: e.target.value }))}
                />
                {errores.password && <span className="campo__error">{errores.password}</span>}
                {editando && forma.password && (
                  <span className="campo__ayuda">
                    Cambiarla cierra todas las sesiones abiertas de esa persona.
                  </span>
                )}
              </label>
            </div>

            {errorForma && <p className="aviso aviso--error">{errorForma}</p>}

            <div className="modal__acciones">
              <button type="button" className="boton boton--fantasma" onClick={() => setAlta(false)}>
                Cancelar
              </button>
              <button type="submit" className="boton boton--vino" disabled={guardando}>
                {guardando ? 'Guardando' : editando ? 'Guardar cambios' : 'Dar de alta'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- Mayorista --- */}
      {mayorista && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal__caja">
            <h2 className="modal__titulo">Precios de mayoreo</h2>
            <p className="modal__bajada">
              {mayorista.nombre} {mayorista.apellido} · {mayorista.email}
            </p>

            <div className="modal__campos">
              <label className="campo">
                <span className="campo__etiqueta">Descuento extra (%)</span>
                <input
                  className="campo__control"
                  type="number"
                  min="0"
                  max="99"
                  step="0.5"
                  value={descuento}
                  onChange={(e) => setDescuento(e.target.value)}
                />
                <span className="campo__ayuda">
                  Se aplica sobre el precio de mayoreo, no sobre el de lista.
                </span>
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Límite de crédito</span>
                <input
                  className="campo__control"
                  type="number"
                  min="0"
                  step="50"
                  value={credito}
                  onChange={(e) => setCredito(e.target.value)}
                />
                <span className="campo__ayuda">{bs(Number(credito || 0))}</span>
              </label>
            </div>

            <div className="modal__acciones">
              <button
                type="button"
                className="boton boton--fantasma"
                onClick={() => setMayorista(null)}
              >
                Cancelar
              </button>
              {mayorista.mayorista_aprobado && (
                <button
                  type="button"
                  className="boton boton--linea"
                  onClick={() => void resolverMayorista(false)}
                >
                  Quitar mayoreo
                </button>
              )}
              <button
                type="button"
                className="boton boton--vino"
                onClick={() => void resolverMayorista(true)}
              >
                {mayorista.mayorista_aprobado ? 'Actualizar' : 'Aprobar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
