/**
 * Las 8 plantillas de reporte, reescritas para PostgreSQL.
 *
 * Estas plantillas son el motor de los reportes bajo demanda por chat y voz. El
 * modelo de IA nunca escribe SQL: elige un `codigo` de plantilla y devuelve los
 * parametros, y el backend ejecuta ESTE SQL con una sentencia preparada. Por eso
 * el SQL tiene que ser valido para el motor real, y por eso se reescribe a mano
 * en vez de con sustituciones ciegas.
 *
 * Que cambio respecto de la version de MySQL:
 *
 *   DATE(creado_en)              -> creado_en::date
 *   HOUR(creado_en)              -> EXTRACT(HOUR FROM creado_en)
 *   CONCAT(a, " ", b)            -> a || ' ' || b   (en Postgres las comillas
 *                                   dobles son identificadores, no cadenas)
 *   SUM(<booleano>)              -> COUNT(*) FILTER (WHERE <booleano>)
 *                                   porque la columna dejo de ser TINYINT(1)
 *   ROUND(<float>, 1)            -> ROUND(<...>::numeric, 1)
 *                                   Postgres no tiene ROUND(double, int)
 *   GROUP BY <alias de salida>   -> se agrupa por las columnas de origen
 *   canal = :canal               -> canal::text = :canal
 *                                   la columna ahora es un tipo enumerado
 *
 * Los :parametros son la convencion propia del modulo de reportes, no de SQL.
 */

