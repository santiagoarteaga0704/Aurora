-- ============================================================================
--  AURORA  |  Sistema de comercio electronico multisucursal de ropa femenina
--  Materia: SI2  -  Parcial 1
--  Motor  : MySQL 8.0 / InnoDB / utf8mb4
-- ============================================================================
--  Convenciones:
--    * Nombres de tabla en singular y snake_case.
--    * Toda tabla transaccional lleva creado_en / actualizado_en.
--    * Los borrados son logicos (columna `activo`) en catalogos maestros.
--    * Los montos son DECIMAL(12,2) en BOB (bolivianos).
-- ============================================================================

CREATE DATABASE IF NOT EXISTS aurora
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aurora;

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- 1. GEOGRAFIA Y RED DE SUCURSALES
-- ============================================================================

CREATE TABLE departamento (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(60)  NOT NULL UNIQUE,
  pais        VARCHAR(60)  NOT NULL DEFAULT 'Bolivia',
  activo      TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE ciudad (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  departamento_id  INT NOT NULL,
  nombre           VARCHAR(80) NOT NULL,
  activo           TINYINT(1)  NOT NULL DEFAULT 1,
  CONSTRAINT fk_ciudad_depto FOREIGN KEY (departamento_id) REFERENCES departamento(id),
  UNIQUE KEY uq_ciudad (departamento_id, nombre)
) ENGINE=InnoDB;

-- Una tienda a nivel nacional: varias sucursales por departamento.
CREATE TABLE sucursal (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  codigo      VARCHAR(20)  NOT NULL UNIQUE,
  nombre      VARCHAR(120) NOT NULL,
  ciudad_id   INT NOT NULL,
  direccion   VARCHAR(200) NOT NULL,
  latitud     DECIMAL(10,7) NULL,
  longitud    DECIMAL(10,7) NULL,
  telefono    VARCHAR(30)  NULL,
  email       VARCHAR(120) NULL,
  horario     VARCHAR(120) NULL,
  -- es_virtual = centro de distribucion que solo atiende pedidos online
  es_virtual  TINYINT(1)   NOT NULL DEFAULT 0,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sucursal_ciudad FOREIGN KEY (ciudad_id) REFERENCES ciudad(id),
  INDEX idx_sucursal_ciudad (ciudad_id)
) ENGINE=InnoDB;

-- Dentro de una sucursal puede haber uno o varios almacenes.
CREATE TABLE almacen (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  sucursal_id  INT NOT NULL,
  codigo       VARCHAR(20)  NOT NULL UNIQUE,
  nombre       VARCHAR(120) NOT NULL,
  tipo         ENUM('venta','deposito','devoluciones','transito') NOT NULL DEFAULT 'venta',
  -- el almacen principal es el que descuenta stock en una venta de mostrador
  es_principal TINYINT(1)   NOT NULL DEFAULT 0,
  activo       TINYINT(1)   NOT NULL DEFAULT 1,
  CONSTRAINT fk_almacen_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id),
  INDEX idx_almacen_sucursal (sucursal_id)
) ENGINE=InnoDB;

-- ============================================================================
-- 2. SEGURIDAD: USUARIOS, ROLES, PERMISOS, SESIONES, BITACORA
-- ============================================================================

CREATE TABLE rol (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(50)  NOT NULL UNIQUE,
  descripcion VARCHAR(200) NULL,
  -- los roles del sistema no se pueden borrar desde la UI
  es_sistema  TINYINT(1)   NOT NULL DEFAULT 0,
  activo      TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE permiso (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  codigo      VARCHAR(80)  NOT NULL UNIQUE,   -- ej: producto.crear
  modulo      VARCHAR(50)  NOT NULL,          -- ej: producto
  descripcion VARCHAR(200) NULL
) ENGINE=InnoDB;

CREATE TABLE rol_permiso (
  rol_id     INT NOT NULL,
  permiso_id INT NOT NULL,
  PRIMARY KEY (rol_id, permiso_id),
  CONSTRAINT fk_rp_rol     FOREIGN KEY (rol_id)     REFERENCES rol(id)     ON DELETE CASCADE,
  CONSTRAINT fk_rp_permiso FOREIGN KEY (permiso_id) REFERENCES permiso(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE usuario (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  rol_id         INT NOT NULL,
  -- un vendedor/almacenero pertenece a una sucursal; un cliente no
  sucursal_id    INT NULL,
  nombre         VARCHAR(80)  NOT NULL,
  apellido       VARCHAR(80)  NOT NULL,
  email          VARCHAR(120) NOT NULL UNIQUE,
  telefono       VARCHAR(30)  NULL,
  ci             VARCHAR(20)  NULL,
  password_hash  VARCHAR(255) NOT NULL,
  avatar_url     VARCHAR(255) NULL,
  email_verificado  TINYINT(1) NOT NULL DEFAULT 0,
  intentos_fallidos TINYINT   NOT NULL DEFAULT 0,
  bloqueado_hasta   DATETIME  NULL,
  ultimo_acceso  DATETIME     NULL,
  activo         TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_usuario_rol      FOREIGN KEY (rol_id)      REFERENCES rol(id),
  CONSTRAINT fk_usuario_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id),
  INDEX idx_usuario_rol (rol_id),
  INDEX idx_usuario_sucursal (sucursal_id)
) ENGINE=InnoDB;

-- Dispositivos registrados: necesarios para sincronizacion offline y push.
CREATE TABLE dispositivo (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT NULL,
  uuid        VARCHAR(64) NOT NULL UNIQUE,
  plataforma  ENUM('web','android','ios') NOT NULL,
  modelo      VARCHAR(80)  NULL,
  push_token  VARCHAR(255) NULL,
  ultima_sync DATETIME     NULL,
  creado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dispositivo_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id)
) ENGINE=InnoDB;

CREATE TABLE sesion (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario_id     INT NOT NULL,
  dispositivo_id INT NULL,
  -- se guarda el hash del refresh token, nunca el token en claro
  token_hash     CHAR(64)     NOT NULL UNIQUE,
  ip             VARCHAR(45)  NULL,
  user_agent     VARCHAR(255) NULL,
  expira_en      DATETIME     NOT NULL,
  revocado       TINYINT(1)   NOT NULL DEFAULT 0,
  creado_en      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sesion_usuario     FOREIGN KEY (usuario_id)     REFERENCES usuario(id) ON DELETE CASCADE,
  CONSTRAINT fk_sesion_dispositivo FOREIGN KEY (dispositivo_id) REFERENCES dispositivo(id),
  INDEX idx_sesion_usuario (usuario_id)
) ENGINE=InnoDB;

CREATE TABLE bitacora (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT NULL,
  accion        VARCHAR(40)  NOT NULL,   -- login, crear, actualizar, eliminar, exportar
  modulo        VARCHAR(50)  NOT NULL,
  entidad       VARCHAR(60)  NULL,
  entidad_id    VARCHAR(40)  NULL,
  descripcion   VARCHAR(255) NULL,
  datos_previos JSON NULL,
  datos_nuevos  JSON NULL,
  ip            VARCHAR(45)  NULL,
  user_agent    VARCHAR(255) NULL,
  creado_en     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bitacora_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id),
  INDEX idx_bitacora_usuario (usuario_id),
  INDEX idx_bitacora_fecha (creado_en),
  INDEX idx_bitacora_modulo (modulo, entidad, entidad_id)
) ENGINE=InnoDB;

