import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Avatar, MedidasCliente } from '@aurora/contratos'
import { NOMBRE_TIPO_CUERPO } from '@aurora/contratos'
import { api, ErrorApi } from '../api/cliente'
import { Cargando } from '../componentes/Estados'
import { clases } from '../util/formato'

/** Los campos del formulario, en el orden en que se miden. */
const CAMPOS = [
  { clave: 'altura_cm', etiqueta: 'Altura', unidad: 'cm', obligatorio: true },
  { clave: 'peso_kg', etiqueta: 'Peso', unidad: 'kg', obligatorio: true },
  { clave: 'busto_cm', etiqueta: 'Busto', unidad: 'cm', obligatorio: false },
  { clave: 'cintura_cm', etiqueta: 'Cintura', unidad: 'cm', obligatorio: false },
  { clave: 'cadera_cm', etiqueta: 'Cadera', unidad: 'cm', obligatorio: false },
] as const

type Clave = (typeof CAMPOS)[number]['clave']
type Formulario = Record<Clave, string>

const VACIO: Formulario = {
  altura_cm: '',
  peso_kg: '',
  busto_cm: '',
  cintura_cm: '',
  cadera_cm: '',
}

/**
 * Altura de cada punto del cuerpo, como fraccion de la estatura.
 *
 * Son las proporciones canonicas que se usan en dibujo de figura: la cadera a
 * la mitad de la altura, la rodilla a tres cuartos. No dependen de las medidas
 * de nadie —eso lo aportan los anchos—, pero sin ellas el dibujo no se lee como
 * un cuerpo.
 */
const ALTO = {
  menton: 13,
  hombro: 19,
  busto: 27,
  cintura: 37,
  cadera: 48,
  entrepierna: 52,
  rodilla: 74,
  pie: 99,
}

/**
 * Silueta dibujada con las proporciones de la clienta.
 *
 * El avatar viene normalizado contra la altura, asi que el dibujo es una
 * multiplicacion y nada mas: el servidor no sabe —ni necesita saber— de que
 * tamanio es este lienzo.
 *
 * El lienzo es angosto y alto (44 x 100) en vez de cuadrado porque un cuerpo lo
 * es: con 90 cm de busto y 167 de altura, el ancho del torso es el 17% de la
 * estatura. En un lienzo cuadrado habia que exagerar los anchos para llenarlo,
 * y el resultado no se parecia a nadie.
 *
 * No pretende ser un retrato. Sirve para que quien carga sus medidas vea que el
 * numero que escribio hizo algo, y para que una cadera mal tipeada se note a
 * simple vista antes de que arruine una recomendacion de talla.
 */
