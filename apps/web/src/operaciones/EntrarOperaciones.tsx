import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ErrorApi } from '../api/cliente'
import { useSesion } from '../sesion/SesionContexto'
import { useConexion } from '../offline/ConexionContexto'
import { clases } from '../util/formato'

/**
 * Ingreso del personal.
 *
 * Pantalla oscura, como el resto de operaciones, para que el salto entre el
 * login y el mostrador no encandile a nadie en una tienda a media luz.
 */
export function EntrarOperaciones() {
  const { entrar, perfil, esPersonal } = useSesion()
  const { enLinea } = useConexion()
  const navegar = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)

  if (perfil && esPersonal) return <Navigate to="/op" replace />

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setErrores({})
    setEnviando(true)
    try {
      await entrar(email, password)
      navegar('/op', { replace: true })
    } catch (err) {
      const fallo = err as ErrorApi
      setError(fallo.message)
      if (fallo.errores) setErrores(fallo.errores)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="acceso-op">
      <div className="acceso-op__caja">
        <p className="marca-aurora marca-aurora--op">AURORA</p>
        <p className="rotulo acceso-op__modo">Operaciones</p>

        {!enLinea && (
          <p className="aviso aviso--ojo">
            No hay conexion con el servidor. Para abrir sesion hace falta red; una vez dentro, el
            punto de venta sigue funcionando sin ella.
          </p>
        )}

        <form className="formulario" onSubmit={enviar}>
          <label className={clases('campo', errores.email && 'campo--malo')}>
            <span className="campo__etiqueta">Correo</span>
            <input
              type="email"
              className="campo__control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
            {errores.email && <span className="campo__error">{errores.email}</span>}
          </label>

          <label className={clases('campo', errores.password && 'campo--malo')}>
            <span className="campo__etiqueta">Contrasenia</span>
            <input
              type="password"
              className="campo__control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            {errores.password && <span className="campo__error">{errores.password}</span>}
          </label>

          {error && <p className="aviso aviso--error">{error}</p>}

          <button
            type="submit"
            className="boton boton--vino boton--grande boton--ancho"
            disabled={enviando || !enLinea}
          >
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="acceso-op__pie">
          <Link to="/">Volver a la tienda</Link>
        </p>
      </div>
    </div>
  )
}
