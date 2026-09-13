import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Notificacion } from '@aurora/contratos'
import { api } from '../api/cliente'
import { useSesion } from '../sesion/SesionContexto'
import { clases, fecha } from '../util/formato'

/**
 * Cada cuanto se vuelve a preguntar cuantos avisos hay sin leer.
 *
 * Dos minutos. Estos avisos no son urgentes —que el pedido paso a "listo" o que
 * una prenda bajo del minimo aguantan dos minutos— y consultar cada diez
 * segundos seria una peticion por usuario por cada diez segundos a cambio de
 * nada. Lo que si hace falta es que se actualice al volver a la pestania, que es
 * cuando la persona esta mirando.
 */
const CADA = 120_000

const ICONO: Record<string, string> = {
  pedido: '📦',
  stock: '📉',
  promocion: '✦',
  devolucion: '↩',
  sistema: '•',
}

/**
 * Campanita de avisos.
 *
 * Se usa igual en la tienda y en operaciones: son los mismos avisos, la misma
 * cuenta y el mismo gesto. Tener dos habria garantizado que en algun momento
 * una mostrara un numero distinto de la otra.
 */
export function Campanita() {
  const { perfil } = useSesion()
  const navegar = useNavigate()

  const [sinLeer, setSinLeer] = useState(0)
  const [abierta, setAbierta] = useState(false)
  const [lista, setLista] = useState<Notificacion[] | null>(null)
  const caja = useRef<HTMLDivElement>(null)

  // --- Cuenta ---------------------------------------------------------------

  useEffect(() => {
    if (!perfil) {
      setSinLeer(0)
      return
    }

    let vivo = true

    const contar = () => {
      void api
        .obtener<{ sin_leer: number }>('/api/notificaciones/sin-leer')
        .then((r) => vivo && setSinLeer(r.sin_leer))
        // Sin conexion no se muestra un cero: se deja la ultima cuenta conocida.
        // Un cero inventado dice "no tenes nada", que no es lo que se sabe.
        .catch(() => null)
    }

    contar()
    const reloj = setInterval(contar, CADA)

    // Al volver a la pestania se consulta enseguida: es cuando la persona esta
    // mirando, y esperar hasta dos minutos ahi si se nota.
    const alVolver = () => document.visibilityState === 'visible' && contar()
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      vivo = false
      clearInterval(reloj)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [perfil])

  // --- Cerrar al tocar afuera -----------------------------------------------

  useEffect(() => {
    if (!abierta) return

    const afuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierta(false)

    document.addEventListener('mousedown', afuera)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', afuera)
      document.removeEventListener('keydown', escape)
    }
  }, [abierta])

  // --- Abrir por enlace -----------------------------------------------------

  useEffect(() => {
    // `#avisos` abre el panel al entrar. Sirve para enlazar los avisos desde
    // afuera —un correo, un recordatorio— sin inventarle una pantalla propia a
    // algo que ya se ve entero en el panel.
    if (!perfil || window.location.hash !== '#avisos') return
    setAbierta(true)
    setLista(null)
    void api
      .pagina<Notificacion>('/api/notificaciones?por_pagina=15')
      .then((p) => setLista(p.datos))
      .catch(() => setLista([]))
  }, [perfil])

  if (!perfil) return null

  const abrir = () => {
    const siguiente = !abierta
    setAbierta(siguiente)

    // La lista se pide al abrir y no antes: en reposo alcanza con el entero de
    // /sin-leer, que es una sola cuenta contra un indice.
    if (siguiente) {
      setLista(null)
      void api
        .pagina<Notificacion>('/api/notificaciones?por_pagina=15')
        .then((p) => setLista(p.datos))
        .catch(() => setLista([]))
    }
  }

  const abrirAviso = async (n: Notificacion) => {
    setAbierta(false)

    if (!n.leida) {
      // Se marca leida de entrada y se corrige si el servidor dice otra cosa:
      // el punto tiene que apagarse al tocar, no medio segundo despues.
      setSinLeer((c) => Math.max(0, c - 1))
      setLista((l) => l?.map((x) => (x.id === n.id ? { ...x, leida: true } : x)) ?? null)

      await api
        .enviar<{ sin_leer: number }>(`/api/notificaciones/${n.id}/leida`)
        .then((r) => setSinLeer(r.sin_leer))
        .catch(() => null)
    }

    if (n.url) navegar(n.url)
  }

  const marcarTodas = async () => {
    setSinLeer(0)
    setLista((l) => l?.map((x) => ({ ...x, leida: true })) ?? null)
    await api.enviar('/api/notificaciones/leidas').catch(() => null)
  }

  return (
    <div className="campanita" ref={caja}>
      <button
        type="button"
        className={clases('campanita__boton', sinLeer > 0 && 'campanita__boton--con-avisos')}
        onClick={abrir}
        aria-label={sinLeer > 0 ? `Avisos, ${sinLeer} sin leer` : 'Avisos'}
        aria-expanded={abierta}
      >
        <svg viewBox="0 0 24 24" aria-hidden className="campanita__icono">
          <path
            d="M12 3a5 5 0 0 0-5 5v3.5L5.5 14v1h13v-1L17 11.5V8a5 5 0 0 0-5-5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M10 17.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>

        {/* Mas de nueve se muestra como "9+": el numero exacto no cambia lo que
            la persona va a hacer, y tres digitos no entran en el punto. */}
        {sinLeer > 0 && <span className="campanita__punto">{sinLeer > 9 ? '9+' : sinLeer}</span>}
      </button>

      {abierta && (
        <div className="campanita__panel" role="dialog" aria-label="Avisos">
          <div className="campanita__cabecera">
            <p className="rotulo">Avisos</p>
            {sinLeer > 0 && (
              <button type="button" className="campanita__marcar" onClick={() => void marcarTodas()}>
                Marcar todo leído
              </button>
            )}
          </div>

          {lista === null ? (
            <p className="campanita__estado">Buscando…</p>
          ) : lista.length === 0 ? (
            <p className="campanita__estado">No tenés avisos todavía.</p>
          ) : (
            <ul className="campanita__lista">
              {lista.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={clases('aviso-fila', !n.leida && 'aviso-fila--nuevo')}
                    onClick={() => void abrirAviso(n)}
                  >
                    <span className="aviso-fila__icono" aria-hidden>
                      {ICONO[n.tipo] ?? '•'}
                    </span>
                    <span className="aviso-fila__cuerpo">
                      <span className="aviso-fila__titulo">{n.titulo}</span>
                      <span className="aviso-fila__mensaje">{n.mensaje}</span>
                      <span className="aviso-fila__fecha">{fecha(n.creado_en)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
