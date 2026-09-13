import { useEffect, useState } from 'react'
import type {
  AjusteReal,
  CompraResenable,
  Resena,
  ResumenResenas,
} from '@aurora/contratos'
import { AJUSTES_REALES, NOMBRE_AJUSTE_REAL } from '@aurora/contratos'
import { api, ErrorApi } from '../api/cliente'
import { clases, fecha, numero } from '../util/formato'

/**
 * Estrellas.
 *
 * Con `alCambiar` son botones y se puede calificar; sin el, son un dibujo. Es
 * el mismo componente porque son la misma cosa vista de los dos lados, y tener
 * dos habria garantizado que en algun momento se vieran distinto.
 */
export function Estrellas({
  valor,
  alCambiar,
  tamanio = 'normal',
}: {
  valor: number
  alCambiar?: (n: number) => void
  tamanio?: 'normal' | 'grande'
}) {
  const [encima, setEncima] = useState(0)
  const mostrado = encima || valor

  return (
    <span
      className={clases('estrellas', tamanio === 'grande' && 'estrellas--grande')}
      role={alCambiar ? 'radiogroup' : 'img'}
      aria-label={alCambiar ? 'Calificación' : `${valor} de 5 estrellas`}
      onMouseLeave={() => setEncima(0)}
    >
      {[1, 2, 3, 4, 5].map((n) =>
        alCambiar ? (
          <button
            key={n}
            type="button"
            className={clases('estrella', n <= mostrado && 'estrella--llena')}
            onClick={() => alCambiar(n)}
            onMouseEnter={() => setEncima(n)}
            aria-label={`${n} estrella${n === 1 ? '' : 's'}`}
            aria-pressed={n === valor}
          >
            ★
          </button>
        ) : (
          <span key={n} className={clases('estrella', n <= mostrado && 'estrella--llena')}>
            ★
          </span>
        )
      )}
    </span>
  )
}

/**
 * Lo que dicen de una prenda, en la ficha.
 *
 * Arriba el reparto por estrellas y no solo el promedio: cuatro estrellas de
 * "casi todas cinco con una de uno" no es lo mismo que cuatro de "todas
 * cuatro", y quien esta por comprar necesita esa diferencia.
 *
 * Y al lado, lo que dicen del talle, que es la pregunta que mas se hace sobre
 * ropa por internet y para la que un promedio no sirve de nada.
 */
