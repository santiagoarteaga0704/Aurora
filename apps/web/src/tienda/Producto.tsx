import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ProductoFicha, VarianteResumen } from '@aurora/contratos'
import { api } from '../api/cliente'
import { useCarrito } from './CarritoContexto'
import { Cargando, ErrorCarga } from '../componentes/Estados'
import { bs, clases, numero } from '../util/formato'
import { TEMPORADA, TIPO_PRENDA } from '../util/estados'

interface FilaGuia {
  talla_id: number
  talla: string
  busto_min: number
  busto_max: number
  cintura_min: number
  cintura_max: number
  cadera_min: number
  cadera_max: number
}

/**
 * Ficha de producto.
 *
 * La eleccion es en dos pasos, color y despues talla, porque asi esta colgada la
 * ropa en la tienda: primero se elige la prenda que gusta y despues si hay del
 * talle. Mostrar las 12 combinaciones juntas obliga a la clienta a cruzar la
 * tabla mentalmente.
 */
export function Producto() {
  const { slug = '' } = useParams()
  const { agregar } = useCarrito()

  const [ficha, setFicha] = useState<ProductoFicha | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [colorElegido, setColorElegido] = useState<string | null>(null)
  const [varianteElegida, setVarianteElegida] = useState<number | null>(null)
  const [guia, setGuia] = useState<FilaGuia[] | null>(null)
  const [guiaAbierta, setGuiaAbierta] = useState(false)
  const [agregando, setAgregando] = useState(false)
  const [agregado, setAgregado] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const datos = await api.obtener<ProductoFicha>(`/api/catalogo/productos/${slug}`)
      setFicha(datos)
      const primerDisponible = datos.variantes.find((v) => v.activo && v.disponible > 0)
      setColorElegido((primerDisponible ?? datos.variantes[0])?.color ?? null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [slug])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const colores = useMemo(() => {
    if (!ficha) return []
    const vistos = new Map<string, string>()
    for (const v of ficha.variantes) {
      if (!vistos.has(v.color)) vistos.set(v.color, v.color_hex)
    }
    return [...vistos.entries()].map(([nombre, hex]) => ({ nombre, hex }))
  }, [ficha])

  const tallasDelColor = useMemo(
    () => ficha?.variantes.filter((v) => v.color === colorElegido) ?? [],
    [ficha, colorElegido]
  )

  const variante: VarianteResumen | undefined = useMemo(
    () => tallasDelColor.find((v) => v.id === varianteElegida),
    [tallasDelColor, varianteElegida]
  )

  // Al cambiar de color, la talla elegida deja de tener sentido.
  useEffect(() => {
    setVarianteElegida(null)
    setAgregado(false)
  }, [colorElegido])

  const verGuia = async () => {
    setGuiaAbierta((v) => !v)
    if (guia === null && ficha) {
      try {
        // La guia cuelga de la categoria; el id no viene en la ficha, asi que se
        // resuelve por el slug de la categoria via el listado de categorias.
        const categorias = await api.obtener<{ id: number; nombre: string; hijas?: { id: number; nombre: string }[] }[]>(
          '/api/catalogo/categorias'
        )
        const plano = categorias.flatMap((c) => [c, ...(c.hijas ?? [])])
        const encontrada = plano.find((c) => c.nombre === ficha.categoria)
        if (encontrada) {
          setGuia(await api.obtener<FilaGuia[]>(`/api/catalogo/guia-tallas/${encontrada.id}`))
        } else {
          setGuia([])
        }
      } catch {
        setGuia([])
      }
    }
  }

  if (error) return <div className="contenedor seccion"><ErrorCarga mensaje={error} reintentar={() => void cargar()} /></div>
  if (!ficha) return <div className="contenedor seccion"><Cargando texto="Cargando la prenda" /></div>

  const escalas = variante ? ficha.escalas[variante.id] : undefined

  return (
    <div className="contenedor ficha surge">
      <nav className="migas">
        <Link to="/catalogo">Catalogo</Link>
        <span aria-hidden>/</span>
        <span>{ficha.categoria}</span>
      </nav>

      <div className="ficha__reja">
        <div className="ficha__visual">
          {ficha.imagenes.length > 0 ? (
            <img src={ficha.imagenes[0].url} alt={ficha.imagenes[0].alt ?? ficha.nombre} />
          ) : (
            <span className="ficha__inicial display" aria-hidden>
              {ficha.nombre.charAt(0)}
            </span>
          )}
        </div>

        <div className="ficha__datos">
          <p className="rotulo">{ficha.marca ?? ficha.categoria}</p>
          <h1 className="ficha__nombre">{ficha.nombre}</h1>

          <p className="ficha__precio cifra">
            {variante ? bs(variante.precio) : bs(ficha.precio_desde)}
          </p>

          {ficha.descripcion && <p className="ficha__descripcion">{ficha.descripcion}</p>}

          <div className="ficha__eleccion">
            <div className="ficha__paso">
              <p className="rotulo">
                Color{colorElegido && <span className="ficha__elegido">{colorElegido}</span>}
              </p>
              <div className="ficha__colores">
                {colores.map((c) => (
                  <button
                    key={c.nombre}
                    type="button"
                    className={clases('ficha-color', colorElegido === c.nombre && 'ficha-color--activa')}
                    style={{ '--muestra': c.hex } as React.CSSProperties}
                    onClick={() => setColorElegido(c.nombre)}
                    title={c.nombre}
                    aria-label={c.nombre}
                    aria-pressed={colorElegido === c.nombre}
                  />
                ))}
              </div>
            </div>

            <div className="ficha__paso">
              <div className="ficha__paso-cabecera">
                <p className="rotulo">Talla</p>
                <button type="button" className="ficha__guia-enlace" onClick={() => void verGuia()}>
                  {guiaAbierta ? 'Ocultar guia' : 'Guia de tallas'}
                </button>
              </div>

              <div className="ficha__tallas">
                {tallasDelColor.map((v) => {
                  const sinStock = v.disponible === 0 || !v.activo
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className={clases(
                        'ficha-talla',
                        varianteElegida === v.id && 'ficha-talla--activa',
                        sinStock && 'ficha-talla--agotada'
                      )}
                      disabled={sinStock}
                      onClick={() => {
                        setVarianteElegida(v.id)
                        setAgregado(false)
                      }}
                      title={sinStock ? 'Sin stock' : `${v.disponible} disponibles`}
                    >
                      {v.talla}
                    </button>
                  )
                })}
              </div>

              {variante && (
                <p className="ficha__stock">
                  {variante.disponible > 5
                    ? 'Disponible'
                    : variante.disponible > 0
                      ? `Quedan ${numero(variante.disponible)}`
                      : 'Sin stock'}
                </p>
              )}
            </div>
          </div>

          {guiaAbierta && (
            <div className="guia-tallas">
              {guia === null ? (
                <Cargando texto="Cargando la guia" />
              ) : guia.length === 0 ? (
                <p className="aviso">No hay guia de tallas cargada para esta categoria.</p>
              ) : (
                <table className="tabla tabla--compacta">
                  <thead>
                    <tr>
                      <th>Talla</th>
                      <th>Busto</th>
                      <th>Cintura</th>
                      <th>Cadera</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guia.map((f) => (
                      <tr key={f.talla_id}>
                        <td className="cifra">{f.talla}</td>
                        <td className="cifra">{f.busto_min}–{f.busto_max} cm</td>
                        <td className="cifra">{f.cintura_min}–{f.cintura_max} cm</td>
                        <td className="cifra">{f.cadera_min}–{f.cadera_max} cm</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {escalas && escalas.length > 0 && (
            <div className="escalas">
              <p className="rotulo">Precio por volumen</p>
              <ul>
                {escalas.map((e) => (
                  <li key={e.cantidad_min}>
                    <span>Desde {e.cantidad_min} unidades</span>
                    <span className="cifra">{bs(e.precio_unitario)} c/u</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="ficha__acciones">
            <button
              type="button"
              className="boton boton--vino boton--grande boton--ancho"
              disabled={!variante || variante.disponible === 0 || agregando}
              onClick={async () => {
                if (!variante) return
                setAgregando(true)
                try {
                  await agregar(variante.id, 1)
                  setAgregado(true)
                } finally {
                  setAgregando(false)
                }
              }}
            >
              {agregando
                ? 'Agregando...'
                : !colorElegido
                  ? 'Elegi un color'
                  : !variante
                    ? 'Elegi tu talla'
                    : variante.disponible === 0
                      ? 'Sin stock'
                      : 'Agregar a la bolsa'}
            </button>

            {agregado && (
              <p className="aviso aviso--bien">
                Agregado. <Link to="/carrito">Ver la bolsa</Link>
              </p>
            )}
          </div>

          <dl className="ficha__detalles">
            <div>
              <dt className="rotulo">Codigo</dt>
              <dd className="cifra">{ficha.codigo}</dd>
            </div>
            {variante && (
              <div>
                <dt className="rotulo">SKU</dt>
                <dd className="cifra">{variante.sku}</dd>
              </div>
            )}
            <div>
              <dt className="rotulo">Tipo</dt>
              <dd>{TIPO_PRENDA[ficha.tipo_prenda] ?? ficha.tipo_prenda}</dd>
            </div>
            <div>
              <dt className="rotulo">Temporada</dt>
              <dd>{TEMPORADA[ficha.temporada] ?? ficha.temporada}</dd>
            </div>
            {ficha.material && (
              <div>
                <dt className="rotulo">Material</dt>
                <dd>{ficha.material}</dd>
              </div>
            )}
            {ficha.cuidados && (
              <div>
                <dt className="rotulo">Cuidados</dt>
                <dd>{ficha.cuidados}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  )
}
