import type { ReactNode } from 'react'

/**
 * Estados de una pantalla: cargando, vacio y error.
 *
 * Estan juntos a proposito. Son los tres momentos que se olvidan cuando cada
 * pantalla los resuelve por su cuenta, y los tres en los que el usuario decide
 * si la aplicacion le parece seria.
 */

export function Cargando({ texto = 'Cargando' }: { texto?: string }) {
  return (
    <div className="estado" role="status" aria-live="polite">
      <div className="estado__pulso" />
      <p className="rotulo">{texto}</p>
    </div>
  )
}

/** Esqueleto con la forma de lo que va a llegar; evita el salto del layout. */
export function EsqueletoGrilla({ cuantos = 8 }: { cuantos?: number }) {
  return (
    <div className="grilla-productos" aria-hidden>
      {Array.from({ length: cuantos }, (_, n) => (
        <div key={n} className="tarjeta-esqueleto">
          <div className="esqueleto tarjeta-esqueleto__imagen" />
          <div className="esqueleto tarjeta-esqueleto__linea" />
          <div className="esqueleto tarjeta-esqueleto__linea tarjeta-esqueleto__linea--corta" />
        </div>
      ))}
    </div>
  )
}

export function Vacio({
  titulo,
  detalle,
  accion,
}: {
  titulo: string
  detalle?: string
  accion?: ReactNode
}) {
  return (
    <div className="estado estado--vacio">
      <p className="display estado__titulo">{titulo}</p>
      {detalle && <p className="estado__detalle">{detalle}</p>}
      {accion}
    </div>
  )
}

export function ErrorCarga({ mensaje, reintentar }: { mensaje: string; reintentar?: () => void }) {
  return (
    <div className="estado estado--vacio">
      <p className="display estado__titulo">No se pudo cargar</p>
      <p className="estado__detalle">{mensaje}</p>
      {reintentar && (
        <button type="button" className="boton boton--linea" onClick={reintentar}>
          Reintentar
        </button>
      )}
    </div>
  )
}
