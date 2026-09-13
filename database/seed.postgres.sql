-- ============================================================================
--  AURORA  -  Datos iniciales (catalogos maestros y usuario administrador)
--  Motor: PostgreSQL 16   -   Ejecutar DESPUES de schema.postgres.sql
-- ============================================================================
--  Primera version generada por scripts/seed-a-postgres.mjs desde
--  seed.mysql.sql. De aqui en adelante este archivo es el maestro.
-- ============================================================================
--  AURORA  -  Datos iniciales (catalogos maestros y usuario administrador)
--  Ejecutar DESPUES de schema.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
INSERT INTO rol (id, nombre, descripcion, es_sistema) VALUES
 (1,'administrador','Acceso total al sistema',TRUE),
 (2,'gerente','Gerente de sucursal: ve y opera solo su sucursal',TRUE),
 (3,'vendedor','Atiende ventas en mostrador y pedidos online',TRUE),
 (4,'almacenero','Gestiona stock, transferencias y recepcion de compras',TRUE),
 (5,'repartidor','Entrega pedidos a domicilio',TRUE),
 (6,'cliente','Compra en la tienda en linea',TRUE);

-- ---------------------------------------------------------------------------
-- Permisos (codigo = modulo.accion)
-- ---------------------------------------------------------------------------
INSERT INTO permiso (codigo, modulo, descripcion) VALUES
 ('*','sistema','Comodin: acceso total'),
 ('usuario.ver','usuario','Listar usuarios'),
 ('usuario.crear','usuario','Crear usuarios'),
 ('usuario.editar','usuario','Editar usuarios'),
 ('usuario.eliminar','usuario','Dar de baja usuarios'),
 ('rol.gestionar','rol','Crear roles y asignar permisos'),
 ('bitacora.ver','bitacora','Consultar la bitacora de auditoria'),
 ('sucursal.ver','sucursal','Ver sucursales'),
 ('sucursal.ver_todas','sucursal','Ver datos de todas las sucursales'),
 ('sucursal.gestionar','sucursal','Crear y editar sucursales y almacenes'),
 ('producto.ver','producto','Ver el catalogo interno'),
 ('producto.crear','producto','Crear productos y variantes'),
 ('producto.editar','producto','Editar productos y precios'),
 ('producto.eliminar','producto','Dar de baja productos'),
 ('inventario.ver','inventario','Consultar stock'),
 ('inventario.ajustar','inventario','Ajustar stock manualmente'),
 ('inventario.transferir','inventario','Solicitar y recibir transferencias'),
 ('compra.ver','compra','Ver compras a proveedores'),
 ('compra.gestionar','compra','Registrar compras y recepciones'),
 ('venta.ver','venta','Ver pedidos y ventas'),
 ('venta.crear','venta','Registrar ventas en mostrador'),
 ('venta.anular','venta','Anular o cancelar pedidos'),
 ('venta.despachar','venta','Preparar y despachar pedidos'),
 ('pago.confirmar','pago','Confirmar pagos y comprobantes'),
 ('caja.operar','caja','Abrir y cerrar caja'),
 ('devolucion.gestionar','devolucion','Aprobar y procesar devoluciones'),
 ('promocion.gestionar','promocion','Crear campanias y promociones'),
 ('reporte.ver','reporte','Ver reportes'),
 ('reporte.demanda','reporte','Pedir reportes bajo demanda por chat o voz'),
 ('reporte.exportar','reporte','Exportar reportes a PDF o Excel'),
 ('ia.asistente','ia','Usar el asistente conversacional interno');

-- Administrador: comodin
INSERT INTO rol_permiso (rol_id, permiso_id)
SELECT 1, id FROM permiso WHERE codigo = '*';

