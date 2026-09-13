import { useCallback, useEffect, useState } from 'react'
import type { Caja as CajaTipo } from '@aurora/contratos'
import { api, ErrorApi } from '../api/cliente'
import { useSesion } from '../sesion/SesionContexto'
import { Cargando } from '../componentes/Estados'
import { bs, clases, fechaCompleta } from '../util/formato'

/**
 * Caja del turno.
 *
 * Los cobros en efectivo del punto de venta entran solos como movimiento, asi
 * que el arqueo mide el dinero y no la memoria de quien cobra. Al cerrar se pide
 * lo contado FISICAMENTE y la pantalla muestra la diferencia antes de confirmar:
 * enterarse del faltante despues de cerrar no sirve de nada.
 */
export function Caja() {
  const { perfil } = useSesion()

  const [caja, setCaja] = useState<CajaTipo | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const [apertura, setApertura] = useState('0')
  const [movimiento, setMovimiento] = useState({ tipo: 'egreso', monto: '', concepto: '' })
  const [cerrando, setCerrando] = useState(false)
  const [contado, setContado] = useState('')

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setCaja(await api.obtener<CajaTipo | null>('/api/caja/mia'))
    } catch (e) {
      setError((e as Error).message)
      setCaja(null)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const ejecutar = async (accion: () => Promise<string | undefined>) => {
    setError(null)
    setTrabajando(true)
    try {
      const mensaje = await accion()
      if (mensaje) setAviso(mensaje)
      await cargar()
    } catch (e) {
      setError((e as ErrorApi).message)
    } finally {
      setTrabajando(false)
    }
  }

  if (caja === undefined) {
    return (
      <div className="pantalla">
        <Cargando texto="Buscando tu caja" />
      </div>
    )
  }

  /* --- Sin turno abierto --------------------------------------------------- */

  if (caja === null) {
    return (
      <div className="pantalla">
        <header className="pantalla__cabecera">
          <h1 className="pantalla__titulo">Caja</h1>
        </header>

        <div className="caja-abrir">
          <p className="rotulo">No tenes un turno abierto</p>
          <p className="caja-abrir__texto">
            Abri la caja con el monto con el que arrancas. Todo lo que cobres en efectivo va a
            sumarse solo, y al cerrar se compara contra lo que cuentes.
          </p>

          <label className="campo">
            <span className="campo__etiqueta">Monto de apertura</span>
            <input
              type="number"
              min={0}
              step="0.01"
              className="campo__control cifra"
              value={apertura}
              onChange={(e) => setApertura(e.target.value)}
            />
          </label>

          {error && <p className="aviso aviso--error">{error}</p>}

          <button
            type="button"
            className="boton boton--vino boton--grande"
            disabled={trabajando || !perfil?.sucursal_id}
            onClick={() =>
              void ejecutar(async () => {
                const { mensaje } = await api.enviarConMensaje<CajaTipo>('/api/caja/abrir', {
                  sucursal_id: perfil!.sucursal_id,
                  monto_apertura: Number(apertura),
                })
                return mensaje
              })
            }
          >
            Abrir caja
          </button>

          {!perfil?.sucursal_id && (
            <p className="aviso aviso--error">
              Tu usuario no tiene sucursal asignada, asi que no puede abrir caja.
            </p>
          )}
        </div>
      </div>
    )
  }

  /* --- Turno abierto ------------------------------------------------------- */

  const diferencia = contado === '' ? null : Number(contado) - caja.monto_esperado

  return (
    <div className="pantalla">
      <header className="pantalla__cabecera">
        <div>
          <h1 className="pantalla__titulo">Caja</h1>
          <p className="rotulo">
            {caja.sucursal} · abierta {fechaCompleta(caja.abierta_en)}
          </p>
        </div>
      </header>

      {aviso && <p className="aviso aviso--bien">{aviso}</p>}
      {error && <p className="aviso aviso--error">{error}</p>}

      <div className="caja__reja">
        <section className="caja__arqueo">
          <div className="arqueo">
            <div className="arqueo__linea">
              <span className="rotulo">Apertura</span>
              <span className="cifra">{bs(caja.monto_apertura)}</span>
            </div>
            <div className="arqueo__linea arqueo__linea--suma">
              <span className="rotulo">Ingresos</span>
              <span className="cifra">+{bs(caja.ingresos)}</span>
            </div>
            <div className="arqueo__linea arqueo__linea--resta">
              <span className="rotulo">Egresos</span>
              <span className="cifra">−{bs(caja.egresos)}</span>
            </div>
            <div className="arqueo__total">
              <span className="rotulo">Deberia haber</span>
              <span className="cifra arqueo__cifra">{bs(caja.monto_esperado)}</span>
            </div>
          </div>

          {!cerrando ? (
            <button
              type="button"
              className="boton boton--vino boton--ancho"
              onClick={() => {
                setCerrando(true)
                setContado('')
              }}
            >
              Cerrar turno
            </button>
          ) : (
            <div className="formulario">
              <label className="campo">
                <span className="campo__etiqueta">Cuanto contaste</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="campo__control cifra"
                  value={contado}
                  onChange={(e) => setContado(e.target.value)}
                  autoFocus
                />
              </label>

              {diferencia !== null && (
                <p
                  className={clases(
                    'aviso',
                    diferencia === 0 ? 'aviso--bien' : diferencia > 0 ? 'aviso--ojo' : 'aviso--error'
                  )}
                >
                  {diferencia === 0
                    ? 'La caja cuadra exacto.'
                    : diferencia > 0
                      ? `Sobran ${bs(diferencia)}.`
                      : `Faltan ${bs(Math.abs(diferencia))}.`}
                </p>
              )}

              <div className="modal__acciones">
                <button
                  type="button"
                  className="boton boton--linea"
                  onClick={() => setCerrando(false)}
                >
                  Volver
                </button>
                <button
                  type="button"
                  className="boton boton--vino"
                  disabled={trabajando || contado === ''}
                  onClick={() =>
                    void ejecutar(async () => {
                      const { mensaje } = await api.enviarConMensaje<CajaTipo>(
                        `/api/caja/${caja.id}/cerrar`,
                        { monto_contado: Number(contado) }
                      )
                      setCerrando(false)
                      return mensaje
                    })
                  }
                >
                  Confirmar cierre
                </button>
              </div>
            </div>
          )}

          <div className="caja__movimiento">
            <p className="rotulo">Registrar movimiento</p>
            <div className="caja__movimiento-fila">
              <select
                className="campo__control"
                value={movimiento.tipo}
                onChange={(e) => setMovimiento({ ...movimiento, tipo: e.target.value })}
              >
                <option value="egreso">Egreso</option>
                <option value="ingreso">Ingreso</option>
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                className="campo__control cifra"
                placeholder="Monto"
                value={movimiento.monto}
                onChange={(e) => setMovimiento({ ...movimiento, monto: e.target.value })}
              />
            </div>
            <input
              className="campo__control"
              placeholder="Concepto"
              value={movimiento.concepto}
              onChange={(e) => setMovimiento({ ...movimiento, concepto: e.target.value })}
            />
            <button
              type="button"
              className="boton boton--linea boton--ancho"
              disabled={
                trabajando || movimiento.monto === '' || movimiento.concepto.trim().length < 3
              }
              onClick={() =>
                void ejecutar(async () => {
                  const { mensaje } = await api.enviarConMensaje<CajaTipo>(
                    `/api/caja/${caja.id}/movimientos`,
                    {
                      tipo: movimiento.tipo,
                      monto: Number(movimiento.monto),
                      concepto: movimiento.concepto,
                    }
                  )
                  setMovimiento({ tipo: 'egreso', monto: '', concepto: '' })
                  return mensaje
                })
              }
            >
              Registrar
            </button>
          </div>
        </section>

        <section className="caja__movimientos">
          <p className="rotulo">Movimientos del turno</p>

          {caja.movimientos.length === 0 ? (
            <p className="pos__vacio">Todavia no hubo movimientos.</p>
          ) : (
            <table className="tabla tabla--oscura tabla--compacta">
              <tbody>
                {caja.movimientos.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.concepto}
                      {m.pago_id && <span className="tabla__sub">venta cobrada</span>}
                    </td>
                    <td className="cifra tabla__sub">{fechaCompleta(m.creado_en)}</td>
                    <td
                      className={clases(
                        'cifra tabla__num',
                        m.tipo === 'ingreso' ? 'monto--suma' : 'monto--resta'
                      )}
                    >
                      {m.tipo === 'ingreso' ? '+' : '−'}
                      {bs(m.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  )
}
