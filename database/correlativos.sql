-- ============================================================================
--  AURORA  -  Correlativos de documentos
--  Se aplica DESPUES de schema.postgres.sql y ANTES de seed.postgres.sql
-- ============================================================================
--
--  Las transferencias, compras, pedidos, devoluciones y cajas llevan un numero
--  legible (TRF-000001) ademas de su id. Ese numero no se puede calcular con un
--  "SELECT max(numero) + 1": dos cajas vendiendo al mismo tiempo leerian el
--  mismo maximo y las dos intentarian escribir el mismo numero, y una fallaria
--  por la restriccion de unicidad en mitad de una venta.
--
--  Una secuencia de PostgreSQL resuelve eso: nextval() es atomico y no se
--  bloquea. El precio es que puede haber huecos si una transaccion se revierte,
--  porque la secuencia no retrocede. Para numeracion interna es aceptable; si
--  alguna vez hiciera falta una serie fiscal sin huecos, habria que llevarla en
--  una tabla con bloqueo explicito.
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS seq_transferencia START 1;
CREATE SEQUENCE IF NOT EXISTS seq_compra       START 1;
CREATE SEQUENCE IF NOT EXISTS seq_pedido       START 1;
CREATE SEQUENCE IF NOT EXISTS seq_devolucion   START 1;
CREATE SEQUENCE IF NOT EXISTS seq_caja         START 1;

-- Devuelve el siguiente numero de una serie, con el prefijo y seis digitos:
--   SELECT correlativo('TRF', 'seq_transferencia');  ->  TRF-000001
CREATE OR REPLACE FUNCTION correlativo(prefijo TEXT, secuencia TEXT)
RETURNS TEXT AS $corr$
  SELECT prefijo || '-' || to_char(nextval(secuencia::regclass), 'FM000000');
$corr$ LANGUAGE sql;