-- ============================================================================
-- 3. CLIENTES, DIRECCIONES Y MEDIDAS CORPORALES
-- ============================================================================

CREATE TABLE cliente (
  usuario_id          INT PRIMARY KEY,
  tipo                ENUM('minorista','mayorista') NOT NULL DEFAULT 'minorista',
  nit                 VARCHAR(20)  NULL,
  razon_social        VARCHAR(150) NULL,
  -- solo aplica a mayoristas; se valida antes de habilitar precios de mayoreo
  mayorista_aprobado  TINYINT(1)   NOT NULL DEFAULT 0,
  descuento_extra     DECIMAL(5,2) NOT NULL DEFAULT 0,
  limite_credito      DECIMAL(12,2) NOT NULL DEFAULT 0,
  fecha_nacimiento    DATE NULL,
  puntos              INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_cliente_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE direccion_cliente (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id   INT NOT NULL,
  alias        VARCHAR(50)  NOT NULL,      -- Casa, Oficina
  ciudad_id    INT NOT NULL,
  direccion    VARCHAR(200) NOT NULL,
  referencia   VARCHAR(200) NULL,
  latitud      DECIMAL(10,7) NULL,
  longitud     DECIMAL(10,7) NULL,
  destinatario VARCHAR(120) NULL,
  telefono     VARCHAR(30)  NULL,
  es_principal TINYINT(1)   NOT NULL DEFAULT 0,
  activo       TINYINT(1)   NOT NULL DEFAULT 1,
  CONSTRAINT fk_dir_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(usuario_id) ON DELETE CASCADE,
  CONSTRAINT fk_dir_ciudad  FOREIGN KEY (ciudad_id)  REFERENCES ciudad(id),
  INDEX idx_dir_cliente (cliente_id)
) ENGINE=InnoDB;

-- Insumo del probador digital: de aqui salen el avatar y la talla recomendada.
CREATE TABLE medida_cliente (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id      INT NOT NULL,
  altura_cm       DECIMAL(5,1) NOT NULL,
  peso_kg         DECIMAL(5,1) NOT NULL,
  busto_cm        DECIMAL(5,1) NULL,
  cintura_cm      DECIMAL(5,1) NULL,
  cadera_cm       DECIMAL(5,1) NULL,
  entrepierna_cm  DECIMAL(5,1) NULL,
  hombro_cm       DECIMAL(5,1) NULL,
  -- si el cliente solo dio altura y peso, el resto se estima y se marca aqui
  origen          ENUM('manual','estimado','escaneo_camara') NOT NULL DEFAULT 'manual',
  actualizado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_medida_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(usuario_id) ON DELETE CASCADE,
  UNIQUE KEY uq_medida_cliente (cliente_id)
) ENGINE=InnoDB;

-- ============================================================================
-- 4. CATALOGO DE PRODUCTOS
-- ============================================================================

CREATE TABLE categoria (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  padre_id  INT NULL,                       -- jerarquia: Ropa > Vestidos > Casual
  nombre    VARCHAR(80)  NOT NULL,
  slug      VARCHAR(90)  NOT NULL UNIQUE,
  imagen    VARCHAR(255) NULL,
  orden     INT NOT NULL DEFAULT 0,
  activo    TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_categoria_padre FOREIGN KEY (padre_id) REFERENCES categoria(id),
  INDEX idx_categoria_padre (padre_id)
) ENGINE=InnoDB;

CREATE TABLE marca (
  id     INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE,
  slug   VARCHAR(90) NOT NULL UNIQUE,
  logo   VARCHAR(255) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE talla (
  id     INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(10) NOT NULL,             -- XS, S, M, L / 36, 38, 40
  tipo   ENUM('alfa','numerica','calzado','unica') NOT NULL DEFAULT 'alfa',
  orden  INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_talla (nombre, tipo)
) ENGINE=InnoDB;

CREATE TABLE color (
  id     INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(40) NOT NULL UNIQUE,
  hex    CHAR(7) NOT NULL                  -- #RRGGBB, se usa en el render del probador
) ENGINE=InnoDB;

CREATE TABLE producto (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  categoria_id  INT NOT NULL,
  marca_id      INT NULL,
  codigo        VARCHAR(30)  NOT NULL UNIQUE,
  nombre        VARCHAR(150) NOT NULL,
  slug          VARCHAR(170) NOT NULL UNIQUE,
  descripcion   TEXT NULL,
  material      VARCHAR(120) NULL,
  cuidados      VARCHAR(255) NULL,
  temporada     ENUM('verano','invierno','otono','primavera','todo_ano') NOT NULL DEFAULT 'todo_ano',
  tipo_prenda   ENUM('superior','inferior','vestido','abrigo','calzado','accesorio','ropa_interior') NOT NULL,
  destacado     TINYINT(1) NOT NULL DEFAULT 0,
  -- ranking simple para el buscador y el asistente IA
  vendidos      INT NOT NULL DEFAULT 0,
  calificacion  DECIMAL(3,2) NOT NULL DEFAULT 0,
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  creado_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_producto_categoria FOREIGN KEY (categoria_id) REFERENCES categoria(id),
  CONSTRAINT fk_producto_marca     FOREIGN KEY (marca_id)     REFERENCES marca(id),
  INDEX idx_producto_categoria (categoria_id),
  -- busqueda por texto libre del catalogo y del asistente IA
  FULLTEXT KEY ft_producto (nombre, descripcion, material)
) ENGINE=InnoDB;

CREATE TABLE producto_imagen (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  producto_id  INT NOT NULL,
  color_id     INT NULL,                    -- la galeria cambia segun el color elegido
  url          VARCHAR(255) NOT NULL,
  alt          VARCHAR(150) NULL,
  orden        INT NOT NULL DEFAULT 0,
  es_principal TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_img_producto FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE CASCADE,
  CONSTRAINT fk_img_color    FOREIGN KEY (color_id)    REFERENCES color(id),
  INDEX idx_img_producto (producto_id)
) ENGINE=InnoDB;

-- Recurso que consume el probador virtual / realidad aumentada.
CREATE TABLE producto_prenda_3d (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  producto_id   INT NOT NULL,
  color_id      INT NULL,
  url_glb       VARCHAR(255) NULL,          -- malla para el avatar 3D
  url_textura   VARCHAR(255) NULL,          -- PNG con alpha para el overlay de RA
  -- puntos de anclaje sobre el esqueleto detectado por la camara
  anclaje_json  JSON NULL,
  escala_base   DECIMAL(6,3) NOT NULL DEFAULT 1.000,
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_p3d_producto FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE CASCADE,
  CONSTRAINT fk_p3d_color    FOREIGN KEY (color_id)    REFERENCES color(id)
) ENGINE=InnoDB;

-- Variante = SKU vendible. Es la unidad real de stock y de precio.
CREATE TABLE variante (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  producto_id   INT NOT NULL,
  talla_id      INT NOT NULL,
  color_id      INT NOT NULL,
  sku           VARCHAR(40) NOT NULL UNIQUE,
  codigo_barras VARCHAR(40) NULL UNIQUE,
  precio_menor  DECIMAL(12,2) NOT NULL,
  precio_mayor  DECIMAL(12,2) NOT NULL,
  costo         DECIMAL(12,2) NOT NULL DEFAULT 0,
  peso_gr       INT NULL,
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_var_producto FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE CASCADE,
  CONSTRAINT fk_var_talla    FOREIGN KEY (talla_id)    REFERENCES talla(id),
  CONSTRAINT fk_var_color    FOREIGN KEY (color_id)    REFERENCES color(id),
  UNIQUE KEY uq_variante (producto_id, talla_id, color_id),
  INDEX idx_var_producto (producto_id)
) ENGINE=InnoDB;

-- Precio escalonado para venta al por mayor (a mas cantidad, menor precio).
CREATE TABLE escala_precio (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  variante_id     INT NOT NULL,
  cantidad_min    INT NOT NULL,
  precio_unitario DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_escala_variante FOREIGN KEY (variante_id) REFERENCES variante(id) ON DELETE CASCADE,
  UNIQUE KEY uq_escala (variante_id, cantidad_min)
) ENGINE=InnoDB;

-- Guia de tallas por categoria: base del calculo de talla recomendada.
CREATE TABLE guia_talla (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  categoria_id INT NOT NULL,
  talla_id     INT NOT NULL,
  busto_min    DECIMAL(5,1) NULL, busto_max   DECIMAL(5,1) NULL,
  cintura_min  DECIMAL(5,1) NULL, cintura_max DECIMAL(5,1) NULL,
  cadera_min   DECIMAL(5,1) NULL, cadera_max  DECIMAL(5,1) NULL,
  altura_min   DECIMAL(5,1) NULL, altura_max  DECIMAL(5,1) NULL,
  CONSTRAINT fk_guia_categoria FOREIGN KEY (categoria_id) REFERENCES categoria(id) ON DELETE CASCADE,
  CONSTRAINT fk_guia_talla     FOREIGN KEY (talla_id)     REFERENCES talla(id),
  UNIQUE KEY uq_guia (categoria_id, talla_id)
) ENGINE=InnoDB;

-- ============================================================================
-- 5. INVENTARIO MULTIALMACEN
-- ============================================================================

CREATE TABLE inventario (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  variante_id     INT NOT NULL,
  almacen_id      INT NOT NULL,
  stock           INT NOT NULL DEFAULT 0,
  -- reservado por pedidos online aun no despachados
  stock_reservado INT NOT NULL DEFAULT 0,
  stock_minimo    INT NOT NULL DEFAULT 0,
  ubicacion       VARCHAR(40) NULL,          -- pasillo/estante
  actualizado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inv_variante FOREIGN KEY (variante_id) REFERENCES variante(id) ON DELETE CASCADE,
  CONSTRAINT fk_inv_almacen  FOREIGN KEY (almacen_id)  REFERENCES almacen(id),
  UNIQUE KEY uq_inventario (variante_id, almacen_id),
  INDEX idx_inv_almacen (almacen_id),
  CONSTRAINT ck_inv_stock CHECK (stock >= 0 AND stock_reservado >= 0)
) ENGINE=InnoDB;

CREATE TABLE movimiento_inventario (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  variante_id       INT NOT NULL,
  almacen_id        INT NOT NULL,
  tipo              ENUM('entrada','salida','ajuste','transferencia_salida',
                         'transferencia_entrada','devolucion','reserva','liberacion') NOT NULL,
  cantidad          INT NOT NULL,            -- siempre positiva; el `tipo` da el signo
  stock_resultante  INT NOT NULL,
  referencia_tipo   VARCHAR(30) NULL,        -- pedido, compra, transferencia, devolucion
  referencia_id     BIGINT NULL,
  usuario_id        INT NULL,
  motivo            VARCHAR(200) NULL,
  creado_en         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mov_variante FOREIGN KEY (variante_id) REFERENCES variante(id),
  CONSTRAINT fk_mov_almacen  FOREIGN KEY (almacen_id)  REFERENCES almacen(id),
  CONSTRAINT fk_mov_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuario(id),
  INDEX idx_mov_variante (variante_id, creado_en),
  INDEX idx_mov_ref (referencia_tipo, referencia_id)
) ENGINE=InnoDB;

CREATE TABLE transferencia (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  numero              VARCHAR(20) NOT NULL UNIQUE,
  almacen_origen_id   INT NOT NULL,
  almacen_destino_id  INT NOT NULL,
  estado              ENUM('borrador','solicitada','aprobada','en_transito','recibida','rechazada') NOT NULL DEFAULT 'solicitada',
  usuario_solicita_id INT NOT NULL,
  usuario_aprueba_id  INT NULL,
  observacion         VARCHAR(255) NULL,
  creado_en           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recibido_en         DATETIME NULL,
  CONSTRAINT fk_tr_origen   FOREIGN KEY (almacen_origen_id)   REFERENCES almacen(id),
  CONSTRAINT fk_tr_destino  FOREIGN KEY (almacen_destino_id)  REFERENCES almacen(id),
  CONSTRAINT fk_tr_solicita FOREIGN KEY (usuario_solicita_id) REFERENCES usuario(id),
  CONSTRAINT fk_tr_aprueba  FOREIGN KEY (usuario_aprueba_id)  REFERENCES usuario(id)
) ENGINE=InnoDB;

CREATE TABLE transferencia_detalle (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  transferencia_id  BIGINT NOT NULL,
  variante_id       INT NOT NULL,
  cantidad          INT NOT NULL,
  cantidad_recibida INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_trd_transferencia FOREIGN KEY (transferencia_id) REFERENCES transferencia(id) ON DELETE CASCADE,
  CONSTRAINT fk_trd_variante      FOREIGN KEY (variante_id)      REFERENCES variante(id)
) ENGINE=InnoDB;

-- ============================================================================
-- 6. COMPRAS A PROVEEDORES (reabastecimiento)
-- ============================================================================

CREATE TABLE proveedor (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(150) NOT NULL,
  nit       VARCHAR(20)  NULL,
  contacto  VARCHAR(120) NULL,
  telefono  VARCHAR(30)  NULL,
  email     VARCHAR(120) NULL,
  direccion VARCHAR(200) NULL,
  activo    TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE compra (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  numero       VARCHAR(20) NOT NULL UNIQUE,
  proveedor_id INT NOT NULL,
  almacen_id   INT NOT NULL,
  usuario_id   INT NOT NULL,
  fecha        DATE NOT NULL,
  subtotal     DECIMAL(12,2) NOT NULL DEFAULT 0,
  descuento    DECIMAL(12,2) NOT NULL DEFAULT 0,
  total        DECIMAL(12,2) NOT NULL DEFAULT 0,
  estado       ENUM('borrador','confirmada','recibida','anulada') NOT NULL DEFAULT 'borrador',
  creado_en    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_compra_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedor(id),
  CONSTRAINT fk_compra_almacen   FOREIGN KEY (almacen_id)   REFERENCES almacen(id),
  CONSTRAINT fk_compra_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuario(id)
) ENGINE=InnoDB;

CREATE TABLE compra_detalle (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  compra_id      BIGINT NOT NULL,
  variante_id    INT NOT NULL,
  cantidad       INT NOT NULL,
  costo_unitario DECIMAL(12,2) NOT NULL,
  subtotal       DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_cd_compra   FOREIGN KEY (compra_id)   REFERENCES compra(id) ON DELETE CASCADE,
  CONSTRAINT fk_cd_variante FOREIGN KEY (variante_id) REFERENCES variante(id)
) ENGINE=InnoDB;

-- ============================================================================
-- 7. CAMPANAS Y PROMOCIONES
-- ============================================================================

CREATE TABLE campania (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  nombre       VARCHAR(120) NOT NULL,
  descripcion  VARCHAR(255) NULL,
  tipo         ENUM('temporada','liquidacion','lanzamiento','black_friday','cierre') NOT NULL,
  banner_url   VARCHAR(255) NULL,
  fecha_inicio DATETIME NOT NULL,
  fecha_fin    DATETIME NOT NULL,
  activo       TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE promocion (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  campania_id   INT NULL,
  nombre        VARCHAR(120) NOT NULL,
  tipo          ENUM('porcentaje','monto_fijo','2x1','envio_gratis') NOT NULL,
  valor         DECIMAL(12,2) NOT NULL DEFAULT 0,
  codigo_cupon  VARCHAR(30) NULL UNIQUE,
  min_compra    DECIMAL(12,2) NOT NULL DEFAULT 0,
  aplica_a      ENUM('todo','categoria','producto','variante') NOT NULL DEFAULT 'todo',
  aplica_id     INT NULL,
  -- limita la promo a un canal o modalidad (ej: solo mayoreo, solo online)
  canal         ENUM('todos','online','tienda') NOT NULL DEFAULT 'todos',
  modalidad     ENUM('todas','menudeo','mayoreo') NOT NULL DEFAULT 'todas',
  usos_max      INT NULL,
  usos_actuales INT NOT NULL DEFAULT 0,
  fecha_inicio  DATETIME NOT NULL,
  fecha_fin     DATETIME NOT NULL,
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_promo_campania FOREIGN KEY (campania_id) REFERENCES campania(id)
) ENGINE=InnoDB;

-- ============================================================================
-- 8. CARRITO, PEDIDOS Y VENTAS (online + mostrador)
-- ============================================================================

CREATE TABLE carrito (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  cliente_id     INT NULL,                  -- NULL = invitado
  session_token  CHAR(64) NOT NULL UNIQUE,  -- permite carrito anonimo y offline
  creado_en      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_carrito_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(usuario_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE carrito_item (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  carrito_id      BIGINT NOT NULL,
  variante_id     INT NOT NULL,
  cantidad        INT NOT NULL DEFAULT 1,
  precio_unitario DECIMAL(12,2) NOT NULL,
  agregado_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ci_carrito  FOREIGN KEY (carrito_id)  REFERENCES carrito(id) ON DELETE CASCADE,
  CONSTRAINT fk_ci_variante FOREIGN KEY (variante_id) REFERENCES variante(id),
  UNIQUE KEY uq_carrito_item (carrito_id, variante_id)
) ENGINE=InnoDB;

CREATE TABLE pedido (
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  numero             VARCHAR(20) NOT NULL UNIQUE,
  cliente_id         INT NULL,               -- NULL en venta de mostrador sin registro
  sucursal_id        INT NOT NULL,
  almacen_id         INT NOT NULL,           -- de donde sale la mercaderia
  vendedor_id        INT NULL,               -- usuario que atendio (venta en tienda)
  canal              ENUM('online','tienda') NOT NULL,
  modalidad          ENUM('menudeo','mayoreo') NOT NULL DEFAULT 'menudeo',
  tipo_entrega       ENUM('inmediata','recojo_tienda','domicilio') NOT NULL DEFAULT 'inmediata',
  estado             ENUM('pendiente','pagado','preparando','listo','enviado',
                          'entregado','cancelado','devuelto') NOT NULL DEFAULT 'pendiente',
  direccion_id       INT NULL,
  promocion_id       INT NULL,
  subtotal           DECIMAL(12,2) NOT NULL DEFAULT 0,
  descuento          DECIMAL(12,2) NOT NULL DEFAULT 0,
  costo_envio        DECIMAL(12,2) NOT NULL DEFAULT 0,
  total              DECIMAL(12,2) NOT NULL DEFAULT 0,
  moneda             CHAR(3) NOT NULL DEFAULT 'BOB',
  nota               VARCHAR(255) NULL,
  -- Sincronizacion offline: la clave la genera el cliente y el servidor la usa
  -- para que un mismo pedido reenviado no se registre dos veces.
  idempotency_key    CHAR(36) NULL UNIQUE,
  creado_offline     TINYINT(1) NOT NULL DEFAULT 0,
  creado_en_cliente  DATETIME NULL,          -- hora real en que se hizo la venta sin red
  creado_en          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pedido_cliente   FOREIGN KEY (cliente_id)   REFERENCES cliente(usuario_id),
  CONSTRAINT fk_pedido_sucursal  FOREIGN KEY (sucursal_id)  REFERENCES sucursal(id),
  CONSTRAINT fk_pedido_almacen   FOREIGN KEY (almacen_id)   REFERENCES almacen(id),
  CONSTRAINT fk_pedido_vendedor  FOREIGN KEY (vendedor_id)  REFERENCES usuario(id),
  CONSTRAINT fk_pedido_direccion FOREIGN KEY (direccion_id) REFERENCES direccion_cliente(id),
  CONSTRAINT fk_pedido_promocion FOREIGN KEY (promocion_id) REFERENCES promocion(id),
  INDEX idx_pedido_fecha (creado_en),
  INDEX idx_pedido_sucursal_fecha (sucursal_id, creado_en),
  INDEX idx_pedido_estado (estado),
  INDEX idx_pedido_cliente (cliente_id)
) ENGINE=InnoDB;

CREATE TABLE pedido_detalle (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  pedido_id       BIGINT NOT NULL,
  variante_id     INT NOT NULL,
  -- se congela la descripcion por si el producto cambia de nombre despues
  descripcion     VARCHAR(200) NOT NULL,
  cantidad        INT NOT NULL,
  precio_unitario DECIMAL(12,2) NOT NULL,
  descuento       DECIMAL(12,2) NOT NULL DEFAULT 0,
  subtotal        DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_pd_pedido   FOREIGN KEY (pedido_id)   REFERENCES pedido(id) ON DELETE CASCADE,
  CONSTRAINT fk_pd_variante FOREIGN KEY (variante_id) REFERENCES variante(id),
  INDEX idx_pd_pedido (pedido_id),
  INDEX idx_pd_variante (variante_id)
) ENGINE=InnoDB;

CREATE TABLE pedido_historial (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  pedido_id  BIGINT NOT NULL,
  estado     VARCHAR(20) NOT NULL,
  usuario_id INT NULL,
  comentario VARCHAR(255) NULL,
  creado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ph_pedido  FOREIGN KEY (pedido_id)  REFERENCES pedido(id) ON DELETE CASCADE,
  CONSTRAINT fk_ph_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id)
) ENGINE=InnoDB;

-- ============================================================================
-- 9. PAGOS Y CAJA
-- ============================================================================

CREATE TABLE metodo_pago (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  codigo               VARCHAR(30) NOT NULL UNIQUE,
  nombre               VARCHAR(60) NOT NULL,
  tipo                 ENUM('efectivo','qr','tarjeta','transferencia','contra_entrega') NOT NULL,
  requiere_comprobante TINYINT(1) NOT NULL DEFAULT 0,
  -- si es 0, el metodo no se ofrece cuando el dispositivo esta sin red
  disponible_offline   TINYINT(1) NOT NULL DEFAULT 0,
  canal                ENUM('todos','online','tienda') NOT NULL DEFAULT 'todos',
  activo               TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE pago (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  pedido_id           BIGINT NOT NULL,
  metodo_pago_id      INT NOT NULL,
  monto               DECIMAL(12,2) NOT NULL,
  moneda              CHAR(3) NOT NULL DEFAULT 'BOB',
  estado              ENUM('pendiente','confirmado','rechazado','reembolsado') NOT NULL DEFAULT 'pendiente',
  referencia_externa  VARCHAR(120) NULL,      -- id de transaccion de la pasarela
  qr_payload          TEXT NULL,              -- cadena EMV del QR generado
  comprobante_url     VARCHAR(255) NULL,
  usuario_confirma_id INT NULL,
  idempotency_key     CHAR(36) NULL UNIQUE,
  creado_en           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmado_en       DATETIME NULL,
  CONSTRAINT fk_pago_pedido  FOREIGN KEY (pedido_id)      REFERENCES pedido(id) ON DELETE CASCADE,
  CONSTRAINT fk_pago_metodo  FOREIGN KEY (metodo_pago_id) REFERENCES metodo_pago(id),
  CONSTRAINT fk_pago_usuario FOREIGN KEY (usuario_confirma_id) REFERENCES usuario(id),
  INDEX idx_pago_pedido (pedido_id)
) ENGINE=InnoDB;

CREATE TABLE caja (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  sucursal_id    INT NOT NULL,
  usuario_id     INT NOT NULL,
  monto_apertura DECIMAL(12,2) NOT NULL DEFAULT 0,
  monto_cierre   DECIMAL(12,2) NULL,
  monto_esperado DECIMAL(12,2) NULL,
  diferencia     DECIMAL(12,2) NULL,
  estado         ENUM('abierta','cerrada') NOT NULL DEFAULT 'abierta',
  abierta_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrada_en     DATETIME NULL,
  CONSTRAINT fk_caja_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id),
  CONSTRAINT fk_caja_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuario(id)
) ENGINE=InnoDB;

CREATE TABLE movimiento_caja (
  id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  caja_id   BIGINT NOT NULL,
  tipo      ENUM('ingreso','egreso') NOT NULL,
  monto     DECIMAL(12,2) NOT NULL,
  concepto  VARCHAR(150) NOT NULL,
  pago_id   BIGINT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mc_caja FOREIGN KEY (caja_id) REFERENCES caja(id) ON DELETE CASCADE,
  CONSTRAINT fk_mc_pago FOREIGN KEY (pago_id) REFERENCES pago(id)
) ENGINE=InnoDB;

-- ============================================================================
-- 10. ENVIOS Y DEVOLUCIONES
-- ============================================================================

CREATE TABLE envio (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  pedido_id      BIGINT NOT NULL UNIQUE,
  direccion_id   INT NULL,
  repartidor_id  INT NULL,
  empresa        VARCHAR(80) NULL,
  tracking       VARCHAR(80) NULL,
  estado         ENUM('preparando','en_ruta','entregado','fallido','devuelto') NOT NULL DEFAULT 'preparando',
  costo          DECIMAL(12,2) NOT NULL DEFAULT 0,
  fecha_estimada DATE NULL,
  entregado_en   DATETIME NULL,
  evidencia_url  VARCHAR(255) NULL,
  CONSTRAINT fk_envio_pedido     FOREIGN KEY (pedido_id)     REFERENCES pedido(id) ON DELETE CASCADE,
  CONSTRAINT fk_envio_direccion  FOREIGN KEY (direccion_id)  REFERENCES direccion_cliente(id),
  CONSTRAINT fk_envio_repartidor FOREIGN KEY (repartidor_id) REFERENCES usuario(id)
) ENGINE=InnoDB;

CREATE TABLE devolucion (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  numero              VARCHAR(20) NOT NULL UNIQUE,
  pedido_id           BIGINT NOT NULL,
  cliente_id          INT NULL,
  motivo              ENUM('talla_incorrecta','defecto','no_coincide','arrepentimiento','otro') NOT NULL,
  detalle             VARCHAR(255) NULL,
  estado              ENUM('solicitada','aprobada','rechazada','recibida','reembolsada') NOT NULL DEFAULT 'solicitada',
  monto_reembolso     DECIMAL(12,2) NOT NULL DEFAULT 0,
  usuario_gestiona_id INT NULL,
  creado_en           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrado_en          DATETIME NULL,
  CONSTRAINT fk_dev_pedido  FOREIGN KEY (pedido_id)  REFERENCES pedido(id),
  CONSTRAINT fk_dev_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(usuario_id),
  CONSTRAINT fk_dev_usuario FOREIGN KEY (usuario_gestiona_id) REFERENCES usuario(id)
) ENGINE=InnoDB;

CREATE TABLE devolucion_detalle (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  devolucion_id     BIGINT NOT NULL,
  pedido_detalle_id BIGINT NOT NULL,
  variante_id       INT NOT NULL,
  cantidad          INT NOT NULL,
  estado_prenda     ENUM('nueva','usada','danada') NOT NULL DEFAULT 'nueva',
  reingresa_stock   TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_dd_devolucion FOREIGN KEY (devolucion_id)     REFERENCES devolucion(id) ON DELETE CASCADE,
  CONSTRAINT fk_dd_detalle    FOREIGN KEY (pedido_detalle_id) REFERENCES pedido_detalle(id),
  CONSTRAINT fk_dd_variante   FOREIGN KEY (variante_id)       REFERENCES variante(id)
) ENGINE=InnoDB;

-- ============================================================================
-- 11. PROBADOR DIGITAL + REALIDAD AUMENTADA
-- ============================================================================

CREATE TABLE avatar (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id     INT NOT NULL UNIQUE,
  tipo_cuerpo    ENUM('reloj_arena','triangulo','triangulo_invertido','rectangulo','ovalado') NULL,
  -- proporciones normalizadas que consume el render del avatar en el navegador
  parametros     JSON NOT NULL,
  url_render     VARCHAR(255) NULL,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_avatar_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(usuario_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE prueba_virtual (
  id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
  cliente_id           INT NULL,
  session_token        CHAR(64) NULL,          -- permite probar sin estar logueado
  variante_id          INT NOT NULL,
  modo                 ENUM('avatar','ra_camara') NOT NULL,
  talla_recomendada_id INT NULL,
  -- que tan bien le queda segun las medidas: -2 muy chica ... +2 muy grande
  ajuste               TINYINT NULL,
  captura_url          VARCHAR(255) NULL,
  duracion_seg         INT NULL,
  convirtio_en_compra  TINYINT(1) NOT NULL DEFAULT 0,
  creado_en            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pv_cliente  FOREIGN KEY (cliente_id)  REFERENCES cliente(usuario_id),
  CONSTRAINT fk_pv_variante FOREIGN KEY (variante_id) REFERENCES variante(id),
  CONSTRAINT fk_pv_talla    FOREIGN KEY (talla_recomendada_id) REFERENCES talla(id),
  INDEX idx_pv_variante (variante_id),
  INDEX idx_pv_fecha (creado_en)
) ENGINE=InnoDB;

-- Retroalimentacion real: sirve para corregir la recomendacion de tallas.
CREATE TABLE resena (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  producto_id       INT NOT NULL,
  cliente_id        INT NOT NULL,
  pedido_id         BIGINT NULL,
  calificacion      TINYINT NOT NULL,
  comentario        VARCHAR(500) NULL,
  talla_comprada_id INT NULL,
  ajuste_real       ENUM('pequena','justa','grande') NULL,
  aprobado          TINYINT(1) NOT NULL DEFAULT 0,
  creado_en         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_res_producto FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE CASCADE,
  CONSTRAINT fk_res_cliente  FOREIGN KEY (cliente_id)  REFERENCES cliente(usuario_id),
  CONSTRAINT fk_res_pedido   FOREIGN KEY (pedido_id)   REFERENCES pedido(id),
  CONSTRAINT fk_res_talla    FOREIGN KEY (talla_comprada_id) REFERENCES talla(id),
  CONSTRAINT ck_res_calif CHECK (calificacion BETWEEN 1 AND 5),
  UNIQUE KEY uq_resena (producto_id, cliente_id, pedido_id)
) ENGINE=InnoDB;

-- ============================================================================
-- 12. ASISTENTE IA Y REPORTES BAJO DEMANDA
-- ============================================================================

CREATE TABLE conversacion (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario_id     INT NULL,                    -- NULL = visitante anonimo
  session_token  CHAR(64) NOT NULL,
  canal          ENUM('web','movil','pos') NOT NULL DEFAULT 'web',
  -- asistente_compra = cliente pregunta por ropa; reporte = staff pide datos
  tipo           ENUM('asistente_compra','reporte','soporte') NOT NULL DEFAULT 'asistente_compra',
  titulo         VARCHAR(150) NULL,
  creado_en      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_conv_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id),
  INDEX idx_conv_session (session_token)
) ENGINE=InnoDB;

CREATE TABLE mensaje (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversacion_id BIGINT NOT NULL,
  rol             ENUM('usuario','asistente','sistema','herramienta') NOT NULL,
  contenido       MEDIUMTEXT NULL,
  -- cuando el modelo llama a una funcion del backend queda registrado aqui
  herramienta     VARCHAR(60) NULL,
  payload         JSON NULL,
  -- entrada por voz: se guarda la transcripcion y el audio original
  audio_url       VARCHAR(255) NULL,
  tokens_entrada  INT NULL,
  tokens_salida   INT NULL,
  latencia_ms     INT NULL,
  creado_en       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_msg_conversacion FOREIGN KEY (conversacion_id) REFERENCES conversacion(id) ON DELETE CASCADE,
  INDEX idx_msg_conv (conversacion_id, creado_en)
) ENGINE=InnoDB;

-- Reportes bajo demanda: "ventas de la sucursal X de tal hora a tal hora".
-- El modelo NO escribe SQL libre: elige una plantilla y devuelve sus parametros.
CREATE TABLE plantilla_reporte (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  codigo         VARCHAR(60) NOT NULL UNIQUE,
  nombre         VARCHAR(120) NOT NULL,
  descripcion    VARCHAR(255) NULL,
  -- SQL con marcadores :param, validado por el backend antes de ejecutar
  sql_plantilla  TEXT NOT NULL,
  -- esquema JSON de los parametros que el modelo debe completar
  parametros     JSON NOT NULL,
  permiso_id     INT NULL,
  visual_default ENUM('tabla','barras','lineas','torta','tarjeta') NOT NULL DEFAULT 'tabla',
  activo         TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_plantilla_permiso FOREIGN KEY (permiso_id) REFERENCES permiso(id)
) ENGINE=InnoDB;

CREATE TABLE consulta_reporte (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversacion_id BIGINT NULL,
  usuario_id      INT NOT NULL,
  plantilla_id    INT NULL,
  pregunta        TEXT NOT NULL,
  entrada         ENUM('texto','voz') NOT NULL DEFAULT 'texto',
  parametros      JSON NULL,
  sql_ejecutado   TEXT NULL,
  filas           INT NULL,
  exito           TINYINT(1) NOT NULL DEFAULT 1,
  error           VARCHAR(255) NULL,
  duracion_ms     INT NULL,
  creado_en       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cr_conversacion FOREIGN KEY (conversacion_id) REFERENCES conversacion(id),
  CONSTRAINT fk_cr_usuario      FOREIGN KEY (usuario_id)      REFERENCES usuario(id),
  CONSTRAINT fk_cr_plantilla    FOREIGN KEY (plantilla_id)    REFERENCES plantilla_reporte(id),
  INDEX idx_cr_usuario (usuario_id, creado_en)
) ENGINE=InnoDB;

-- ============================================================================
-- 13. SINCRONIZACION OFFLINE (PWA + Flutter)
-- ============================================================================

-- Bandeja de entrada del servidor: cada operacion hecha sin red llega aqui una
-- sola vez gracias a idempotency_key, y se aplica en orden por dispositivo.
CREATE TABLE sync_operacion (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  dispositivo_id    INT NOT NULL,
  usuario_id        INT NULL,
  idempotency_key   CHAR(36) NOT NULL UNIQUE,
  entidad           VARCHAR(40) NOT NULL,    -- pedido, pago, inventario, carrito
  operacion         ENUM('crear','actualizar','eliminar') NOT NULL,
  payload           JSON NOT NULL,
  estado            ENUM('pendiente','aplicado','conflicto','rechazado') NOT NULL DEFAULT 'pendiente',
  resultado         JSON NULL,
  error             VARCHAR(255) NULL,
  creado_en_cliente DATETIME NOT NULL,
  recibido_en       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  procesado_en      DATETIME NULL,
  CONSTRAINT fk_sync_dispositivo FOREIGN KEY (dispositivo_id) REFERENCES dispositivo(id),
  CONSTRAINT fk_sync_usuario     FOREIGN KEY (usuario_id)     REFERENCES usuario(id),
  INDEX idx_sync_estado (estado, recibido_en)
) ENGINE=InnoDB;

CREATE TABLE notificacion (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  titulo     VARCHAR(120) NOT NULL,
  mensaje    VARCHAR(255) NOT NULL,
  tipo       ENUM('pedido','stock','promocion','sistema','devolucion') NOT NULL,
  url        VARCHAR(255) NULL,
  leida      TINYINT(1) NOT NULL DEFAULT 0,
  creado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
  INDEX idx_notif_usuario (usuario_id, leida)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- VISTAS DE APOYO PARA REPORTES
-- ============================================================================

-- Stock consolidado por variante y sucursal (suma de todos sus almacenes).
CREATE OR REPLACE VIEW v_stock_sucursal AS
SELECT s.id  AS sucursal_id, s.nombre AS sucursal,
       v.id  AS variante_id, v.sku,
       p.id  AS producto_id, p.nombre AS producto,
       t.nombre AS talla, c.nombre AS color,
       SUM(i.stock)           AS stock_total,
       SUM(i.stock_reservado) AS reservado,
       SUM(i.stock - i.stock_reservado) AS disponible
FROM inventario i
JOIN almacen  a ON a.id = i.almacen_id
JOIN sucursal s ON s.id = a.sucursal_id
JOIN variante v ON v.id = i.variante_id
JOIN producto p ON p.id = v.producto_id
JOIN talla    t ON t.id = v.talla_id
JOIN color    c ON c.id = v.color_id
GROUP BY s.id, s.nombre, v.id, v.sku, p.id, p.nombre, t.nombre, c.nombre;

-- Base de los reportes de venta: una fila por linea vendida y no anulada.
CREATE OR REPLACE VIEW v_ventas_detalle AS
SELECT pe.id AS pedido_id, pe.numero, pe.creado_en, pe.canal, pe.modalidad, pe.estado,
       pe.sucursal_id, s.nombre AS sucursal, d.nombre AS departamento,
       pe.vendedor_id, pe.cliente_id,
       pd.variante_id, v.sku, pr.id AS producto_id, pr.nombre AS producto,
       cat.id AS categoria_id, cat.nombre AS categoria,
       pd.cantidad, pd.precio_unitario, pd.subtotal
FROM pedido pe
JOIN pedido_detalle pd ON pd.pedido_id = pe.id
JOIN variante  v   ON v.id  = pd.variante_id
JOIN producto  pr  ON pr.id = v.producto_id
JOIN categoria cat ON cat.id = pr.categoria_id
JOIN sucursal  s   ON s.id  = pe.sucursal_id
JOIN ciudad    ci  ON ci.id = s.ciudad_id
JOIN departamento d ON d.id = ci.departamento_id
WHERE pe.estado NOT IN ('cancelado','pendiente');