export function ResenasProducto({ productoId }: { productoId: number }) {
  const [resumen, setResumen] = useState<ResumenResenas | null>(null)
  const [lista, setLista] = useState<Resena[]>([])

  useEffect(() => {
    void (async () => {
      const [r, l] = await Promise.all([
        api.obtener<ResumenResenas>(`/api/resenas/resumen/${productoId}`).catch(() => null),
        api
          .pagina<Resena>(`/api/resenas?producto_id=${productoId}&por_pagina=20`)
          .then((p) => p.datos)
          .catch(() => []),
      ])
      setResumen(r)
      setLista(l)
    })()
  }, [productoId])

  if (!resumen || resumen.total === 0) {
    return (
      <section className="resenas">
        <h2 className="resenas__titulo">Opiniones</h2>
        <p className="resenas__vacio">
          Todavía nadie opinó de esta prenda. Las opiniones son de quienes la compraron y la
          recibieron.
        </p>
      </section>
    )
  }

  const totalAjuste = AJUSTES_REALES.reduce((s, a) => s + resumen.ajuste[a], 0)

  return (
    <section className="resenas">
      <h2 className="resenas__titulo">Opiniones</h2>

      <div className="resenas__resumen">
        <div className="resenas__promedio">
          <p className="cifra resenas__nota">{resumen.promedio.toFixed(1)}</p>
          <Estrellas valor={Math.round(resumen.promedio)} />
          <p className="rotulo">
            {numero(resumen.total)} opinión{resumen.total === 1 ? '' : 'es'}
          </p>
        </div>

        <ul className="resenas__reparto">
          {[5, 4, 3, 2, 1].map((n) => {
            const cuantas = resumen.reparto[String(n)] ?? 0
            return (
              <li key={n}>
                <span className="resenas__reparto-nota">{n}★</span>
                <span className="resenas__barra">
                  <span
                    className="resenas__barra-relleno"
                    style={{ width: `${resumen.total === 0 ? 0 : (cuantas / resumen.total) * 100}%` }}
                  />
                </span>
                <span className="cifra resenas__reparto-cuantas">{cuantas}</span>
              </li>
            )
          })}
        </ul>

        {totalAjuste > 0 && (
          <div className="resenas__talle">
            <p className="rotulo">Sobre el talle</p>
            {AJUSTES_REALES.map((a) => (
              <p key={a} className="resenas__talle-fila">
                <span>{NOMBRE_AJUSTE_REAL[a]}</span>
                <span className="cifra">{Math.round((resumen.ajuste[a] / totalAjuste) * 100)}%</span>
              </p>
            ))}
          </div>
        )}
      </div>

      <ul className="resenas__lista">
        {lista.map((r) => (
          <li key={r.id} className="resena">
            <div className="resena__cabecera">
              <Estrellas valor={r.calificacion} />
              <span className="resena__autora">{r.autora}</span>
              {r.talla_comprada && <span className="marca">Talla {r.talla_comprada}</span>}
              {r.ajuste_real && (
                <span className="marca marca--laton">{NOMBRE_AJUSTE_REAL[r.ajuste_real]}</span>
              )}
              <span className="resena__fecha">{fecha(r.creado_en)}</span>
            </div>
            {r.comentario && <p className="resena__texto">{r.comentario}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Opinar sobre lo que se compro, desde el detalle del pedido.
 *
 * Las compras sobre las que se puede opinar las decide el servidor, no esta
 * pantalla: la regla —entregado, tuyo, sin resenia previa— es la misma que
 * valida el alta, y tenerla escrita dos veces garantiza que en algun momento
 * dejen de coincidir.
 */
export function OpinarDelPedido({ pedidoId }: { pedidoId: string }) {
  const [compras, setCompras] = useState<CompraResenable[] | null>(null)
  const [abierta, setAbierta] = useState<number | null>(null)

  const [calificacion, setCalificacion] = useState(0)
  const [comentario, setComentario] = useState('')
  const [ajuste, setAjuste] = useState<AjusteReal | ''>('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = () => {
    void api
      .obtener<CompraResenable[]>('/api/resenas/pendientes')
      .then((todas) => setCompras(todas.filter((c) => c.pedido_id === pedidoId)))
      .catch(() => setCompras([]))
  }

  useEffect(cargar, [pedidoId])

  if (compras === null || compras.length === 0) return null

  const enviar = async (compra: CompraResenable) => {
    if (calificacion === 0) {
      setAviso('Elegí cuántas estrellas le ponés')
      return
    }

    setEnviando(true)
    setAviso(null)

    try {
      const { mensaje } = await api.enviarConMensaje<Resena>('/api/resenas', {
        producto_id: compra.producto_id,
        pedido_id: compra.pedido_id,
        calificacion,
        comentario: comentario.trim() || undefined,
        ajuste_real: ajuste || undefined,
      })

      setAviso(mensaje ?? 'Gracias por opinar')
      setAbierta(null)
      setCalificacion(0)
      setComentario('')
      setAjuste('')
      cargar()
    } catch (e) {
      setAviso((e as ErrorApi).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="opinar">
      <h2 className="opinar__titulo">¿Qué te pareció?</h2>
      <p className="opinar__bajada">
        Tu opinión ayuda a que la próxima persona elija bien la talla.
      </p>

      {aviso && <p className="aviso">{aviso}</p>}

      <ul className="opinar__lista">
        {compras.map((compra) => (
          <li key={compra.producto_id} className="opinar__item">
            <div className="opinar__prenda">
              <div>
                <p className="opinar__nombre">{compra.producto}</p>
                {compra.talla_comprada && (
                  <p className="rotulo">Talla {compra.talla_comprada}</p>
                )}
              </div>
              {abierta !== compra.producto_id && (
                <button
                  type="button"
                  className="boton boton--linea"
                  onClick={() => {
                    setAbierta(compra.producto_id)
                    setAviso(null)
                  }}
                >
                  Opinar
                </button>
              )}
            </div>

            {abierta === compra.producto_id && (
              <form
                className="opinar__formulario"
                onSubmit={(e) => {
                  e.preventDefault()
                  void enviar(compra)
                }}
              >
                <Estrellas valor={calificacion} alCambiar={setCalificacion} tamanio="grande" />

                <fieldset className="opinar__talle">
                  <legend className="campo__etiqueta">¿Cómo te quedó?</legend>
                  <div className="opinar__opciones">
                    {AJUSTES_REALES.map((a) => (
                      <button
                        key={a}
                        type="button"
                        className={clases('opinar__opcion', ajuste === a && 'opinar__opcion--activa')}
                        onClick={() => setAjuste(ajuste === a ? '' : a)}
                        aria-pressed={ajuste === a}
                      >
                        {NOMBRE_AJUSTE_REAL[a]}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <label className="campo">
                  <span className="campo__etiqueta">Contanos (opcional)</span>
                  <textarea
                    className="campo__control"
                    rows={3}
                    maxLength={500}
                    placeholder="Qué te gustó, qué no, cómo es la tela…"
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                  />
                </label>

                {/* Se avisa antes de escribir, no despues de enviar: enterarse
                    de que el texto espera revision recien al mandarlo se siente
                    como que algo salio mal. */}
                {comentario.trim() !== '' && (
                  <p className="opinar__moderacion">
                    Los comentarios se publican después de una revisión. La calificación se publica
                    enseguida.
                  </p>
                )}

                <div className="opinar__acciones">
                  <button type="submit" className="boton boton--vino" disabled={enviando}>
                    {enviando ? 'Enviando' : 'Enviar mi opinión'}
                  </button>
                  <button
                    type="button"
                    className="boton boton--fantasma"
                    onClick={() => setAbierta(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