function Silueta({ avatar }: { avatar: Avatar }) {
  const { hombros, busto, cintura, cadera } = avatar.parametros

  const ANCHO = 44
  const centro = ANCHO / 2

  // Los parametros son fraccion de la altura, y el lienzo mide 100 de alto: el
  // ancho en unidades del lienzo es la fraccion por 100, sin exagerar nada.
  const medio = (v: number) => (v * 100) / 2

  const hombro = medio(hombros)
  const pecho = medio(busto)
  const talle = medio(cintura)
  const anca = medio(cadera)

  // Puntos del contorno, por altura y por lado.
  const x = (mitad: number, signo: 1 | -1) => centro + signo * mitad

  /**
   * El torso, bajando por la izquierda y subiendo por la derecha.
   *
   * Los dos lados no se pueden generar con la misma funcion cambiando el signo:
   * el derecho se recorre al reves, de la entrepierna al hombro, y una curva de
   * Bezier no es simetrica respecto del sentido en que se la escribe. Escrito
   * como si lo fuera, el trazo se cruza solo y sale un lazo.
   */
  const torso = [
    `M ${x(hombro, -1)} ${ALTO.hombro}`,
    `C ${x(pecho, -1)} ${ALTO.busto - 3} ${x(pecho, -1)} ${ALTO.busto - 1} ${x(pecho, -1)} ${ALTO.busto}`,
    `C ${x(pecho, -1)} ${ALTO.busto + 4} ${x(talle, -1)} ${ALTO.cintura - 4} ${x(talle, -1)} ${ALTO.cintura}`,
    `C ${x(talle, -1)} ${ALTO.cintura + 4} ${x(anca, -1)} ${ALTO.cadera - 5} ${x(anca, -1)} ${ALTO.cadera}`,
    `L ${x(anca * 0.9, -1)} ${ALTO.entrepierna}`,
    `L ${x(anca * 0.9, 1)} ${ALTO.entrepierna}`,
    `L ${x(anca, 1)} ${ALTO.cadera}`,
    `C ${x(anca, 1)} ${ALTO.cadera - 5} ${x(talle, 1)} ${ALTO.cintura + 4} ${x(talle, 1)} ${ALTO.cintura}`,
    `C ${x(talle, 1)} ${ALTO.cintura - 4} ${x(pecho, 1)} ${ALTO.busto + 4} ${x(pecho, 1)} ${ALTO.busto}`,
    `C ${x(pecho, 1)} ${ALTO.busto - 1} ${x(pecho, 1)} ${ALTO.busto - 3} ${x(hombro, 1)} ${ALTO.hombro}`,
    'Z',
  ].join(' ')

  /**
   * Una pierna.
   *
   * Va aparte del torso para que quede la abertura de la entrepierna: un solo
   * trazo cerrado de hombros a pies dibuja una falda, no un cuerpo.
   */
  const pierna = (signo: 1 | -1) => {
    const exterior = anca * 0.9
    const tobillo = anca * 0.32
    const interiorPie = anca * 0.06

    return [
      `M ${x(exterior, signo)} ${ALTO.entrepierna}`,
      `C ${x(exterior * 0.95, signo)} ${ALTO.rodilla} ${x(tobillo + interiorPie, signo)} ${ALTO.rodilla + 6} ${x(tobillo, signo)} ${ALTO.pie}`,
      `L ${x(interiorPie, signo)} ${ALTO.pie}`,
      `C ${x(interiorPie, signo)} ${ALTO.rodilla + 6} ${x(interiorPie, signo)} ${ALTO.rodilla} ${x(interiorPie, signo)} ${ALTO.entrepierna}`,
      'Z',
    ].join(' ')
  }

  return (
    <svg
      className="silueta"
      viewBox={`0 0 ${ANCHO} 100`}
      role="img"
      aria-label={`Silueta con tus proporciones${avatar.tipo_cuerpo ? `, tipo ${NOMBRE_TIPO_CUERPO[avatar.tipo_cuerpo]}` : ''}`}
    >
      {/* Cabeza y cuello: no salen de ninguna medida, son referencia visual. */}
      <ellipse cx={centro} cy={7} rx={4.2} ry={5.6} className="silueta__figura" />
      <rect x={centro - 1.6} y={ALTO.menton - 2} width={3.2} height={ALTO.hombro - ALTO.menton + 2} className="silueta__figura" />

      <path d={torso} className="silueta__figura" />
      <path d={pierna(-1)} className="silueta__figura" />
      <path d={pierna(1)} className="silueta__figura" />

      {/* Las tres lineas que si son datos de la clienta. */}
      {(
        [
          ['busto', pecho, ALTO.busto],
          ['cintura', talle, ALTO.cintura],
          ['cadera', anca, ALTO.cadera],
        ] as const
      ).map(([nombre, mitad, alto]) => (
        <line
          key={nombre}
          x1={centro - mitad - 3}
          x2={centro + mitad + 3}
          y1={alto}
          y2={alto}
          className="silueta__medida"
        />
      ))}
    </svg>
  )
}

/**
 * Mis medidas.
 *
 * Solo altura y peso son obligatorios. El resto se estima —y se avisa que se
 * estimo—, porque exigir cinta metrica para usar el probador dejaria afuera a
 * casi todo el mundo, que es lo contrario de lo que el probador viene a
 * resolver.
 */
