import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ProductoResumen } from '@aurora/contratos'
import { api, consulta } from '../api/cliente'
import { TarjetaProducto } from './TarjetaProducto'
import { EsqueletoGrilla } from '../componentes/Estados'

/**
 * Portada de la tienda.
 *
 * La composicion es deliberadamente asimetrica: el titulo se desborda de la
 * columna y la promesa queda abajo a la derecha. Una portada centrada y
 * simetrica es lo que hace que una tienda parezca una plantilla.
 */
export function Inicio() {
  const [destacados, setDestacados] = useState<ProductoResumen[] | null>(null)
  const [novedades, setNovedades] = useState<ProductoResumen[] | null>(null)

  useEffect(() => {
    void (async () => {
      const [d, n] = await Promise.all([
        api
          .pagina<ProductoResumen>(
            `/api/catalogo/productos${consulta({ destacado: true, por_pagina: 4 })}`
          )
          .catch(() => ({ datos: [] })),
        api
          .pagina<ProductoResumen>(
            `/api/catalogo/productos${consulta({ orden: 'novedades', por_pagina: 8 })}`
          )
          .catch(() => ({ datos: [] })),
      ])
      setDestacados(d.datos)
      setNovedades(n.datos)
    })()
  }, [])

  return (
    <>
      <section className="portada">
        <div className="contenedor portada__reja surge">
          <p className="rotulo portada__temporada">Temporada 2026</p>

          <h1 className="portada__titulo">
            La prueba
            <em> antes</em>
            <br />
            de la compra
          </h1>

          <div className="portada__promesa">
            <p>
              Cargas tu estatura y tus medidas una vez, y el probador virtual te dice que talla
              es la tuya en cada prenda. Sin filas, sin probadores ocupados.
            </p>
            <div className="portada__acciones">
              <Link to="/catalogo" className="boton boton--grande">
                Ver el catalogo
              </Link>
              <Link to="/catalogo?orden=novedades" className="boton boton--linea boton--grande">
                Novedades
              </Link>
            </div>
          </div>

          <aside className="portada__datos">
            <div>
              <span className="cifra portada__dato">5</span>
              <span className="rotulo">Sucursales</span>
            </div>
            <div>
              <span className="cifra portada__dato">3</span>
              <span className="rotulo">Departamentos</span>
            </div>
            <div>
              <span className="cifra portada__dato">24/7</span>
              <span className="rotulo">Tienda en linea</span>
            </div>
          </aside>
        </div>
      </section>

      {destacados !== null && destacados.length > 0 && (
        <section className="contenedor seccion">
          <header className="seccion__cabecera">
            <h2>Seleccion de la casa</h2>
            <Link to="/catalogo?destacado=true" className="seccion__vermas">
              Ver todo
            </Link>
          </header>
          <div className="grilla-productos grilla-productos--destacada">
            {destacados.map((p) => (
              <TarjetaProducto key={p.id} producto={p} />
            ))}
          </div>
        </section>
      )}

      <section className="contenedor seccion">
        <header className="seccion__cabecera">
          <h2>Lo ultimo que llego</h2>
          <Link to="/catalogo?orden=novedades" className="seccion__vermas">
            Ver todo
          </Link>
        </header>

        {novedades === null ? (
          <EsqueletoGrilla cuantos={8} />
        ) : novedades.length === 0 ? (
          <p className="aviso aviso--ojo">
            Todavia no hay productos cargados. Desde el panel de operaciones se puede dar de alta
            el primero.
          </p>
        ) : (
          <div className="grilla-productos">
            {novedades.map((p) => (
              <TarjetaProducto key={p.id} producto={p} />
            ))}
          </div>
        )}
      </section>

      <section className="franja">
        <div className="contenedor franja__interior">
          <div className="franja__bloque">
            <p className="rotulo">Probador virtual</p>
            <h3 className="display">Tu talla, no la del maniqui</h3>
            <p>
              El sistema compara tus medidas con la guia de tallas de cada categoria y te recomienda
              el talle antes de que compres.
            </p>
          </div>
          <div className="franja__bloque">
            <p className="rotulo">Retiro o envio</p>
            <h3 className="display">Donde te quede mejor</h3>
            <p>
              Retiras en cualquiera de las cinco sucursales o lo recibis en tu casa. El stock que ves
              es el stock que hay.
            </p>
          </div>
          <div className="franja__bloque">
            <p className="rotulo">Mayoristas</p>
            <h3 className="display">Precio por volumen</h3>
            <p>
              Registra tu NIT y, una vez validado, la tienda te muestra los precios de mayoreo y las
              escalas por cantidad.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
