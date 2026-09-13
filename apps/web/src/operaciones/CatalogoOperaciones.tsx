import { useCallback, useEffect, useState } from 'react'
import type { MetaPagina, ProductoResumen } from '@aurora/contratos'
import { PERMISOS, TIPOS_PRENDA } from '@aurora/contratos'
import { api, consulta, ErrorApi } from '../api/cliente'
import { useSesion } from '../sesion/SesionContexto'
import { Cargando, ErrorCarga, Vacio } from '../componentes/Estados'
import { bs, clases, numero } from '../util/formato'
import { TIPO_PRENDA } from '../util/estados'

interface Maestro {
  id: number
  nombre: string
  hijas?: Maestro[]
}

interface LineaVariante {
  talla_id: string
  color_id: string
  sku: string
  precio_menor: string
  precio_mayor: string
}

const varianteVacia = (): LineaVariante => ({
  talla_id: '',
  color_id: '',
  sku: '',
  precio_menor: '',
  precio_mayor: '',
})

/**
 * Catalogo desde operaciones.
 *
 * El alta exige al menos una variante porque un producto sin talla ni color no
 * se puede vender: no tiene stock ni SKU contra que cobrar. La pantalla lo
 * refleja arrancando siempre con una fila de variante.
 */
export function CatalogoOperaciones() {
  const { puede } = useSesion()

  const [productos, setProductos] = useState<ProductoResumen[] | null>(null)
  const [meta, setMeta] = useState<MetaPagina | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)

  const [categorias, setCategorias] = useState<Maestro[]>([])
  const [tallas, setTallas] = useState<Maestro[]>([])
  const [colores, setColores] = useState<Maestro[]>([])

  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState({
    categoria_id: '',
    codigo: '',
    nombre: '',
    descripcion: '',
    material: '',
    tipo_prenda: 'superior',
  })
  const [variantes, setVariantes] = useState<LineaVariante[]>([varianteVacia()])
  const [guardando, setGuardando] = useState(false)
  const [errorAlta, setErrorAlta] = useState<string | null>(null)
  const [erroresAlta, setErroresAlta] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const r = await api.pagina<ProductoResumen>(
        `/api/catalogo/productos${consulta({
          q: busqueda.trim() || undefined,
          incluir_inactivos: 'true',
          pagina,
          por_pagina: 25,
        })}`
      )
      setProductos(r.datos)
      setMeta(r.meta)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [busqueda, pagina])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    void (async () => {
      const [c, t, k] = await Promise.all([
        api.obtener<Maestro[]>('/api/catalogo/categorias').catch(() => []),
        api.obtener<Maestro[]>('/api/catalogo/tallas').catch(() => []),
        api.obtener<Maestro[]>('/api/catalogo/colores').catch(() => []),
      ])
      setCategorias(c.flatMap((x) => [x, ...(x.hijas ?? [])]))
      setTallas(t)
      setColores(k)
    })()
  }, [])

  const crear = async () => {
    setErrorAlta(null)
    setErroresAlta({})
    setGuardando(true)
    try {
      const { mensaje } = await api.enviarConMensaje('/api/catalogo/productos', {
        categoria_id: Number(form.categoria_id),
        codigo: form.codigo,
        nombre: form.nombre,
        descripcion: form.descripcion || undefined,
        material: form.material || undefined,
        tipo_prenda: form.tipo_prenda,
        variantes: variantes.map((v) => ({
          talla_id: Number(v.talla_id),
          color_id: Number(v.color_id),
          sku: v.sku,
          precio_menor: Number(v.precio_menor),
          precio_mayor: Number(v.precio_mayor),
        })),
      })
      setAviso(mensaje ?? 'Producto creado')
      setCreando(false)
      setForm({
        categoria_id: '',
        codigo: '',
        nombre: '',
        descripcion: '',
        material: '',
        tipo_prenda: 'superior',
      })
      setVariantes([varianteVacia()])
      await cargar()
    } catch (e) {
      const fallo = e as ErrorApi
      setErrorAlta(fallo.message)
      if (fallo.errores) setErroresAlta(fallo.errores)
    } finally {
      setGuardando(false)
    }
  }

  const cambiarVariante = (n: number, campo: keyof LineaVariante, valor: string) => {
    setVariantes((actual) => actual.map((v, i) => (i === n ? { ...v, [campo]: valor } : v)))
  }

  return (
    <div className="pantalla">
      <header className="pantalla__cabecera">
        <div>
          <h1 className="pantalla__titulo">Catalogo</h1>
          {meta && <p className="rotulo">{numero(meta.total)} productos</p>}
        </div>

        <div className="pantalla__controles">
          <input
            className="campo__control"
            placeholder="Buscar"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value)
              setPagina(1)
            }}
          />
          {puede(PERMISOS.PRODUCTO_CREAR) && (
            <button type="button" className="boton boton--vino" onClick={() => setCreando(true)}>
              Nuevo producto
            </button>
          )}
        </div>
      </header>

      {aviso && <p className="aviso aviso--bien">{aviso}</p>}

      {error ? (
        <ErrorCarga mensaje={error} reintentar={() => void cargar()} />
      ) : productos === null ? (
        <Cargando />
      ) : productos.length === 0 ? (
        <Vacio titulo="Sin productos" detalle="Todavia no hay nada cargado en el catalogo." />
      ) : (
        <div className="tabla-envoltorio">
          <table className="tabla tabla--oscura">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Codigo</th>
                <th>Categoria</th>
                <th className="tabla__num">Disponible</th>
                <th className="tabla__num">Precio</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.nombre}
                    <span className="tabla__sub">{TIPO_PRENDA[p.tipo_prenda]}</span>
                  </td>
                  <td className="cifra">{p.codigo}</td>
                  <td>{p.categoria}</td>
                  <td className="cifra tabla__num">{numero(p.disponible)}</td>
                  <td className="cifra tabla__num">{bs(p.precio_desde)}</td>
                  <td>
                    <span className={clases('marca', p.activo ? 'marca--bien' : 'marca--neutra')}>
                      {p.activo ? 'Activo' : 'De baja'}
                    </span>
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

      {creando && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal__caja modal__caja--ancha">
            <header className="modal__cabecera">
              <h2 className="modal__titulo">Nuevo producto</h2>
              <button type="button" className="modal__cerrar" onClick={() => setCreando(false)}>
                ×
              </button>
            </header>

            <div className="formulario">
              <div className="formulario__par">
                <label className={clases('campo', erroresAlta.codigo && 'campo--malo')}>
                  <span className="campo__etiqueta">Codigo</span>
                  <input
                    className="campo__control cifra"
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
                  />
                  {erroresAlta.codigo && <span className="campo__error">{erroresAlta.codigo}</span>}
                </label>

                <label className={clases('campo', erroresAlta.categoria_id && 'campo--malo')}>
                  <span className="campo__etiqueta">Categoria</span>
                  <select
                    className="campo__control"
                    value={form.categoria_id}
                    onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
                  >
                    <option value="">Elegir</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className={clases('campo', erroresAlta.nombre && 'campo--malo')}>
                <span className="campo__etiqueta">Nombre</span>
                <input
                  className="campo__control"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                />
              </label>

              <div className="formulario__par">
                <label className="campo">
                  <span className="campo__etiqueta">Tipo de prenda</span>
                  <select
                    className="campo__control"
                    value={form.tipo_prenda}
                    onChange={(e) => setForm({ ...form, tipo_prenda: e.target.value })}
                  >
                    {TIPOS_PRENDA.map((t) => (
                      <option key={t} value={t}>
                        {TIPO_PRENDA[t]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="campo">
                  <span className="campo__etiqueta">Material</span>
                  <input
                    className="campo__control"
                    value={form.material}
                    onChange={(e) => setForm({ ...form, material: e.target.value })}
                  />
                </label>
              </div>

              <label className="campo">
                <span className="campo__etiqueta">Descripcion</span>
                <textarea
                  className="campo__control"
                  rows={2}
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                />
              </label>

              <div className="variantes">
                <div className="variantes__cabecera">
                  <p className="rotulo">Variantes (talla y color)</p>
                  <button
                    type="button"
                    className="boton boton--fantasma"
                    onClick={() => setVariantes((v) => [...v, varianteVacia()])}
                  >
                    Agregar variante
                  </button>
                </div>

                {erroresAlta.sku && <p className="campo__error">{erroresAlta.sku}</p>}
                {erroresAlta.variantes && <p className="campo__error">{erroresAlta.variantes}</p>}

                {variantes.map((v, n) => (
                  <div key={n} className="variante-fila">
                    <select
                      className="campo__control"
                      value={v.talla_id}
                      onChange={(e) => cambiarVariante(n, 'talla_id', e.target.value)}
                      aria-label="Talla"
                    >
                      <option value="">Talla</option>
                      {tallas.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre}
                        </option>
                      ))}
                    </select>

                    <select
                      className="campo__control"
                      value={v.color_id}
                      onChange={(e) => cambiarVariante(n, 'color_id', e.target.value)}
                      aria-label="Color"
                    >
                      <option value="">Color</option>
                      {colores.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>

                    <input
                      className="campo__control cifra"
                      placeholder="SKU"
                      value={v.sku}
                      onChange={(e) => cambiarVariante(n, 'sku', e.target.value.toUpperCase())}
                      aria-label="SKU"
                    />

                    <input
                      type="number"
                      className="campo__control cifra"
                      placeholder="Menudeo"
                      value={v.precio_menor}
                      onChange={(e) => cambiarVariante(n, 'precio_menor', e.target.value)}
                      aria-label="Precio de menudeo"
                    />

                    <input
                      type="number"
                      className="campo__control cifra"
                      placeholder="Mayoreo"
                      value={v.precio_mayor}
                      onChange={(e) => cambiarVariante(n, 'precio_mayor', e.target.value)}
                      aria-label="Precio de mayoreo"
                    />

                    {variantes.length > 1 && (
                      <button
                        type="button"
                        className="variante-fila__quitar"
                        onClick={() => setVariantes((actual) => actual.filter((_, i) => i !== n))}
                        aria-label="Quitar variante"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {errorAlta && <p className="aviso aviso--error">{errorAlta}</p>}

              <div className="modal__acciones">
                <button type="button" className="boton boton--linea" onClick={() => setCreando(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="boton boton--vino"
                  disabled={guardando}
                  onClick={() => void crear()}
                >
                  {guardando ? 'Creando...' : 'Crear producto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
