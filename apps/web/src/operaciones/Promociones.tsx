import { useCallback, useEffect, useState } from 'react'
import type { MetaPagina, Promocion, TipoPromocion } from '@aurora/contratos'
import { ALCANCES, PERMISOS, TIPOS_PROMOCION } from '@aurora/contratos'
import { api, consulta, ErrorApi } from '../api/cliente'
import { useSesion } from '../sesion/SesionContexto'
import { Cargando, ErrorCarga, Vacio } from '../componentes/Estados'
import { bs, clases, fecha, numero } from '../util/formato'

interface Campania {
  id: number
  nombre: string
  tipo: string
  fecha_inicio: string
  fecha_fin: string
  activo: boolean
}

interface Categoria {
  id: number
  nombre: string
  hijas?: Categoria[]
}

const NOMBRE_TIPO: Record<TipoPromocion, string> = {
  porcentaje: 'Porcentaje',
  monto_fijo: 'Monto fijo',
  '2x1': '2x1',
  envio_gratis: 'Envío gratis',
}

const NOMBRE_ALCANCE: Record<string, string> = {
  todo: 'Todo el catálogo',
  categoria: 'Una categoría',
  producto: 'Un producto',
  variante: 'Una variante',
}

const HOY = () => new Date().toISOString().slice(0, 10)
const EN = (dias: number) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10)

/**
 * Campanias y promociones.
 *
 * Una campania es el paraguas —"Liquidacion de invierno"— y las promociones son
 * las reglas concretas que cuelgan de ella. Se pueden crear promociones
 * sueltas: no toda rebaja pertenece a una campania.
 *
 * Lo que el servidor decide y esta pantalla NO: cual se aplica. Cuando varias
 * promociones alcanzan a un mismo carrito se aplica UNA, la que mas conviene a
 * la clienta. Configurar dos que se pisan no es un error a corregir aqui.
 */