-- Gerente de sucursal
INSERT INTO rol_permiso (rol_id, permiso_id)
SELECT 2, id FROM permiso WHERE codigo IN (
 'usuario.ver','bitacora.ver','sucursal.ver','producto.ver','producto.editar',
 'inventario.ver','inventario.ajustar','inventario.transferir',
 'compra.ver','compra.gestionar','venta.ver','venta.crear','venta.anular',
 'venta.despachar','pago.confirmar','caja.operar','devolucion.gestionar',
 'promocion.gestionar','reporte.ver','reporte.demanda','reporte.exportar','ia.asistente');

-- Vendedor
INSERT INTO rol_permiso (rol_id, permiso_id)
SELECT 3, id FROM permiso WHERE codigo IN (
 'producto.ver','inventario.ver','venta.ver','venta.crear','venta.despachar',
 'pago.confirmar','caja.operar','reporte.ver','ia.asistente');

-- Almacenero
INSERT INTO rol_permiso (rol_id, permiso_id)
SELECT 4, id FROM permiso WHERE codigo IN (
 'producto.ver','inventario.ver','inventario.ajustar','inventario.transferir',
 'compra.ver','compra.gestionar','venta.despachar','reporte.ver');

-- Repartidor
INSERT INTO rol_permiso (rol_id, permiso_id)
SELECT 5, id FROM permiso WHERE codigo IN ('venta.ver','venta.despachar');

-- El rol cliente no recibe permisos administrativos: sus rutas son publicas
-- o se resuelven contra su propio usuario_id.

-- ---------------------------------------------------------------------------
-- Geografia: los 9 departamentos de Bolivia
-- ---------------------------------------------------------------------------
INSERT INTO departamento (id, nombre) VALUES
 (1,'Santa Cruz'),(2,'La Paz'),(3,'Cochabamba'),(4,'Oruro'),(5,'Potosi'),
 (6,'Chuquisaca'),(7,'Tarija'),(8,'Beni'),(9,'Pando');

INSERT INTO ciudad (id, departamento_id, nombre) VALUES
 (1,1,'Santa Cruz de la Sierra'),(2,1,'Montero'),(3,1,'Warnes'),
 (4,2,'La Paz'),(5,2,'El Alto'),
 (6,3,'Cochabamba'),(7,3,'Quillacollo'),
 (8,4,'Oruro'),(9,5,'Potosi'),(10,6,'Sucre'),
 (11,7,'Tarija'),(12,8,'Trinidad'),(13,9,'Cobija');

-- ---------------------------------------------------------------------------
-- Sucursales y almacenes
-- ---------------------------------------------------------------------------
INSERT INTO sucursal (id, codigo, nombre, ciudad_id, direccion, telefono, horario, es_virtual) VALUES
 (1,'SC-CENTRO','Aurora Centro',        1,'Calle Libertad 234, 1er anillo','+591 3 3334455','L-S 09:00-21:00',FALSE),
 (2,'SC-VENTURA','Aurora Ventura Mall', 1,'Av. Banzer km 8, Ventura Mall','+591 3 3345566','L-D 10:00-22:00',FALSE),
 (3,'LP-SOPOCACHI','Aurora Sopocachi',  4,'Av. 20 de Octubre 1850','+591 2 2445566','L-S 09:30-20:30',FALSE),
 (4,'CB-RECOLETA','Aurora Recoleta',    6,'Av. Pando 1120','+591 4 4556677','L-S 09:00-20:00',FALSE),
 (5,'SCZ-CD','Centro de Distribucion Nacional',1,'Parque Industrial PI-12',NULL,NULL,TRUE);

INSERT INTO almacen (id, sucursal_id, codigo, nombre, tipo, es_principal) VALUES
 (1,1,'A-SC-CENTRO-V','Piso de venta Centro','venta',TRUE),
 (2,1,'A-SC-CENTRO-D','Deposito Centro','deposito',FALSE),
 (3,2,'A-SC-VENT-V','Piso de venta Ventura','venta',TRUE),
 (4,3,'A-LP-SOPO-V','Piso de venta Sopocachi','venta',TRUE),
 (5,3,'A-LP-SOPO-D','Deposito Sopocachi','deposito',FALSE),
 (6,4,'A-CB-RECO-V','Piso de venta Recoleta','venta',TRUE),
 (7,5,'A-CD-NAC','Almacen central','deposito',TRUE),
 (8,5,'A-CD-DEV','Devoluciones nacionales','devoluciones',FALSE);

