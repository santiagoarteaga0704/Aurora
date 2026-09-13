import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnclajePrenda, PrendaRa } from '@aurora/contratos'
import { api } from '../api/cliente'
import { clases } from '../util/formato'

/**
 * Si el navegador tiene camara utilizable.
 *
 * Se comprueba antes de ofrecer el boton. Un "Probar en RA" que al apretarlo
 * dice "tu navegador no puede" es peor que no ofrecerlo: promete algo y despues
 * culpa a quien lo apreto.
 *
 * `getUserMedia` solo existe en contextos seguros —https o localhost—, asi que
 * esta comprobacion tambien cubre el caso de entrar por IP de red local, donde
 * la camara sencillamente no esta disponible.
 */
export const hayCamara = (): boolean =>
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function'

type Estado = 'pidiendo' | 'viendo' | 'capturada' | 'sin-permiso' | 'sin-camara' | 'error'

interface Props {
  varianteId: number
  onCerrar: () => void
}

/**
 * Probador de realidad aumentada.
 *
 * Superpone la prenda sobre el video de la camara. NO hay deteccion de pose: no
 * existe una API del navegador que la haga, y meter un modelo de vision por
 * computadora significaba un paquete grande servido desde un CDN ajeno, con la
 * aplicacion siendo una PWA que tiene que andar sin conexion.
 *
 * En vez de eso, la prenda se dibuja en la posicion que indica su anclaje y la
 * clienta se acomoda contra una guia, o la arrastra hasta que calce. Es menos
 * vistoso que un seguimiento automatico y es honesto: se ve como le queda el
 * color y el largo, que es lo que se quiere mirar.
 */
