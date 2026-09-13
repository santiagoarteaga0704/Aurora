import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { MedidasCliente } from '@aurora/contratos'
import { api, ErrorApi } from '../api/cliente'
import { useSesion } from '../sesion/SesionContexto'
import { Cargando } from '../componentes/Estados'
import { clases } from '../util/formato'

interface Direccion {
  id: number
  alias: string
  direccion: string
  ciudad: string
  referencia: string | null
  destinatario: string | null
  telefono: string | null
  es_principal: boolean
}

interface Ciudad {
  id: number
  nombre: string
}

const DIRECCION_VACIA = {
  alias: '',
  direccion: '',
  ciudad_id: '',
  referencia: '',
  destinatario: '',
  telefono: '',
  es_principal: false,
}

/**
 * Mi cuenta.
 *
 * Junta las tres cosas que una clienta administra de si misma: sus datos, a
 * donde le llega lo que compra, y sus medidas. Estaban repartidas —las medidas
 * en su propia pantalla, las direcciones solo dentro del checkout— y no habia
 * un lugar al que ir a cambiar algo sin estar en mitad de una compra.
 *
 * Las medidas no se duplican aqui: se muestran y se enlaza a la pantalla que ya
 * las edita, con su silueta. Tener dos formularios para lo mismo garantiza que
 * en algun momento validen distinto.
 */
