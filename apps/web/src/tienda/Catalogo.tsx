import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { MetaPagina, ProductoResumen } from '@aurora/contratos'
import { ORDENES_CATALOGO } from '@aurora/contratos'
import { api, consulta } from '../api/cliente'
import { TarjetaProducto } from './TarjetaProducto'
import { EsqueletoGrilla, ErrorCarga, Vacio } from '../componentes/Estados'
import { clases, numero } from '../util/formato'

interface Maestro {
  id: number
  nombre: string
  slug?: string
  hex?: string
  hijas?: Maestro[]
}

const TEXTO_ORDEN: Record<string, string> = {
  relevancia: 'Relevancia',
  nombre: 'Nombre',
  precio_asc: 'Precio: menor a mayor',
  precio_desc: 'Precio: mayor a menor',
  novedades: 'Novedades',
  mas_vendidos: 'Mas vendidos',
}

/**
 * Catalogo con los filtros combinables que pide el enunciado.
 *
 * Los filtros viven en la URL y no en el estado del componente. Asi una busqueda
 * se puede compartir por WhatsApp, el boton de atras funciona como se espera, y
 * recargar no borra lo que la clienta habia filtrado.
 */
export function Catalogo() {
  const [params, setParams] = useSearchParams()
  const [productos, setProductos] = useState<ProductoResumen[] | null>(null)
  const [meta, setMeta] = useState<MetaPagina | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [categorias, setCategorias] = useState<Maestro[]>([])
  const [tallas, setTallas] = useState<Maestro[]>([])
  const [colores, setColores] = useState<Maestro[]>([])
  const [textoBusqueda, setTextoBusqueda] = useState(params.get('q') ?? '')
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)

  const filtros = useMemo(() => Object.fromEntries(params.entries()), [params])

  const cambiarFiltro = useCallback(
    (clave: string, valor: string | null) => {
      const nuevos = new URLSearchParams(params)
      if (valor === null || valor === '') nuevos.delete(clave)
      else nuevos.set(clave, valor)
      // Cambiar un filtro siempre devuelve a la primera pagina: quedarse en la
      // pagina 4 de un resultado que ahora tiene 2 muestra una pantalla vacia.
      nuevos.delete('pagina')
      setParams(nuevos)
    },
    [params, setParams]
  )

  const cargar = useCallback(async () => {
    setError(null)
    setProductos(null)
    try {
      const respuesta = await api.pagina<ProductoResumen>(
        `/api/catalogo/productos${consulta({ ...filtros, por_pagina: 24 })}`
      )
      setProductos(respuesta.datos)
      setMeta(respuesta.meta)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [filtros])

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
      setCategorias(c)
      setTallas(t)
      setColores(k)
    })()
  }, [])

  const hayFiltros = [...params.keys()].some((k) => k !== 'orden' && k !== 'pagina')

  return (
    <div className="contenedor catalogo">
      <header className="catalogo__cabecera surge">
        <h1 className="catalogo__titulo">Catalogo</h1>

        <form
          className="buscador"
          onSubmit={(e) => {
            e.preventDefault()
            cambiarFiltro('q', textoBusqueda.trim() || null)
          }}
        >
          <input
            type="search"
            className="buscador__campo"
            placeholder="Buscar por nombre, material o descripcion"
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
            aria-label="Buscar en el catalogo"
          />
          <button type="submit" className="buscador__accion">
            Buscar
          </button>
        </form>
      </header>

      <div className="catalogo__cuerpo">
        <button
          type="button"
          className="boton boton--linea catalogo__abrir-filtros"
          onClick={() => setFiltrosAbiertos((v) => !v)}
        >
          {filtrosAbiertos ? 'Ocultar filtros' : 'Filtros'}
        </button>

        <aside className={clases('filtros', filtrosAbiertos && 'filtros--abiertos')}>
          <div className="filtros__grupo">
            <p className="rotulo">Categoria</p>
            <ul className="filtros__lista">
              {categorias.map((raiz) => (
                <li key={raiz.id}>
                  <button
                    type="button"
                    className={clases(
                      'filtros__opcion',
                      filtros.categoria_id === String(raiz.id) && 'filtros__opcion--activa'
                    )}
                    onClick={() =>
                      cambiarFiltro(
                        'categoria_id',
                        filtros.categoria_id === String(raiz.id) ? null : String(raiz.id)
                      )
                    }
                  >
                    {raiz.nombre}
                  </button>
                  {raiz.hijas && raiz.hijas.length > 0 && (
                    <ul className="filtros__sublista">
                      {raiz.hijas.map((h) => (
                        <li key={h.id}>
                          <button
                            type="button"
                            className={clases(
                              'filtros__opcion filtros__opcion--hija',
                              filtros.categoria_id === String(h.id) && 'filtros__opcion--activa'
                            )}
                            onClick={() =>
                              cambiarFiltro(
                                'categoria_id',
                                filtros.categoria_id === String(h.id) ? null : String(h.id)
                              )
                            }
                          >
                            {h.nombre}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="filtros__grupo">
            <p className="rotulo">Talla</p>
            <div className="filtros__fichas">
              {tallas.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={clases(
                    'ficha-talla',
                    filtros.talla_id === String(t.id) && 'ficha-talla--activa'
                  )}
                  onClick={() =>
                    cambiarFiltro('talla_id', filtros.talla_id === String(t.id) ? null : String(t.id))
                  }
                >
                  {t.nombre}
                </button>
              ))}
            </div>
          </div>

          <div className="filtros__grupo">
            <p className="rotulo">Color</p>
            <div className="filtros__fichas">
              {colores.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={clases(
                    'ficha-color',
                    filtros.color_id === String(c.id) && 'ficha-color--activa'
                  )}
                  style={{ '--muestra': c.hex } as React.CSSProperties}
                  title={c.nombre}
                  aria-label={c.nombre}
                  onClick={() =>
                    cambiarFiltro('color_id', filtros.color_id === String(c.id) ? null : String(c.id))
                  }
                />
              ))}
            </div>
          </div>

          <div className="filtros__grupo">
            <p className="rotulo">Precio</p>
            <div className="filtros__rango">
              <input
                type="number"
                className="campo__control"
                placeholder="Desde"
                min={0}
                defaultValue={filtros.precio_min ?? ''}
                onBlur={(e) => cambiarFiltro('precio_min', e.target.value || null)}
                aria-label="Precio minimo"
              />
              <span>—</span>
              <input
                type="number"
                className="campo__control"
                placeholder="Hasta"
                min={0}
                defaultValue={filtros.precio_max ?? ''}
                onBlur={(e) => cambiarFiltro('precio_max', e.target.value || null)}
                aria-label="Precio maximo"
              />
            </div>
          </div>

          {hayFiltros && (
            <button
              type="button"
              className="boton boton--fantasma"
              onClick={() => {
                setTextoBusqueda('')
                setParams(filtros.orden ? { orden: filtros.orden } : {})
              }}
            >
              Limpiar filtros
            </button>
          )}
        </aside>

        <section className="catalogo__resultados">
          <div className="catalogo__barra">
            <p className="catalogo__conteo rotulo">
              {meta ? `${numero(meta.total)} prenda${meta.total === 1 ? '' : 's'}` : ' '}
            </p>
            <label className="catalogo__orden">
              <span className="solo-lectores">Ordenar por</span>
              <select
                className="campo__control"
                value={filtros.orden ?? 'relevancia'}
                onChange={(e) => cambiarFiltro('orden', e.target.value)}
              >
                {ORDENES_CATALOGO.map((o) => (
                  <option key={o} value={o}>
                    {TEXTO_ORDEN[o]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <ErrorCarga mensaje={error} reintentar={() => void cargar()} />
          ) : productos === null ? (
            <EsqueletoGrilla cuantos={9} />
          ) : productos.length === 0 ? (
            <Vacio
              titulo="Nada por aqui"
              detalle="Probá con otras palabras o quitá alguno de los filtros."
            />
          ) : (
            <>
              <div className="grilla-productos">
                {productos.map((p) => (
                  <TarjetaProducto key={p.id} producto={p} />
                ))}
              </div>

              {meta && meta.paginas > 1 && (
                <nav className="paginador" aria-label="Paginas de resultados">
                  <button
                    type="button"
                    className="boton boton--linea"
                    disabled={meta.pagina <= 1}
                    onClick={() => cambiarFiltro('pagina', String(meta.pagina - 1))}
                  >
                    Anterior
                  </button>
                  <span className="cifra paginador__posicion">
                    {meta.pagina} / {meta.paginas}
                  </span>
                  <button
                    type="button"
                    className="boton boton--linea"
                    disabled={meta.pagina >= meta.paginas}
                    onClick={() => cambiarFiltro('pagina', String(meta.pagina + 1))}
                  >
                    Siguiente
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