export function MisMedidas() {
  const [forma, setForma] = useState<Formulario>(VACIO)
  const [guardadas, setGuardadas] = useState<MedidasCliente | null>(null)
  const [avatar, setAvatar] = useState<Avatar | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})

  useEffect(() => {
    void (async () => {
      const [medidas, av] = await Promise.all([
        api.obtener<MedidasCliente | null>('/api/probador/mis-medidas').catch(() => null),
        api.obtener<Avatar | null>('/api/probador/mi-avatar').catch(() => null),
      ])

      if (medidas) {
        setGuardadas(medidas)
        setForma({
          altura_cm: String(medidas.altura_cm),
          peso_kg: String(medidas.peso_kg),
          busto_cm: medidas.busto_cm === null ? '' : String(medidas.busto_cm),
          cintura_cm: medidas.cintura_cm === null ? '' : String(medidas.cintura_cm),
          cadera_cm: medidas.cadera_cm === null ? '' : String(medidas.cadera_cm),
        })
      }
      setAvatar(av)
      setCargando(false)
    })()
  }, [])

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setAviso(null)
    setErrores({})

    // Los opcionales en blanco no se mandan: mandarlos como 0 haria que el
    // servidor los tome por medidas reales de cero centimetros.
    const cuerpo: Record<string, number> = {}
    for (const campo of CAMPOS) {
      const valor = forma[campo.clave].trim().replace(',', '.')
      if (valor !== '') cuerpo[campo.clave] = Number(valor)
    }

    try {
      const r = await api.actualizar<MedidasCliente>('/api/probador/mis-medidas', cuerpo)
      setGuardadas(r)
      setForma((f) => ({
        ...f,
        busto_cm: r.busto_cm === null ? '' : String(r.busto_cm),
        cintura_cm: r.cintura_cm === null ? '' : String(r.cintura_cm),
        cadera_cm: r.cadera_cm === null ? '' : String(r.cadera_cm),
      }))
      setAvatar(await api.obtener<Avatar | null>('/api/probador/mi-avatar').catch(() => null))
      setAviso(
        r.estimadas.length > 0
          ? 'Listo. Completamos lo que faltaba a partir de tu altura y peso; si te tomás las medidas de verdad, la talla va a ser más precisa.'
          : 'Listo. Ya podemos recomendarte la talla en cada prenda.'
      )
    } catch (e) {
      const err = e as ErrorApi
      setErrores(err.errores ?? {})
      setAviso(err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <div className="contenedor-angosto seccion">
        <Cargando texto="Buscando tus medidas" />
      </div>
    )
  }

  const estimado = guardadas?.origen === 'estimado'

  return (
    <div className="contenedor seccion surge">
      <header className="medidas__cabecera">
        <h1>Mis medidas</h1>
        <p className="medidas__bajada">
          Con esto te decimos qué talla pedir en cada prenda. Quedan solo en tu cuenta.
        </p>
      </header>

      <div className="medidas">
        <form className="medidas__formulario" onSubmit={(e) => void guardar(e)}>
          {CAMPOS.map((campo) => (
            <label key={campo.clave} className="campo">
              <span className="campo__etiqueta">
                {campo.etiqueta}
                <span className="medidas__unidad">{campo.unidad}</span>
                {!campo.obligatorio && <span className="medidas__opcional">opcional</span>}
              </span>
              <input
                className="campo__control"
                type="number"
                step="0.1"
                inputMode="decimal"
                required={campo.obligatorio}
                placeholder={campo.obligatorio ? '' : 'La estimamos'}
                value={forma[campo.clave]}
                onChange={(e) => setForma((f) => ({ ...f, [campo.clave]: e.target.value }))}
              />
              {errores[campo.clave] && <span className="campo__error">{errores[campo.clave]}</span>}
            </label>
          ))}

          <button type="submit" className="boton boton--vino boton--ancho" disabled={guardando}>
            {guardando ? 'Guardando' : 'Guardar medidas'}
          </button>

          {aviso && (
            <p className={clases('aviso', Object.keys(errores).length > 0 && 'aviso--error')}>
              {aviso}
            </p>
          )}
        </form>

        <aside className="medidas__avatar">
          {avatar ? (
            <>
              <Silueta avatar={avatar} />
              {avatar.tipo_cuerpo && (
                <p className="medidas__tipo">{NOMBRE_TIPO_CUERPO[avatar.tipo_cuerpo]}</p>
              )}
              {estimado && (
                <p className="medidas__estimado">
                  Dibujado con medidas estimadas a partir de tu altura y peso.
                </p>
              )}
              <Link to="/catalogo" className="boton boton--linea">
                Ver qué me queda
              </Link>
            </>
          ) : (
            <p className="medidas__sin-avatar">
              Cargá tus medidas y acá vas a ver tu silueta.
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}
