import type { ColumnaReporte, Visual } from '@aurora/contratos'
import { bs, clases, fecha, numero } from '../util/formato'

/**
 * Graficos de reporte, dibujados a mano con SVG y CSS.
 *
 * Sin libreria a proposito. Una de graficos pesa mas que todo el resto del PWA
 * junto, y esta aplicacion tiene que abrir sin red en el celular de una
 * vendedora. Cuatro formas simples alcanzan para lo que los reportes necesitan
 * mostrar, y de paso salen con la tipografia y la paleta del sistema en vez de
 * las de otra gente.
 */

interface Props {
  visual: Visual
  columnas: ColumnaReporte[]
  filas: Record<string, unknown>[]
}

// Columnas que identifican sin nombrar: un SKU es unico por definicion, asi
// que siempre gana por variedad, y "encabeza VES-MIDI-01-01" no le dice nada a
// nadie. Se las descarta como etiqueta salvo que no quede otra.
const ES_CODIGO = /^(sku|codigo|numero|referencia)$|_(sku|codigo|id)$|^id$/i

/**
 * Que columna va en cada eje.
 *
 * La etiqueta es la columna no numerica con mas valores distintos, dejando de
 * lado las que son codigos: es la que
 * de verdad identifica cada fila. Tomar la primera a secas fallaba en el
 * reporte de stock bajo, donde la primera es "sucursal" y sale la misma en las
 * veinticinco filas: la leyenda quedaba con "Aurora Centro" repetido seis veces
 * en lugar de decir de que prendas se esta hablando.
 *
 * El valor tiene truco. Un ranking de "productos mas vendidos" viene ordenado
 * por UNIDADES, pero la ultima columna numerica es el total en bolivianos; si el
 * grafico midiera el total, la barra mas larga no seria la primera de la lista y
 * el dibujo contradiria a la tabla que tiene debajo.
 *
 * Como el SQL ya ordeno las filas, se busca que columna numerica viene
 * decreciendo: esa es por la que el reporte esta rankeando. Si ninguna decrece
 * -por ejemplo una serie por fecha- se usa la ultima, que suele ser el monto.
 */
function ejes(columnas: ColumnaReporte[], filas: Record<string, unknown>[]) {
  const distintos = (c: ColumnaReporte) => new Set(filas.map((f) => String(f[c.nombre]))).size

  const noNumericas = columnas.filter((c) => c.tipo !== 'numero')
  const nombrables = noNumericas.filter((c) => !ES_CODIGO.test(c.nombre))
  const candidatas = nombrables.length > 0 ? nombrables : noNumericas

  // Ante empate gana la primera, que es el orden en que el SQL las declaro.
  const etiqueta =
    candidatas.reduce<ColumnaReporte | null>(
      (mejor, c) => (mejor === null || distintos(c) > distintos(mejor) ? c : mejor),
      null
    ) ?? columnas[0]

  const numericas = columnas.filter((c) => c.tipo === 'numero')

  const ordenadora =
    filas.length > 1
      ? numericas.find((c) =>
          filas.every(
            (f, n) => n === 0 || Number(filas[n - 1][c.nombre] ?? 0) >= Number(f[c.nombre] ?? 0)
          )
        )
      : undefined

  return { etiqueta, valor: ordenadora ?? numericas.at(-1) }
}

const formatear = (n: number, esMonto: boolean) => (esMonto ? bs(n) : numero(n))

/** Los nombres de columna que suelen ser dinero. */
const esColumnaDeDinero = (nombre: string) =>
  /total|monto|subtotal|precio|importe|reembolso/i.test(nombre)

