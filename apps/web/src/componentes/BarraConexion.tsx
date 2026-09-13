import { useConexion } from '../offline/ConexionContexto'
import { hace } from '../util/formato'

/**
 * Estado de conexion, visible en todas las pantallas.
 *
 * Perder la red no es un error que se avisa una vez y se olvida: mientras dure,
 * el vendedor tiene que saber que esta operando sin servidor y cuantas ventas
 * tiene sin mandar. Por eso la barra se queda, cuenta la cola y el color del
 * cromo entero cambia a ocre (ver `[data-conexion]` en base.css).
 *
 * Cuando todo esta en linea y no hay nada pendiente, no se muestra nada: un
 * cartel permanente de "todo bien" deja de leerse a los dos dias.
 */
export function BarraConexion() {
  const { enLinea, pendientes, sincronizando, ultimaSync, sincronizarYa } = useConexion()

  if (enLinea && pendientes === 0) return null

  if (!enLinea) {
    return (
      <div className="barra-conexion barra-conexion--corte" role="status">
        <span className="barra-conexion__punto" aria-hidden />
        <strong>Sin conexion</strong>
        <span className="barra-conexion__detalle">
          {pendientes > 0
            ? `Se siguen registrando ventas. ${pendientes} sin enviar.`
            : 'Se siguen registrando ventas; se enviaran al volver la senial.'}
        </span>
      </div>
    )
  }

  return (
    <div className="barra-conexion barra-conexion--cola" role="status">
      <span className="barra-conexion__punto" aria-hidden />
      <strong>
        {sincronizando
          ? 'Enviando lo pendiente'
          : `${pendientes} operacion${pendientes === 1 ? '' : 'es'} sin enviar`}
      </strong>
      {ultimaSync && !sincronizando && (
        <span className="barra-conexion__detalle">Ultimo envio {hace(ultimaSync)}</span>
      )}
      <button
        type="button"
        className="barra-conexion__accion"
        onClick={() => void sincronizarYa()}
        disabled={sincronizando}
      >
        {sincronizando ? 'Enviando...' : 'Enviar ahora'}
      </button>
    </div>
  )
}