export function Promociones() {
  const { puede } = useSesion()

  const [filas, setFilas] = useState<Promocion[] | null>(null)
  const [meta, setMeta] = useState<MetaPagina | null>(null)
  const [campanias, setCampanias] = useState<Campania[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [soloVigentes, setSoloVigentes] = useState(false)
  const [pagina, setPagina] = useState(1)

  const [alta, setAlta] = useState(false)
  const [forma, setForma] = useState({
    nombre: '',
    tipo: 'porcentaje' as TipoPromocion,
    valor: '10',
    codigo_cupon: '',
    min_compra: '0',
    aplica_a: 'todo',
    aplica_id: '',
    campania_id: '',
    usos_max: '',
    fecha_inicio: HOY(),
    fecha_fin: EN(30),
  })
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorAlta, setErrorAlta] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const [altaCampania, setAltaCampania] = useState(false)
  const [campania, setCampania] = useState({
    nombre: '',
    tipo: 'temporada',
    fecha_inicio: HOY(),
    fecha_fin: EN(45),
  })

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const r = await api.pagina<Promocion>(
        `/api/promociones${consulta({
          vigentes: soloVigentes ? 'true' : undefined,
          pagina,
          por_pagina: 25,
        })}`
      )
      setFilas(r.datos)
      setMeta(r.meta)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [soloVigentes, pagina])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    void api.obtener<Campania[]>('/api/campanias').then(setCampanias).catch(() => [])
    void api.obtener<Categoria[]>('/api/catalogo/categorias').then(setCategorias).catch(() => [])
  }, [])

  const crear = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrores({})
    setErrorAlta(null)
    setTrabajando(true)

    try {
      await api.enviar('/api/promociones', {
        nombre: forma.nombre,
        tipo: forma.tipo,
        valor: Number(forma.valor || 0),
        codigo_cupon: forma.codigo_cupon.trim() || undefined,
        min_compra: Number(forma.min_compra || 0),
        aplica_a: forma.aplica_a,
        aplica_id: forma.aplica_id ? Number(forma.aplica_id) : undefined,
        campania_id: forma.campania_id ? Number(forma.campania_id) : undefined,
        usos_max: forma.usos_max ? Number(forma.usos_max) : undefined,
        fecha_inicio: forma.fecha_inicio,
        fecha_fin: forma.fecha_fin,
      })
      setAlta(false)
      setAviso(`Promoción "${forma.nombre}" creada`)
      await cargar()
    } catch (err) {
      const e2 = err as ErrorApi
      setErrores(e2.errores ?? {})
      setErrorAlta(e2.message)
    } finally {
      setTrabajando(false)
    }
  }

  const crearCampania = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.enviar('/api/campanias', campania)
      setAltaCampania(false)
      setCampanias(await api.obtener<Campania[]>('/api/campanias'))
      setAviso(`Campaña "${campania.nombre}" creada`)
    } catch (err) {
      setAviso((err as ErrorApi).message)
    }
  }

  const desactivar = async (p: Promocion) => {
    try {
      await api.quitar(`/api/promociones/${p.id}`)
      setAviso(`"${p.nombre}" desactivada`)
      await cargar()
    } catch (e) {
      setAviso((e as ErrorApi).message)
    }
  }

  if (error) return <ErrorCarga mensaje={error} reintentar={() => void cargar()} />

  const puedeGestionar = puede(PERMISOS.PROMOCION_GESTIONAR)
  const planas = categorias.flatMap((c) => [c, ...(c.hijas ?? [])])

  /** Un 2x1 y un envio gratis no llevan valor: el tipo ya lo dice todo. */
  const pideValor = forma.tipo === 'porcentaje' || forma.tipo === 'monto_fijo'

  return (
    <div className="pantalla">
      <header className="pantalla__cabecera">
        <div>
          <h1 className="pantalla__titulo">Promociones</h1>
          <p className="rotulo">
            {meta ? `${meta.total} regla${meta.total === 1 ? '' : 's'}` : 'Campañas y descuentos'}
          </p>
        </div>

        <div className="pantalla__controles">
          <label className="interruptor">
            <input
              type="checkbox"
              checked={soloVigentes}
              onChange={(e) => {
                setSoloVigentes(e.target.checked)
                setPagina(1)
              }}
            />
            <span>Solo vigentes</span>
          </label>

          {puedeGestionar && (
            <>
              <button
                type="button"
                className="boton boton--linea"
                onClick={() => setAltaCampania(true)}
              >
                Nueva campaña
              </button>
              <button type="button" className="boton boton--vino" onClick={() => setAlta(true)}>
                Nueva promoción
              </button>
            </>
          )}
        </div>
      </header>

      {aviso && <p className="aviso aviso--bien">{aviso}</p>}

      {filas === null ? (
        <Cargando texto="Buscando promociones" />
      ) : filas.length === 0 ? (
        <Vacio
          titulo="No hay promociones"
          detalle={
            soloVigentes
              ? 'Ninguna rige hoy. Probá sacando el filtro.'
              : 'Cuando se cree una promoción, aparece acá.'
          }
        />
      ) : (
        <div className="tabla-envoltorio">
          <table className="tabla tabla--oscura">
            <thead>
              <tr>
                <th>Promoción</th>
                <th>Tipo</th>
                <th>Se aplica a</th>
                <th>Cupón</th>
                <th className="tabla__num">Usos</th>
                <th>Vigencia</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <tr key={p.id} className={clases(!p.activo && 'fila--baja')}>
                  <td>
                    {p.nombre}
                    {p.campania && <span className="tabla__sub">{p.campania}</span>}
                  </td>
                  <td>
                    {NOMBRE_TIPO[p.tipo]}
                    {p.tipo === 'porcentaje' && ` ${p.valor}%`}
                    {p.tipo === 'monto_fijo' && ` ${bs(p.valor)}`}
                    {p.min_compra > 0 && (
                      <span className="tabla__sub">desde {bs(p.min_compra)}</span>
                    )}
                  </td>
                  <td>{NOMBRE_ALCANCE[p.aplica_a] ?? p.aplica_a}</td>
                  <td className="cifra">{p.codigo_cupon ?? '—'}</td>
                  <td className="cifra tabla__num">
                    {numero(p.usos_actuales)}
                    {p.usos_max !== null && ` / ${numero(p.usos_max)}`}
                  </td>
                  <td>
                    <span className={clases('marca', p.vigente ? 'marca--bien' : 'marca--neutra')}>
                      {p.vigente ? 'rige hoy' : 'fuera de fecha'}
                    </span>
                    <span className="tabla__sub cifra">
                      {fecha(p.fecha_inicio)} → {fecha(p.fecha_fin)}
                    </span>
                  </td>
                  <td className="tabla__acciones">
                    {puedeGestionar && p.activo && (
                      <button
                        type="button"
                        className="boton boton--fantasma"
                        onClick={() => void desactivar(p)}
                      >
                        Desactivar
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

      {/* --- Nueva promocion --- */}
      {alta && (
        <div className="modal" role="dialog" aria-modal="true">
          <form className="modal__caja modal__caja--ancha" onSubmit={(e) => void crear(e)}>
            <header className="modal__cabecera">
              <h2 className="modal__titulo">Nueva promoción</h2>
              <button type="button" className="modal__cerrar" onClick={() => setAlta(false)}>
                ✕
              </button>
            </header>

            <div className="modal__campos">
              <label className="campo">
                <span className="campo__etiqueta">Nombre</span>
                <input
                  className="campo__control"
                  required
                  placeholder="15% en vestidos"
                  value={forma.nombre}
                  onChange={(e) => setForma((f) => ({ ...f, nombre: e.target.value }))}
                />
                {errores.nombre && <span className="campo__error">{errores.nombre}</span>}
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Tipo</span>
                <select
                  className="campo__control"
                  value={forma.tipo}
                  onChange={(e) =>
                    setForma((f) => ({ ...f, tipo: e.target.value as TipoPromocion }))
                  }
                >
                  {TIPOS_PROMOCION.map((t) => (
                    <option key={t} value={t}>
                      {NOMBRE_TIPO[t]}
                    </option>
                  ))}
                </select>
              </label>

              {pideValor && (
                <label className="campo">
                  <span className="campo__etiqueta">
                    {forma.tipo === 'porcentaje' ? 'Porcentaje' : 'Monto'}
                  </span>
                  <input
                    className="campo__control"
                    type="number"
                    min="1"
                    max={forma.tipo === 'porcentaje' ? 100 : undefined}
                    value={forma.valor}
                    onChange={(e) => setForma((f) => ({ ...f, valor: e.target.value }))}
                  />
                  {errores.valor && <span className="campo__error">{errores.valor}</span>}
                </label>
              )}

              <label className="campo">
                <span className="campo__etiqueta">Se aplica a</span>
                <select
                  className="campo__control"
                  value={forma.aplica_a}
                  onChange={(e) =>
                    setForma((f) => ({ ...f, aplica_a: e.target.value, aplica_id: '' }))
                  }
                >
                  {ALCANCES.map((a) => (
                    <option key={a} value={a}>
                      {NOMBRE_ALCANCE[a]}
                    </option>
                  ))}
                </select>
              </label>

              {forma.aplica_a === 'categoria' && (
                <label className="campo">
                  <span className="campo__etiqueta">Categoría</span>
                  <select
                    className="campo__control"
                    required
                    value={forma.aplica_id}
                    onChange={(e) => setForma((f) => ({ ...f, aplica_id: e.target.value }))}
                  >
                    <option value="">Elegir</option>
                    {planas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                  {errores.aplica_id && <span className="campo__error">{errores.aplica_id}</span>}
                </label>
              )}

              {(forma.aplica_a === 'producto' || forma.aplica_a === 'variante') && (
                <label className="campo">
                  <span className="campo__etiqueta">
                    Id de {forma.aplica_a === 'producto' ? 'producto' : 'variante'}
                  </span>
                  <input
                    className="campo__control"
                    type="number"
                    required
                    value={forma.aplica_id}
                    onChange={(e) => setForma((f) => ({ ...f, aplica_id: e.target.value }))}
                  />
                  {errores.aplica_id && <span className="campo__error">{errores.aplica_id}</span>}
                </label>
              )}

              <label className="campo">
                <span className="campo__etiqueta">Cupón</span>
                <input
                  className="campo__control"
                  placeholder="BIENVENIDA"
                  value={forma.codigo_cupon}
                  onChange={(e) =>
                    setForma((f) => ({ ...f, codigo_cupon: e.target.value.toUpperCase() }))
                  }
                />
                <span className="campo__ayuda">
                  Con cupón, solo se aplica si la clienta lo escribe. Sin cupón, se aplica sola.
                </span>
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Compra mínima</span>
                <input
                  className="campo__control"
                  type="number"
                  min="0"
                  value={forma.min_compra}
                  onChange={(e) => setForma((f) => ({ ...f, min_compra: e.target.value }))}
                />
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Campaña</span>
                <select
                  className="campo__control"
                  value={forma.campania_id}
                  onChange={(e) => setForma((f) => ({ ...f, campania_id: e.target.value }))}
                >
                  <option value="">Sin campaña</option>
                  {campanias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Usos máximos</span>
                <input
                  className="campo__control"
                  type="number"
                  min="1"
                  placeholder="Sin límite"
                  value={forma.usos_max}
                  onChange={(e) => setForma((f) => ({ ...f, usos_max: e.target.value }))}
                />
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Desde</span>
                <input
                  className="campo__control"
                  type="date"
                  required
                  value={forma.fecha_inicio}
                  onChange={(e) => setForma((f) => ({ ...f, fecha_inicio: e.target.value }))}
                />
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Hasta</span>
                <input
                  className="campo__control"
                  type="date"
                  required
                  value={forma.fecha_fin}
                  onChange={(e) => setForma((f) => ({ ...f, fecha_fin: e.target.value }))}
                />
                {errores.fecha_fin && <span className="campo__error">{errores.fecha_fin}</span>}
              </label>
            </div>

            <p className="modal__contexto">
              Si varias promociones alcanzan al mismo carrito, el servidor aplica una sola: la que
              más le conviene a la clienta.
            </p>

            {errorAlta && <p className="aviso aviso--error">{errorAlta}</p>}

            <div className="modal__acciones">
              <button type="button" className="boton boton--fantasma" onClick={() => setAlta(false)}>
                Cancelar
              </button>
              <button type="submit" className="boton boton--vino" disabled={trabajando}>
                {trabajando ? 'Creando' : 'Crear promoción'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- Nueva campania --- */}
      {altaCampania && (
        <div className="modal" role="dialog" aria-modal="true">
          <form className="modal__caja" onSubmit={(e) => void crearCampania(e)}>
            <h2 className="modal__titulo">Nueva campaña</h2>
            <p className="modal__bajada">
              Es el paraguas; las promociones concretas cuelgan de ella.
            </p>

            <div className="modal__campos">
              <label className="campo">
                <span className="campo__etiqueta">Nombre</span>
                <input
                  className="campo__control"
                  required
                  placeholder="Liquidación de invierno"
                  value={campania.nombre}
                  onChange={(e) => setCampania((c) => ({ ...c, nombre: e.target.value }))}
                />
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Desde</span>
                <input
                  className="campo__control"
                  type="date"
                  required
                  value={campania.fecha_inicio}
                  onChange={(e) => setCampania((c) => ({ ...c, fecha_inicio: e.target.value }))}
                />
              </label>

              <label className="campo">
                <span className="campo__etiqueta">Hasta</span>
                <input
                  className="campo__control"
                  type="date"
                  required
                  value={campania.fecha_fin}
                  onChange={(e) => setCampania((c) => ({ ...c, fecha_fin: e.target.value }))}
                />
              </label>
            </div>

            <div className="modal__acciones">
              <button
                type="button"
                className="boton boton--fantasma"
                onClick={() => setAltaCampania(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="boton boton--vino">
                Crear campaña
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