export function Grafico({ visual: visualPedida, columnas, filas }: Props) {
  let visual = visualPedida
  if (filas.length === 0 || columnas.length === 0) return null

  // La plantilla que pide 'tabla' esta diciendo que sus filas no se resumen en
  // un dibujo. Antes caia en el `return` de la torta que cierra esta funcion y
  // se le dibujaba una igual.
  if (visual === 'tabla') return null

  const { etiqueta, valor } = ejes(columnas, filas)
  if (!valor || !etiqueta) return null

  const dinero = esColumnaDeDinero(valor.nombre)
  const datos = filas.map((f) => {
    const crudo = f[etiqueta.nombre]
    return {
      // Una fecha llega en ISO. Mostrarla cruda en el eje es ilegible y delata
      // que el dato pasó sin que nadie lo mirara.
      etiqueta:
        etiqueta.tipo === 'fecha' && typeof crudo === 'string' ? fecha(crudo) : String(crudo ?? ''),
      valor: Number(f[valor.nombre] ?? 0),
    }
  })

  const maximo = Math.max(...datos.map((d) => d.valor), 0)

  // Una linea necesita al menos dos puntos. Con uno solo el trazo degenera y
  // queda un lienzo vacio con un punto perdido; la barra dice lo mismo y se ve.
  if (visual === 'lineas' && datos.length < 2) {
    visual = 'barras'
  }

  if (visual === 'tarjeta') {
    const total = datos.reduce((s, d) => s + d.valor, 0)
    return (
      <div className="grafico grafico--tarjeta">
        <span className="rotulo">{valor.nombre}</span>
        <span className="cifra grafico__tarjeta-cifra">{formatear(total, dinero)}</span>
      </div>
    )
  }

  if (visual === 'barras') {
    // Barras horizontales: las etiquetas de un ranking son nombres largos y en
    // vertical quedarian rotadas e ilegibles.
    return (
      <div className="grafico grafico--barras">
        {datos.slice(0, 15).map((d, n) => (
          <div key={n} className="barra">
            <span className="barra__etiqueta" title={d.etiqueta}>
              {d.etiqueta}
            </span>
            <span className="barra__pista">
              <span
                className="barra__relleno"
                style={{ width: maximo > 0 ? `${(d.valor / maximo) * 100}%` : '0%' }}
              />
            </span>
            <span className="cifra barra__valor">{formatear(d.valor, dinero)}</span>
          </div>
        ))}
        {datos.length > 15 && (
          <p className="grafico__nota">Se muestran los 15 primeros de {numero(datos.length)}.</p>
        )}
      </div>
    )
  }

  if (visual === 'lineas') {
    const ancho = 800
    const alto = 220
    const margen = { arriba: 12, abajo: 26, izquierda: 8, derecha: 8 }
    const util = {
      ancho: ancho - margen.izquierda - margen.derecha,
      alto: alto - margen.arriba - margen.abajo,
    }

    const paso = datos.length > 1 ? util.ancho / (datos.length - 1) : 0
    const y = (v: number) =>
      margen.arriba + util.alto - (maximo > 0 ? (v / maximo) * util.alto : 0)

    const puntos = datos.map((d, n) => `${margen.izquierda + n * paso},${y(d.valor)}`).join(' ')
    const area = `${margen.izquierda},${margen.arriba + util.alto} ${puntos} ${margen.izquierda + (datos.length - 1) * paso},${margen.arriba + util.alto}`

    return (
      <div className="grafico grafico--lineas">
        <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Evolucion en el tiempo">
          <polygon points={area} className="linea__area" />
          <polyline points={puntos} className="linea__trazo" />
          {datos.map((d, n) => (
            <circle
              key={n}
              cx={margen.izquierda + n * paso}
              cy={y(d.valor)}
              r="3"
              className="linea__punto"
            >
              <title>{`${d.etiqueta}: ${formatear(d.valor, dinero)}`}</title>
            </circle>
          ))}
        </svg>
        <div className="grafico__pie-eje">
          <span>{datos[0]?.etiqueta}</span>
          {datos.length > 2 && <span>{datos[Math.floor(datos.length / 2)]?.etiqueta}</span>}
          <span>{datos.at(-1)?.etiqueta}</span>
        </div>
      </div>
    )
  }

  // torta — es lo unico que queda por dibujar.
  const total = datos.reduce((s, d) => s + d.valor, 0)
  const radio = 60
  const circunferencia = 2 * Math.PI * radio
  let acumulado = 0

  return (
    <div className="grafico grafico--torta">
      <svg viewBox="0 0 160 160" role="img" aria-label="Distribucion">
        {datos.slice(0, 6).map((d, n) => {
          const porcion = total > 0 ? d.valor / total : 0
          const trazo = porcion * circunferencia
          const inicio = acumulado
          acumulado += trazo
          return (
            <circle
              key={n}
              cx="80"
              cy="80"
              r={radio}
              className={clases('torta__sector', `torta__sector--${n % 6}`)}
              strokeDasharray={`${trazo} ${circunferencia - trazo}`}
              strokeDashoffset={-inicio}
            >
              <title>{`${d.etiqueta}: ${formatear(d.valor, dinero)}`}</title>
            </circle>
          )
        })}
      </svg>

      <ul className="torta__leyenda">
        {datos.slice(0, 6).map((d, n) => (
          <li key={n}>
            <span className={clases('torta__muestra', `torta__muestra--${n % 6}`)} aria-hidden />
            <span className="torta__nombre">{d.etiqueta}</span>
            <span className="cifra">{formatear(d.valor, dinero)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
