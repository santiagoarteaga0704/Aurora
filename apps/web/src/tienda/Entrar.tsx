import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ErrorApi } from '../api/cliente'
import { useSesion } from '../sesion/SesionContexto'
import { clases } from '../util/formato'

type Modo = 'entrar' | 'crear'

/**
 * Ingreso y alta de clientas, en una sola pantalla.
 *
 * Separarlas en dos rutas obliga a decidir "ya tengo cuenta" antes de escribir
 * nada. Con la pestania a la vista, cambiar de idea cuesta un clic y no se
 * pierde lo tipeado.
 */
export function Entrar() {
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const { entrar, registrarse } = useSesion()

  const [modo, setModo] = useState<Modo>('entrar')
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    telefono: '',
    tipo: 'minorista' as 'minorista' | 'mayorista',
    nit: '',
    razon_social: '',
  })
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const volverA = params.get('volver') ?? '/'

  const cambiar = (campo: keyof typeof form, valor: string) => {
    setForm((f) => ({ ...f, [campo]: valor }))
    setErrores((e) => {
      if (!e[campo]) return e
      const resto = { ...e }
      delete resto[campo]
      return resto
    })
  }

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setErrores({})
    setEnviando(true)

    try {
      if (modo === 'entrar') {
        await entrar(form.email, form.password)
      } else {
        await registrarse({
          nombre: form.nombre,
          apellido: form.apellido,
          email: form.email,
          password: form.password,
          telefono: form.telefono || undefined,
          tipo: form.tipo,
          nit: form.tipo === 'mayorista' ? form.nit : undefined,
          razon_social: form.tipo === 'mayorista' ? form.razon_social || undefined : undefined,
        })
      }
      navegar(volverA, { replace: true })
    } catch (err) {
      const fallo = err as ErrorApi
      setError(fallo.message)
      if (fallo.errores) setErrores(fallo.errores)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="acceso surge">
      <div className="acceso__caja">
        <p className="marca-aurora marca-aurora--acceso">AURORA</p>

        <div className="acceso__pestanias" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'entrar'}
            className={clases('acceso__pestania', modo === 'entrar' && 'acceso__pestania--activa')}
            onClick={() => setModo('entrar')}
          >
            Ingresar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'crear'}
            className={clases('acceso__pestania', modo === 'crear' && 'acceso__pestania--activa')}
            onClick={() => setModo('crear')}
          >
            Crear cuenta
          </button>
        </div>

        <form className="formulario" onSubmit={enviar}>
          {modo === 'crear' && (
            <div className="formulario__par">
              <label className={clases('campo', errores.nombre && 'campo--malo')}>
                <span className="campo__etiqueta">Nombre</span>
                <input
                  className="campo__control"
                  value={form.nombre}
                  onChange={(e) => cambiar('nombre', e.target.value)}
                  autoComplete="given-name"
                  required
                />
                {errores.nombre && <span className="campo__error">{errores.nombre}</span>}
              </label>

              <label className={clases('campo', errores.apellido && 'campo--malo')}>
                <span className="campo__etiqueta">Apellido</span>
                <input
                  className="campo__control"
                  value={form.apellido}
                  onChange={(e) => cambiar('apellido', e.target.value)}
                  autoComplete="family-name"
                  required
                />
                {errores.apellido && <span className="campo__error">{errores.apellido}</span>}
              </label>
            </div>
          )}

          <label className={clases('campo', errores.email && 'campo--malo')}>
            <span className="campo__etiqueta">Correo electronico</span>
            <input
              type="email"
              className="campo__control"
              value={form.email}
              onChange={(e) => cambiar('email', e.target.value)}
              autoComplete="email"
              required
            />
            {errores.email && <span className="campo__error">{errores.email}</span>}
          </label>

          <label className={clases('campo', errores.password && 'campo--malo')}>
            <span className="campo__etiqueta">Contrasenia</span>
            <input
              type="password"
              className="campo__control"
              value={form.password}
              onChange={(e) => cambiar('password', e.target.value)}
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
              required
            />
            {errores.password && <span className="campo__error">{errores.password}</span>}
          </label>

          {modo === 'crear' && (
            <>
              <label className="campo">
                <span className="campo__etiqueta">Telefono</span>
                <input
                  className="campo__control"
                  value={form.telefono}
                  onChange={(e) => cambiar('telefono', e.target.value)}
                  autoComplete="tel"
                  placeholder="+591 7..."
                />
              </label>

              <fieldset className="acceso__tipo">
                <legend className="campo__etiqueta">Tipo de cuenta</legend>
                <div className="acceso__opciones">
                  <button
                    type="button"
                    className={clases(
                      'opcion-entrega',
                      form.tipo === 'minorista' && 'opcion-entrega--activa'
                    )}
                    onClick={() => cambiar('tipo', 'minorista')}
                  >
                    <span className="opcion-entrega__titulo">Personal</span>
                    <span className="opcion-entrega__nota">Compras para vos</span>
                  </button>
                  <button
                    type="button"
                    className={clases(
                      'opcion-entrega',
                      form.tipo === 'mayorista' && 'opcion-entrega--activa'
                    )}
                    onClick={() => cambiar('tipo', 'mayorista')}
                  >
                    <span className="opcion-entrega__titulo">Mayorista</span>
                    <span className="opcion-entrega__nota">Comprás para revender</span>
                  </button>
                </div>
              </fieldset>

              {form.tipo === 'mayorista' && (
                <>
                  <label className={clases('campo', errores.nit && 'campo--malo')}>
                    <span className="campo__etiqueta">NIT</span>
                    <input
                      className="campo__control cifra"
                      value={form.nit}
                      onChange={(e) => cambiar('nit', e.target.value)}
                      required
                    />
                    {errores.nit && <span className="campo__error">{errores.nit}</span>}
                  </label>

                  <label className="campo">
                    <span className="campo__etiqueta">Razon social</span>
                    <input
                      className="campo__control"
                      value={form.razon_social}
                      onChange={(e) => cambiar('razon_social', e.target.value)}
                    />
                  </label>

                  <p className="aviso aviso--ojo">
                    Un asesor valida tu NIT antes de habilitarte los precios de mayoreo. Mientras
                    tanto podes comprar con precios de menudeo.
                  </p>
                </>
              )}
            </>
          )}

          {error && <p className="aviso aviso--error">{error}</p>}

          <button type="submit" className="boton boton--vino boton--grande boton--ancho" disabled={enviando}>
            {enviando ? 'Un momento...' : modo === 'entrar' ? 'Ingresar' : 'Crear mi cuenta'}
          </button>
        </form>

        <p className="acceso__pie">
          ¿Sos del personal? <Link to="/op/entrar">Entrar a operaciones</Link>
        </p>
      </div>
    </div>
  )
}
