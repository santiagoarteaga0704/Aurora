import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/cliente'
import { Cargando, Vacio } from '../componentes/Estados'
import { bs, clases, fecha } from '../util/formato'
import { ESTADO_PEDIDO } from '../util/estados'

interface FilaPedido {
  id: string
  numero: string
  estado: keyof typeof ESTADO_PEDIDO
  total: number
  pagado: number
  unidades: number
  creado_en: string
  sucursal: string
}

export function MisPedidos() {
  const [pedidos, setPedidos] = useState<FilaPedido[] | null>(null)

  useEffect(() => {
    void (async () => {
      const r = await api.pagina<FilaPedido>('/api/pedidos?por_pagina=50').catch(() => ({ datos: [] }))
      setPedidos(r.datos)
    })()
  }, [])

  if (pedidos === null) {
    return (
      <div className="contenedor-angosto seccion">
        <Cargando texto="Buscando tus pedidos" />
      </div>
    )
  }

  if (pedidos.length === 0) {
    return (
      <div className="contenedor-angosto seccion">
        <Vacio
          titulo="Todavia no compraste nada"
          detalle="Cuando hagas tu primer pedido, va a aparecer aca con su seguimiento."
          accion={
            <Link to="/catalogo" className="boton">
              Ver el catalogo
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="contenedor-angosto seccion surge">
      <h1>Mis pedidos</h1>

      <ul className="lista-pedidos">
        {pedidos.map((p) => {
          const estado = ESTADO_PEDIDO[p.estado]
          return (
            <li key={p.id}>
              <Link to={`/pedido/${p.id}`} className="fila-pedido">
                <div>
                  <p className="cifra fila-pedido__numero">{p.numero}</p>
                  <p className="fila-pedido__meta">
                    {fecha(p.creado_en)} · {p.unidades} articulo{p.unidades === 1 ? '' : 's'} ·{' '}
                    {p.sucursal}
                  </p>
                </div>
                <div className="fila-pedido__derecha">
                  <span className={clases('marca', estado.marca)}>{estado.texto}</span>
                  <span className="cifra fila-pedido__total">{bs(p.total)}</span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
