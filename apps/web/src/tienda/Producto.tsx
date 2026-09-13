import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { ProductoFicha, RespuestaRecomendacion, VarianteResumen } from '@aurora/contratos'
import { esRecomendacion } from '@aurora/contratos'
import { api } from '../api/cliente'
import { useSesion } from '../sesion/SesionContexto'
import { useCarrito } from './CarritoContexto'
import { hayCamara, RealidadAumentada } from './RealidadAumentada'
import { Estrellas, ResenasProducto } from './Resenas'
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
  const { perfil, esPersonal } = useSesion()
  const [params] = useSearchParams()

  const [ficha, setFicha] = useState<ProductoFicha | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [colorElegido, setColorElegido] = useState<string | null>(null)
  const [varianteElegida, setVarianteElegida] = useState<number | null>(null)
  const [guia, setGuia] = useState<FilaGuia[] | null>(null)
  const [guiaAbierta, setGuiaAbierta] = useState(false)
  const [agregando, setAgregando] = useState(false)
  const [agregado, setAgregado] = useState(false)
  const [categoriaId, setCategoriaId] = useState<number | null>(null)
  const [talla, setTalla] = useState<RespuestaRecomendacion | null>(null)
  const [buscandoTalla, setBuscandoTalla] = useState(false)
  const [probandoRa, setProbandoRa] = useState(false)

  // Se resuelve una vez y no en cada pintado: `hayCamara` mira `navigator`, que
  // no cambia, y consultarlo en el render haria parpadear el boton.
  const [conCamara] = useState(hayCamara)

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
    // Salvo cuando se entra con ?ra=1: ahi se toma la primera con stock, o el
    // enlace directo no abriria nada. Si despues llega una recomendacion, gana
    // ella —la elige el efecto de mas abajo—.
    if (params.get('ra') === '1') {
      setVarianteElegida(
        ficha?.variantes.find((v) => v.color === colorElegido && v.activo && v.disponible > 0)?.id ??
          null
      )
    } else {
      setVarianteElegida(null)
    }
    setAgregado(false)
  }, [colorElegido, ficha, params, perfil])

  /**
   * El id de la categoria, que la ficha no trae.
   *
   * Lo necesitan las dos cosas que dependen de la categoria —la guia de tallas y
   * la recomendacion—, asi que se resuelve una vez y se guarda, en vez de pedir
   * el listado entero de categorias cada vez que alguien abre la guia.
   */
  const resolverCategoria = useCallback(async (): Promise<number | null> => {
    if (categoriaId !== null) return categoriaId
    if (!ficha) return null

    try {
      const categorias = await api.obtener<
        { id: number; nombre: string; hijas?: { id: number; nombre: string }[] }[]
      >('/api/catalogo/categorias')
      const plano = categorias.flatMap((c) => [c, ...(c.hijas ?? [])])
      const encontrada = plano.find((c) => c.nombre === ficha.categoria)
      if (!encontrada) return null
      setCategoriaId(encontrada.id)
      return encontrada.id
    } catch {
      return null
    }
  }, [categoriaId, ficha])

  const verGuia = async () => {
    setGuiaAbierta((v) => !v)
    if (guia === null && ficha) {
      const id = await resolverCategoria()
      if (id === null) {
        setGuia([])
        return
      }
      setGuia(await api.obtener<FilaGuia[]>(`/api/catalogo/guia-tallas/${id}`).catch(() => []))
    }
  }

  /**
   * Que talla le corresponde a quien esta mirando.
   *
   * Se pide junto con el producto para que la respuesta diga tambien si esa
   * talla esta disponible aca: recomendar una M que no hay manda a la clienta a
   * buscar algo que no va a encontrar.
   */
  const verMiTalla = useCallback(async () => {
    if (!ficha) return
    setBuscandoTalla(true)
    try {
      const id = await resolverCategoria()
      if (id === null) {
        setTalla({ talla_id: null, falta: 'guia', motivo: 'Esta categoria no tiene guia de tallas' })
        return
      }
      setTalla(
        await api.obtener<RespuestaRecomendacion>(
          `/api/probador/mi-talla/${id}?producto_id=${ficha.id}`
        )
      )
    } catch (e) {
      setTalla({ talla_id: null, falta: 'medidas', motivo: (e as Error).message })
    } finally {
      setBuscandoTalla(false)
    }
  }, [ficha, resolverCategoria])

  /**
   * Con la sesion iniciada, la talla se busca sola.
   *
   * Hacerla depender de un boton era pedirle un clic a la persona a la que el
   * probador esta pensado para ayudar: si ya tenemos sus medidas, no hay nada
   * que preguntarle. El boton queda para quien entra sin sesion, que es a quien
   * si hay algo que pedirle.
   */
  useEffect(() => {
    if (ficha && perfil && !esPersonal) void verMiTalla()
  }, [ficha, perfil, esPersonal, verMiTalla])

  /**
   * `?ra=1` abre el probador de camara directamente.
   *
   * Sirve para compartir un enlace de "probate esto" que cae donde tiene que
   * caer, y de paso hace que la pantalla se pueda capturar sin manos.
   *
   * Espera a que haya una talla elegida: sin variante no hay prenda concreta
   * que dibujar, y la ficha elige sola en cuanto llega la recomendacion.
   */
  useEffect(() => {
    if (params.get('ra') === '1' && varianteElegida !== null && conCamara) setProbandoRa(true)
  }, [params, varianteElegida, conCamara])

  /**
   * Al recibir la talla, se selecciona sola si esta disponible.
   *
   * Es el punto del probador: que la clienta no tenga que traducir "sos M" a
   * buscar el boton M entre seis. Si no hay stock no se toca nada, para que el
   * aviso de que no hay quede a la vista.
   */
  useEffect(() => {
    if (talla && esRecomendacion(talla) && talla.hay_stock && talla.variante_id !== null) {
      setVarianteElegida(talla.variante_id)
    }
  }, [talla])

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

          {/* La calificacion, junto al nombre y no al pie: es lo que decide si
              alguien sigue leyendo la ficha o vuelve al catalogo. */}
          {Number(ficha.calificacion) > 0 && (
            <p className="ficha__calificacion">
              <Estrellas valor={Math.round(Number(ficha.calificacion))} />
              <span className="cifra">{Number(ficha.calificacion).toFixed(1)}</span>
            </p>
          )}

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
                <div className="ficha__paso-acciones">
                  {/* El personal de tienda no tiene medidas cargadas: ofrecerle
                      el probador seria prometerle algo que le responde 403. */}
                  {!esPersonal && talla === null && (
                    <button
                      type="button"
                      className="ficha__guia-enlace ficha__guia-enlace--destacado"
                      onClick={() => void verMiTalla()}
                      disabled={buscandoTalla}
                    >
                      {buscandoTalla ? 'Calculando' : '¿Cuál es mi talla?'}
                    </button>
                  )}
                  <button type="button" className="ficha__guia-enlace" onClick={() => void verGuia()}>
                    {guiaAbierta ? 'Ocultar guia' : 'Guia de tallas'}
                  </button>
                </div>
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

              {talla !== null &&
                (esRecomendacion(talla) ? (
                  <div className="mi-talla">
                    <p className="mi-talla__titulo">
                      Tu talla es <strong>{talla.talla}</strong>
                      <span className="mi-talla__ajuste">{talla.ajuste}</span>
                    </p>
                    <p className="mi-talla__motivo">{talla.motivo}.</p>

                    {talla.hay_stock === false && (
                      <p className="mi-talla__sin-stock">
                        No nos queda {talla.talla} de esta prenda
                        {talla.alternativa && ` — probá con ${talla.alternativa.talla}`}.
                      </p>
                    )}

                    {talla.alternativa && talla.hay_stock !== false && (
                      <p className="mi-talla__motivo">
                        Si la preferís{' '}
                        {talla.alternativa.ajuste === 'holgado' ? 'más suelta' : 'más al cuerpo'}, andá
                        por la {talla.alternativa.talla}.
                      </p>
                    )}

                    {/* La confianza se muestra siempre, no solo cuando es alta:
                        un 45% dicho a tiempo evita una devolucion. */}
                    <p className="mi-talla__confianza">
                      Confianza {Math.round(talla.confianza * 100)}%
                      {talla.confianza < 0.7 && (
                        <>
                          {' · '}
                          <Link to="/mis-medidas">afiná tus medidas</Link>
                        </>
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="mi-talla mi-talla--falta">
                    <p className="mi-talla__motivo">{talla.motivo}.</p>
                    {talla.falta === 'medidas' && (
                      <Link to={perfil ? '/mis-medidas' : '/entrar'} className="boton boton--linea">
                        {perfil ? 'Cargar mis medidas' : 'Entrar para usar el probador'}
                      </Link>
                    )}
                  </div>
                ))}

              {variante && conCamara && (
                <button
                  type="button"
                  className="boton boton--linea ficha__ra"
                  onClick={() => setProbandoRa(true)}
                >
                  Probar en cámara
                </button>
              )}

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

          {probandoRa && varianteElegida !== null && (
            <RealidadAumentada varianteId={varianteElegida} onCerrar={() => setProbandoRa(false)} />
          )}

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

      <ResenasProducto productoId={ficha.id} />
    </div>
  )
}