export function MiCuenta() {
  const { perfil } = useSesion()

  const [direcciones, setDirecciones] = useState<Direccion[] | null>(null)
  const [ciudades, setCiudades] = useState<Ciudad[]>([])
  const [medidas, setMedidas] = useState<MedidasCliente | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [agregando, setAgregando] = useState(false)
  const [forma, setForma] = useState({ ...DIRECCION_VACIA })
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const [ds, ms] = await Promise.all([
      api.obtener<Direccion[]>('/api/clientes/mis-direcciones').catch(() => []),
      api.obtener<MedidasCliente | null>('/api/probador/mis-medidas').catch(() => null),
    ])
    setDirecciones(ds)
    setMedidas(ms)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    void api.obtener<Ciudad[]>('/api/ciudades').then(setCiudades).catch(() => [])
  }, [])

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setErrores({})

    try {
      const lista = await api.enviar<Direccion[]>('/api/clientes/mis-direcciones', {
        alias: forma.alias,
        direccion: forma.direccion,
        ciudad_id: Number(forma.ciudad_id),
        referencia: forma.referencia || undefined,
        destinatario: forma.destinatario || undefined,
        telefono: forma.telefono || undefined,
        es_principal: forma.es_principal,
      })
      setDirecciones(lista)
      setForma({ ...DIRECCION_VACIA })
      setAgregando(false)
      setAviso('Dirección agregada')
    } catch (err) {
      const e2 = err as ErrorApi
      setErrores(e2.errores ?? {})
      setAviso(e2.message)
    } finally {
      setGuardando(false)
    }
  }

  const quitar = async (d: Direccion) => {
    try {
      setDirecciones(await api.quitar<Direccion[]>(`/api/clientes/mis-direcciones/${d.id}`))
      setAviso(`"${d.alias}" eliminada`)
    } catch (e) {
      setAviso((e as ErrorApi).message)
    }
  }

  if (direcciones === null) {
    return (
      <div className="contenedor-angosto seccion">
        <Cargando texto="Buscando tu cuenta" />
      </div>
    )
  }

  return (
    <div className="contenedor seccion surge">
      <header className="cuenta__cabecera">
        <h1>Mi cuenta</h1>
        <p className="cuenta__bajada">Tus datos, a dónde te llega y tus medidas.</p>
      </header>

      {aviso && <p className="aviso">{aviso}</p>}

      <div className="cuenta">
        {/* --- Datos --- */}
        <section className="cuenta__bloque">
          <h2 className="cuenta__titulo">Datos</h2>

          <dl className="cuenta__datos">
            <div>
              <dt className="rotulo">Nombre</dt>
              <dd>
                {perfil?.nombre} {perfil?.apellido}
              </dd>
            </div>
            <div>
              <dt className="rotulo">Correo</dt>
              <dd className="cifra">{perfil?.email}</dd>
            </div>
            {perfil?.telefono && (
              <div>
                <dt className="rotulo">Teléfono</dt>
                <dd className="cifra">{perfil.telefono}</dd>
              </div>
            )}
            {perfil?.tipo_cliente === 'mayorista' && (
              <div>
                <dt className="rotulo">Mayoreo</dt>
                <dd>
                  {perfil.mayorista_aprobado ? (
                    <span className="marca marca--bien">Aprobado</span>
                  ) : (
                    <span className="marca marca--ojo">Esperando aprobación</span>
                  )}
                </dd>
              </div>
            )}
            {typeof perfil?.puntos === 'number' && (
              <div>
                <dt className="rotulo">Puntos</dt>
                <dd className="cifra">{perfil.puntos}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* --- Medidas --- */}
        <section className="cuenta__bloque">
          <h2 className="cuenta__titulo">Mis medidas</h2>

          {medidas ? (
            <>
              <dl className="cuenta__datos">
                <div>
                  <dt className="rotulo">Altura</dt>
                  <dd className="cifra">{medidas.altura_cm} cm</dd>
                </div>
                <div>
                  <dt className="rotulo">Busto</dt>
                  <dd className="cifra">{medidas.busto_cm ?? '—'} cm</dd>
                </div>
                <div>
                  <dt className="rotulo">Cintura</dt>
                  <dd className="cifra">{medidas.cintura_cm ?? '—'} cm</dd>
                </div>
                <div>
                  <dt className="rotulo">Cadera</dt>
                  <dd className="cifra">{medidas.cadera_cm ?? '—'} cm</dd>
                </div>
              </dl>

              {medidas.origen === 'estimado' && (
                <p className="cuenta__nota">
                  Algunas se estimaron a partir de tu altura y peso. Si te las tomás de verdad, la
                  talla que te recomendamos va a ser más precisa.
                </p>
              )}

              <Link to="/mis-medidas" className="boton boton--linea">
                Cambiar mis medidas
              </Link>
            </>
          ) : (
            <>
              <p className="cuenta__nota">
                Con tus medidas te decimos qué talla pedir en cada prenda, y podés probártela con la
                cámara.
              </p>
              <Link to="/mis-medidas" className="boton boton--vino">
                Cargar mis medidas
              </Link>
            </>
          )}
        </section>

        {/* --- Direcciones --- */}
        <section className="cuenta__bloque cuenta__bloque--ancho">
          <div className="cuenta__titulo-fila">
            <h2 className="cuenta__titulo">Direcciones</h2>
            {!agregando && (
              <button
                type="button"
                className="boton boton--linea"
                onClick={() => setAgregando(true)}
              >
                Agregar
              </button>
            )}
          </div>

          {direcciones.length === 0 && !agregando && (
            <p className="cuenta__nota">
              Todavía no cargaste ninguna. Hace falta una para que te llevemos el pedido a casa.
            </p>
          )}

          {direcciones.length > 0 && (
            <ul className="cuenta__direcciones">
              {direcciones.map((d) => (
                <li key={d.id} className={clases('direccion', d.es_principal && 'direccion--principal')}>
                  <div className="direccion__cabecera">
                    <p className="direccion__alias">{d.alias}</p>
                    {d.es_principal && <span className="marca">Principal</span>}
                  </div>

                  <p className="direccion__texto">{d.direccion}</p>
                  <p className="direccion__ciudad">{d.ciudad}</p>
                  {d.referencia && <p className="direccion__referencia">{d.referencia}</p>}
                  {d.destinatario && (
                    <p className="direccion__referencia">Recibe: {d.destinatario}</p>
                  )}

                  <button
                    type="button"
                    className="boton boton--fantasma"
                    onClick={() => void quitar(d)}
                  >
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          )}

          {agregando && (
            <form className="cuenta__formulario" onSubmit={(e) => void agregar(e)}>
              <label className="campo">
                <span className="campo__etiqueta">Nombre</span>
                <input
                  className="campo__control"
                  required
                  placeholder="Casa, Oficina…"
                  value={forma.alias}
                  onChange={(e) => setForma((f) => ({ ...f, alias: e.target.value }))}
                />
                {errores.alias && <span className="campo__error">{errores.alias}</span>}
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Ciudad</span>
                <select
                  className="campo__control"
                  required
                  value={forma.ciudad_id}
                  onChange={(e) => setForma((f) => ({ ...f, ciudad_id: e.target.value }))}
                >
                  <option value="">Elegir</option>
                  {ciudades.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="campo cuenta__campo-ancho">
                <span className="campo__etiqueta">Dirección</span>
                <input
                  className="campo__control"
                  required
                  placeholder="Calle, número"
                  value={forma.direccion}
                  onChange={(e) => setForma((f) => ({ ...f, direccion: e.target.value }))}
                />
                {errores.direccion && <span className="campo__error">{errores.direccion}</span>}
              </label>

              <label className="campo cuenta__campo-ancho">
                <span className="campo__etiqueta">Referencia</span>
                <input
                  className="campo__control"
                  placeholder="Portón verde, al lado de la farmacia…"
                  value={forma.referencia}
                  onChange={(e) => setForma((f) => ({ ...f, referencia: e.target.value }))}
                />
                <span className="campo__ayuda">
                  Le ahorra una llamada a quien reparte.
                </span>
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Quién recibe</span>
                <input
                  className="campo__control"
                  placeholder="Si no estás vos"
                  value={forma.destinatario}
                  onChange={(e) => setForma((f) => ({ ...f, destinatario: e.target.value }))}
                />
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Teléfono</span>
                <input
                  className="campo__control"
                  value={forma.telefono}
                  onChange={(e) => setForma((f) => ({ ...f, telefono: e.target.value }))}
                />
              </label>

              <label className="cuenta__principal">
                <input
                  type="checkbox"
                  checked={forma.es_principal}
                  onChange={(e) => setForma((f) => ({ ...f, es_principal: e.target.checked }))}
                />
                <span>Usar esta como principal</span>
              </label>

              <div className="cuenta__acciones">
                <button
                  type="button"
                  className="boton boton--fantasma"
                  onClick={() => setAgregando(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="boton boton--vino" disabled={guardando}>
                  {guardando ? 'Guardando' : 'Guardar dirección'}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