-- ---------------------------------------------------------------------------
-- Usuario administrador
-- Contrasenia: Aurora2026!   (hash bcrypt, cambiala despues del primer login)
-- ---------------------------------------------------------------------------
INSERT INTO usuario (id, rol_id, sucursal_id, nombre, apellido, email, telefono, password_hash, email_verificado) VALUES
 (1,1,NULL,'Administrador','Aurora','admin@aurora.bo','+591 70000000',
  '$2y$12$QZBst2P7PGNT1E1H/PNxxu.h9NuQmDBdQBqwKmyW6BXC7JXVow0X6',TRUE);

-- ---------------------------------------------------------------------------
-- Tallas y colores
-- ---------------------------------------------------------------------------
INSERT INTO talla (id, nombre, tipo, orden) VALUES
 (1,'XS','alfa',1),(2,'S','alfa',2),(3,'M','alfa',3),(4,'L','alfa',4),(5,'XL','alfa',5),(6,'XXL','alfa',6),
 (7,'36','numerica',1),(8,'38','numerica',2),(9,'40','numerica',3),(10,'42','numerica',4),(11,'44','numerica',5),
 (12,'35','calzado',1),(13,'36','calzado',2),(14,'37','calzado',3),(15,'38','calzado',4),(16,'39','calzado',5),
 (17,'UNICA','unica',1);

INSERT INTO color (id, nombre, hex) VALUES
 (1,'Negro','#111111'),(2,'Blanco','#FFFFFF'),(3,'Beige','#E8DCC8'),(4,'Rojo','#C1272D'),
 (5,'Azul marino','#1B2A4A'),(6,'Verde oliva','#6B705C'),(7,'Rosa palo','#E8B4B8'),
 (8,'Camel','#B98A5B'),(9,'Gris jaspeado','#9A9A9A'),(10,'Estampado floral','#D9A7B0');

-- ---------------------------------------------------------------------------
-- Categorias (jerarquicas)
-- ---------------------------------------------------------------------------
INSERT INTO categoria (id, padre_id, nombre, slug, orden) VALUES
 (1,NULL,'Ropa','ropa',1),
 (2,1,'Vestidos','vestidos',1),
 (3,1,'Blusas y tops','blusas-y-tops',2),
 (4,1,'Pantalones','pantalones',3),
 (5,1,'Faldas','faldas',4),
 (6,1,'Abrigos y chaquetas','abrigos-y-chaquetas',5),
 (7,1,'Ropa deportiva','ropa-deportiva',6),
 (8,NULL,'Calzado','calzado',2),
 (9,8,'Zapatos','zapatos',1),
 (10,8,'Zapatillas','zapatillas',2),
 (11,NULL,'Accesorios','accesorios',3),
 (12,11,'Carteras','carteras',1),
 (13,11,'Bisuteria','bisuteria',2);