export const PLANTILLAS_POSTGRES = `INSERT INTO plantilla_reporte (codigo, nombre, descripcion, sql_plantilla, parametros, visual_default) VALUES
(
 'ventas_por_rango',
 'Ventas en un rango de fechas y horas',
 'Total vendido y cantidad de pedidos entre dos momentos, con filtro opcional de sucursal y canal.',
 'SELECT creado_en::date AS fecha, COUNT(DISTINCT pedido_id) AS pedidos,
         SUM(cantidad) AS unidades, SUM(subtotal) AS total
  FROM v_ventas_detalle
  WHERE creado_en BETWEEN :desde AND :hasta
    AND (:sucursal_id IS NULL OR sucursal_id = :sucursal_id)
    AND (:canal IS NULL OR canal::text = :canal)
  GROUP BY creado_en::date ORDER BY fecha',
 '{"desde":{"tipo":"datetime","requerido":true},"hasta":{"tipo":"datetime","requerido":true},"sucursal_id":{"tipo":"int","requerido":false},"canal":{"tipo":"enum","opciones":["online","tienda"],"requerido":false}}',
 'lineas'
),
(
 'ventas_por_sucursal',
 'Ranking de sucursales',
 'Compara el total vendido por sucursal en un periodo.',
 'SELECT sucursal, departamento, COUNT(DISTINCT pedido_id) AS pedidos, SUM(subtotal) AS total
  FROM v_ventas_detalle
  WHERE creado_en BETWEEN :desde AND :hasta
  GROUP BY sucursal_id, sucursal, departamento ORDER BY total DESC',
 '{"desde":{"tipo":"datetime","requerido":true},"hasta":{"tipo":"datetime","requerido":true}}',
 'barras'
),
(
 'productos_mas_vendidos',
 'Productos mas vendidos',
 'Top N de productos por unidades vendidas en un periodo.',
 'SELECT producto, categoria, SUM(cantidad) AS unidades, SUM(subtotal) AS total
  FROM v_ventas_detalle
  WHERE creado_en BETWEEN :desde AND :hasta
    AND (:sucursal_id IS NULL OR sucursal_id = :sucursal_id)
  GROUP BY producto_id, producto, categoria ORDER BY unidades DESC LIMIT :limite',
 '{"desde":{"tipo":"datetime","requerido":true},"hasta":{"tipo":"datetime","requerido":true},"sucursal_id":{"tipo":"int","requerido":false},"limite":{"tipo":"int","requerido":false,"defecto":10}}',
 'barras'
),
(
 'stock_bajo',
 'Productos con stock bajo',
 'Variantes cuyo stock disponible esta por debajo del minimo configurado.',
 'SELECT s.nombre AS sucursal, a.nombre AS almacen, p.nombre AS producto,
         t.nombre AS talla, c.nombre AS color, v.sku,
         i.stock, i.stock_reservado, i.stock_minimo
  FROM inventario i
  JOIN almacen a ON a.id = i.almacen_id
  JOIN sucursal s ON s.id = a.sucursal_id
  JOIN variante v ON v.id = i.variante_id
  JOIN producto p ON p.id = v.producto_id
  JOIN talla t ON t.id = v.talla_id
  JOIN color c ON c.id = v.color_id
  WHERE (i.stock - i.stock_reservado) <= i.stock_minimo
    AND (:sucursal_id IS NULL OR s.id = :sucursal_id)
  ORDER BY (i.stock - i.stock_reservado) ASC',
 '{"sucursal_id":{"tipo":"int","requerido":false}}',
 'tabla'
),
(
 'ventas_por_hora',
 'Ventas por hora del dia',
 'Distribucion horaria de las ventas: sirve para dimensionar el personal por turno.',
 'SELECT EXTRACT(HOUR FROM creado_en) AS hora, COUNT(DISTINCT pedido_id) AS pedidos, SUM(subtotal) AS total
  FROM v_ventas_detalle
  WHERE creado_en BETWEEN :desde AND :hasta
    AND (:sucursal_id IS NULL OR sucursal_id = :sucursal_id)
  GROUP BY EXTRACT(HOUR FROM creado_en) ORDER BY hora',
 '{"desde":{"tipo":"datetime","requerido":true},"hasta":{"tipo":"datetime","requerido":true},"sucursal_id":{"tipo":"int","requerido":false}}',
 'barras'
),
(
 'desempeno_vendedores',
 'Desempenio de vendedores',
 'Ventas atribuidas a cada vendedor en un periodo.',
 'SELECT u.nombre || '' '' || u.apellido AS vendedor, s.nombre AS sucursal,
         COUNT(DISTINCT vd.pedido_id) AS pedidos, SUM(vd.subtotal) AS total
  FROM v_ventas_detalle vd
  JOIN usuario u ON u.id = vd.vendedor_id
  JOIN sucursal s ON s.id = vd.sucursal_id
  WHERE vd.creado_en BETWEEN :desde AND :hasta
    AND (:sucursal_id IS NULL OR vd.sucursal_id = :sucursal_id)
  GROUP BY u.id, u.nombre, u.apellido, s.nombre ORDER BY total DESC',
 '{"desde":{"tipo":"datetime","requerido":true},"hasta":{"tipo":"datetime","requerido":true},"sucursal_id":{"tipo":"int","requerido":false}}',
 'barras'
),
(
 'efectividad_probador',
 'Efectividad del probador virtual',
 'Cuantas pruebas virtuales terminaron en compra, por producto.',
 'SELECT p.nombre AS producto, COUNT(*) AS pruebas,
         COUNT(*) FILTER (WHERE pv.convirtio_en_compra) AS compras,
         ROUND((100.0 * COUNT(*) FILTER (WHERE pv.convirtio_en_compra) / COUNT(*))::numeric, 1) AS conversion_pct
  FROM prueba_virtual pv
  JOIN variante v ON v.id = pv.variante_id
  JOIN producto p ON p.id = v.producto_id
  WHERE pv.creado_en BETWEEN :desde AND :hasta
  GROUP BY p.id, p.nombre ORDER BY pruebas DESC LIMIT :limite',
 '{"desde":{"tipo":"datetime","requerido":true},"hasta":{"tipo":"datetime","requerido":true},"limite":{"tipo":"int","requerido":false,"defecto":15}}',
 'tabla'
),
(
 'devoluciones_por_motivo',
 'Devoluciones por motivo',
 'Cuenta y monto de devoluciones agrupadas por motivo en un periodo.',
 'SELECT d.motivo, COUNT(*) AS casos, SUM(d.monto_reembolso) AS monto
  FROM devolucion d
  WHERE d.creado_en BETWEEN :desde AND :hasta
  GROUP BY d.motivo ORDER BY casos DESC',
 '{"desde":{"tipo":"datetime","requerido":true},"hasta":{"tipo":"datetime","requerido":true}}',
 'torta'
);
`