export function RealidadAumentada({ varianteId, onCerrar }: Props) {
  const [estado, setEstado] = useState<Estado>('pidiendo')
  const [prenda, setPrenda] = useState<PrendaRa | null>(null)
  const [detalle, setDetalle] = useState<string | null>(null)
  const [foto, setFoto] = useState<string | null>(null)

  // Ajuste manual: la prenda se arrastra y se escala hasta que calce.
  const [desplazamiento, setDesplazamiento] = useState({ x: 0, y: 0 })
  const [escala, setEscala] = useState(1)
  const arrastre = useRef<{ x: number; y: number } | null>(null)

  const video = useRef<HTMLVideoElement>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const flujo = useRef<MediaStream | null>(null)
  const desde = useRef<number>(0)

  // --- Camara ---------------------------------------------------------------

  useEffect(() => {
    if (!hayCamara()) {
      setEstado('sin-camara')
      return
    }

    let vivo = true

    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          // De frente, que es como uno se mira en un espejo.
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
          audio: false,
        })

        // Si el componente se cerro mientras se pedia el permiso, el flujo hay
        // que apagarlo igual: quedaria la camara encendida sin nadie mirando.
        if (!vivo) {
          s.getTracks().forEach((t) => t.stop())
          return
        }

        flujo.current = s
        if (video.current) video.current.srcObject = s
        desde.current = Date.now()
        setEstado('viendo')
      } catch (e) {
        const nombre = (e as Error).name
        setEstado(nombre === 'NotAllowedError' ? 'sin-permiso' : 'error')
        setDetalle((e as Error).message)
      }
    })()

    return () => {
      vivo = false
      flujo.current?.getTracks().forEach((t) => t.stop())
      flujo.current = null
    }
  }, [])

  useEffect(() => {
    void api
      .obtener<PrendaRa>(`/api/probador/prendas/${varianteId}`)
      .then(setPrenda)
      .catch(() => setPrenda(null))
  }, [varianteId])

  // --- Dibujo ---------------------------------------------------------------

  /**
   * La silueta de la prenda, en fracciones del encuadre.
   *
   * Cuando el producto tiene textura cargada se dibuja la textura; cuando no
   * —que es el caso de todo el catalogo hoy— se dibuja la forma en el color
   * real de la variante. No es una foto de la prenda y no se hace pasar por
   * una: el rotulo de abajo lo dice.
   */
  const trazar = useCallback(
    (ctx: CanvasRenderingContext2D, ancho: number, alto: number, a: AnclajePrenda) => {
      const cx = ancho / 2 + desplazamiento.x
      const arriba = a.hombros * alto + desplazamiento.y
      const abajo = a.bajo * alto + desplazamiento.y
      const cinturaY = arriba + (abajo - arriba) * a.cintura

      const mitadHombro = (a.ancho_hombros * ancho * escala) / 2
      const mitadBajo = (a.ancho_bajo * ancho * escala) / 2
      const mitadCintura = mitadHombro * (1 - a.entalle)

      ctx.beginPath()
      ctx.moveTo(cx - mitadHombro, arriba)
      ctx.quadraticCurveTo(cx - mitadHombro, cinturaY - 4, cx - mitadCintura, cinturaY)
      ctx.quadraticCurveTo(cx - mitadBajo, abajo - (abajo - cinturaY) * 0.4, cx - mitadBajo, abajo)
      ctx.lineTo(cx + mitadBajo, abajo)
      ctx.quadraticCurveTo(cx + mitadBajo, abajo - (abajo - cinturaY) * 0.4, cx + mitadCintura, cinturaY)
      ctx.quadraticCurveTo(cx + mitadHombro, cinturaY - 4, cx + mitadHombro, arriba)
      ctx.closePath()
    },
    [desplazamiento, escala]
  )

  useEffect(() => {
    if (estado !== 'viendo' || !prenda) return

    let cuadro = 0

    const pintar = () => {
      const v = video.current
      const c = lienzo.current
      if (v && c && v.videoWidth > 0) {
        if (c.width !== v.videoWidth) {
          c.width = v.videoWidth
          c.height = v.videoHeight
        }

        const ctx = c.getContext('2d')
        if (ctx) {
          // Espejado, como un espejo de probador: sin esto uno mueve la mano
          // derecha y la imagen mueve la izquierda, y es imposible acomodarse.
          ctx.save()
          ctx.translate(c.width, 0)
          ctx.scale(-1, 1)
          ctx.drawImage(v, 0, 0, c.width, c.height)
          ctx.restore()

          trazar(ctx, c.width, c.height, prenda.anclaje)

          ctx.globalAlpha = 0.82
          ctx.fillStyle = prenda.color_hex
          ctx.fill()

          ctx.globalAlpha = 1
          ctx.lineWidth = Math.max(2, c.width / 300)
          ctx.strokeStyle = 'rgba(255,255,255,0.75)'
          ctx.stroke()
        }
      }
      cuadro = requestAnimationFrame(pintar)
    }

    cuadro = requestAnimationFrame(pintar)
    return () => cancelAnimationFrame(cuadro)
  }, [estado, prenda, trazar])

  // --- Acciones -------------------------------------------------------------

  const capturar = () => {
    const c = lienzo.current
    if (!c) return

    setFoto(c.toDataURL('image/png'))
    setEstado('capturada')

    // La prueba se registra al capturar, no al abrir la camara: abrir y cerrar
    // enseguida no es probarse nada, y contarlo inflaria el reporte de
    // efectividad con pruebas que nadie hizo.
    void api
      .enviar('/api/probador/pruebas', {
        variante_id: varianteId,
        modo: 'ra_camara',
        duracion_seg: Math.round((Date.now() - desde.current) / 1000),
      })
      .catch(() => null)
  }

  const seguir = () => {
    setFoto(null)
    setEstado('viendo')
  }

  const tomarPunto = (e: React.PointerEvent) => {
    arrastre.current = { x: e.clientX - desplazamiento.x, y: e.clientY - desplazamiento.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const mover = (e: React.PointerEvent) => {
    if (!arrastre.current) return
    setDesplazamiento({ x: e.clientX - arrastre.current.x, y: e.clientY - arrastre.current.y })
  }

  const soltar = () => {
    arrastre.current = null
  }

  // --- Pantalla -------------------------------------------------------------

  const problema =
    estado === 'sin-permiso'
      ? {
          titulo: 'No nos diste permiso para usar la cámara',
          detalle:
            'El probador necesita ver la cámara para superponer la prenda. Nada de lo que se ve sale de tu teléfono: la imagen no se sube a ningún lado.',
        }
      : estado === 'sin-camara'
        ? {
            titulo: 'Este navegador no puede abrir la cámara',
            detalle:
              'La cámara solo funciona sobre una conexión segura (https). Probá desde el sitio publicado o desde tu teléfono.',
          }
        : estado === 'error'
          ? { titulo: 'No pudimos abrir la cámara', detalle: detalle ?? 'Intentá de nuevo.' }
          : null

  return (
    <div className="ra" role="dialog" aria-modal="true" aria-label="Probador de realidad aumentada">
      <div className="ra__barra">
        <p className="ra__titulo">
          {prenda ? `${prenda.producto} · ${prenda.color} · ${prenda.talla}` : 'Probador'}
        </p>
        <button type="button" className="ra__cerrar" onClick={onCerrar} aria-label="Cerrar">
          ✕
        </button>
      </div>

      <div className="ra__escena">
        {problema ? (
          <div className="ra__problema">
            <p className="ra__problema-titulo">{problema.titulo}</p>
            <p className="ra__problema-detalle">{problema.detalle}</p>
            <button type="button" className="boton boton--linea" onClick={onCerrar}>
              Volver a la prenda
            </button>
          </div>
        ) : (
          <>
            {/* El video alimenta al lienzo pero no se muestra: lo que se ve es
                el lienzo, que es donde se dibuja la prenda encima. */}
            <video ref={video} autoPlay playsInline muted className="ra__video" />

            {foto ? (
              <img src={foto} alt="Tu captura" className="ra__lienzo" />
            ) : (
              <canvas
                ref={lienzo}
                className="ra__lienzo"
                onPointerDown={tomarPunto}
                onPointerMove={mover}
                onPointerUp={soltar}
                onPointerCancel={soltar}
              />
            )}

            {estado === 'pidiendo' && <p className="ra__esperando">Pidiendo permiso de cámara…</p>}

            {estado === 'viendo' && (
              <p className="ra__guia">Acomodate de frente y arrastrá la prenda hasta que calce</p>
            )}
          </>
        )}
      </div>

      {!problema && (
        <div className="ra__controles">
          {estado === 'capturada' ? (
            <>
              <button type="button" className="boton boton--linea" onClick={seguir}>
                Repetir
              </button>
              <a className="boton boton--vino" href={foto ?? '#'} download="aurora-probador.png">
                Guardar la foto
              </a>
            </>
          ) : (
            <>
              <label className="ra__escala">
                <span className="rotulo">Talle</span>
                <input
                  type="range"
                  min="0.6"
                  max="1.6"
                  step="0.02"
                  value={escala}
                  onChange={(e) => setEscala(Number(e.target.value))}
                />
              </label>
              <button
                type="button"
                className={clases('ra__disparo', estado !== 'viendo' && 'ra__disparo--inactivo')}
                onClick={capturar}
                disabled={estado !== 'viendo'}
                aria-label="Sacar la foto"
              />
            </>
          )}
        </div>
      )}

      {prenda && !prenda.url_textura && !problema && (
        <p className="ra__aclaracion">
          La prenda se dibuja con su forma y su color reales. No es una foto de la prenda.
        </p>
      )}
    </div>
  )
}