-- ---------------------------------------------------------------------------
-- Guia de tallas (cm) - base del probador digital
-- Fuente: tabla estandar de confeccion femenina latinoamericana
-- ---------------------------------------------------------------------------
INSERT INTO guia_talla (categoria_id, talla_id, busto_min, busto_max, cintura_min, cintura_max, cadera_min, cadera_max) VALUES
 -- Vestidos
 (2,1,78,82,60,64,86,90),(2,2,83,87,65,69,91,95),(2,3,88,93,70,75,96,101),
 (2,4,94,99,76,81,102,107),(2,5,100,106,82,88,108,114),(2,6,107,114,89,96,115,122),
 -- Blusas y tops
 (3,1,78,82,60,64,NULL,NULL),(3,2,83,87,65,69,NULL,NULL),(3,3,88,93,70,75,NULL,NULL),
 (3,4,94,99,76,81,NULL,NULL),(3,5,100,106,82,88,NULL,NULL),(3,6,107,114,89,96,NULL,NULL),
 -- Pantalones (por cintura y cadera)
 (4,1,NULL,NULL,60,64,86,90),(4,2,NULL,NULL,65,69,91,95),(4,3,NULL,NULL,70,75,96,101),
 (4,4,NULL,NULL,76,81,102,107),(4,5,NULL,NULL,82,88,108,114),(4,6,NULL,NULL,89,96,115,122),
 -- Faldas
 (5,1,NULL,NULL,60,64,86,90),(5,2,NULL,NULL,65,69,91,95),(5,3,NULL,NULL,70,75,96,101),
 (5,4,NULL,NULL,76,81,102,107),(5,5,NULL,NULL,82,88,108,114),(5,6,NULL,NULL,89,96,115,122);

-- ---------------------------------------------------------------------------
-- Metodos de pago
-- disponible_offline = se puede cobrar sin conexion (el registro se sincroniza
-- despues). Solo el efectivo y el pago contra entrega cumplen esa condicion.
-- ---------------------------------------------------------------------------
INSERT INTO metodo_pago (id, codigo, nombre, tipo, requiere_comprobante, disponible_offline, canal) VALUES
 (1,'efectivo','Efectivo','efectivo',FALSE,TRUE,'tienda'),
 (2,'qr_simple','QR Simple (BCB)','qr',TRUE,FALSE,'todos'),
 (3,'tarjeta_pos','Tarjeta en POS','tarjeta',FALSE,FALSE,'tienda'),
 (4,'tarjeta_online','Tarjeta credito/debito','tarjeta',FALSE,FALSE,'online'),
 (5,'transferencia','Transferencia bancaria','transferencia',TRUE,FALSE,'online'),
 (6,'contra_entrega','Pago contra entrega','contra_entrega',FALSE,TRUE,'online');

-- ---------------------------------------------------------------------------
-- Plantillas de reporte bajo demanda
-- El asistente de IA NO escribe SQL: elige uno de estos codigos y completa los
-- parametros. El backend valida los parametros y ejecuta la consulta preparada.
-- ---------------------------------------------------------------------------
INSERT INTO plantilla_reporte (codigo, nombre, descripcion, sql_plantilla, parametros, visual_default) VALUES
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

-- ---------------------------------------------------------------------------
-- Proveedores de ejemplo
-- ---------------------------------------------------------------------------
INSERT INTO proveedor (nombre, nit, contacto, telefono, email) VALUES
 ('Textiles del Sur SRL','1023456789','Marcela Vargas','+591 3 3456789','ventas@textilesdelsur.bo'),
 ('Importadora Moda Andina','2098765432','Luis Choque','+591 2 2987654','compras@modaandina.bo'),
 ('Confecciones Prisma','3055512345','Ana Rojas','+591 4 4551234','contacto@prisma.bo');

-- ============================================================================
-- RESINCRONIZACION DE SECUENCIAS
-- ============================================================================
-- Varias tablas de arriba se siembran con id explicito. En Postgres eso no
-- adelanta la secuencia de la columna IDENTITY, asi que el primer INSERT de la
-- aplicacion intentaria reusar el id 1 y fallaria por clave duplicada. Este
-- bloque deja cada secuencia apuntando al siguiente id libre.
DO $sync$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND is_identity = 'YES'
  LOOP
    EXECUTE format(
      'SELECT setval(pg_get_serial_sequence(%L, %L), COALESCE((SELECT MAX(%I) FROM %I), 0) + 1, false)',
      r.table_name, r.column_name, r.column_name, r.table_name
    );
  END LOOP;
END
$sync$;
