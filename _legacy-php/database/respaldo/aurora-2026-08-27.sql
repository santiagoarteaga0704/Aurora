-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: aurora
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `aurora`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `aurora` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `aurora`;

--
-- Table structure for table `almacen`
--

DROP TABLE IF EXISTS `almacen`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `almacen` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sucursal_id` int(11) NOT NULL,
  `codigo` varchar(20) NOT NULL,
  `nombre` varchar(120) NOT NULL,
  `tipo` enum('venta','deposito','devoluciones','transito') NOT NULL DEFAULT 'venta',
  `es_principal` tinyint(1) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`),
  KEY `idx_almacen_sucursal` (`sucursal_id`),
  CONSTRAINT `fk_almacen_sucursal` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursal` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `almacen`
--

LOCK TABLES `almacen` WRITE;
/*!40000 ALTER TABLE `almacen` DISABLE KEYS */;
INSERT INTO `almacen` VALUES (1,1,'A-SC-CENTRO-V','Piso de venta Centro','venta',1,1),(2,1,'A-SC-CENTRO-D','Deposito Centro','deposito',0,1),(3,2,'A-SC-VENT-V','Piso de venta Ventura','venta',1,1),(4,3,'A-LP-SOPO-V','Piso de venta Sopocachi','venta',1,1),(5,3,'A-LP-SOPO-D','Deposito Sopocachi','deposito',0,1),(6,4,'A-CB-RECO-V','Piso de venta Recoleta','venta',1,1),(7,5,'A-CD-NAC','Almacen central','deposito',1,1),(8,5,'A-CD-DEV','Devoluciones nacionales','devoluciones',0,1);
/*!40000 ALTER TABLE `almacen` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `avatar`
--

DROP TABLE IF EXISTS `avatar`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `avatar` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `cliente_id` int(11) NOT NULL,
  `tipo_cuerpo` enum('reloj_arena','triangulo','triangulo_invertido','rectangulo','ovalado') DEFAULT NULL,
  `parametros` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`parametros`)),
  `url_render` varchar(255) DEFAULT NULL,
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cliente_id` (`cliente_id`),
  CONSTRAINT `fk_avatar_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `cliente` (`usuario_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `avatar`
--

LOCK TABLES `avatar` WRITE;
/*!40000 ALTER TABLE `avatar` DISABLE KEYS */;
/*!40000 ALTER TABLE `avatar` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bitacora`
--

DROP TABLE IF EXISTS `bitacora`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `bitacora` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) DEFAULT NULL,
  `accion` varchar(40) NOT NULL,
  `modulo` varchar(50) NOT NULL,
  `entidad` varchar(60) DEFAULT NULL,
  `entidad_id` varchar(40) DEFAULT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `datos_previos` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`datos_previos`)),
  `datos_nuevos` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`datos_nuevos`)),
  `ip` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_bitacora_usuario` (`usuario_id`),
  KEY `idx_bitacora_fecha` (`creado_en`),
  KEY `idx_bitacora_modulo` (`modulo`,`entidad`,`entidad_id`),
  CONSTRAINT `fk_bitacora_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bitacora`
--

LOCK TABLES `bitacora` WRITE;
/*!40000 ALTER TABLE `bitacora` DISABLE KEYS */;
INSERT INTO `bitacora` VALUES (1,NULL,'login','auth','usuario','1','Inicio de sesion',NULL,NULL,'::1','curl/8.16.0','2026-08-28 00:10:55'),(2,NULL,'login_fallido','auth','usuario','1','admin@aurora.bo',NULL,NULL,'::1','curl/8.16.0','2026-08-28 00:10:55'),(3,NULL,'login','auth','usuario','1','Inicio de sesion',NULL,NULL,'::1','curl/8.16.0','2026-08-28 00:11:03');
/*!40000 ALTER TABLE `bitacora` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `caja`
--

DROP TABLE IF EXISTS `caja`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `caja` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `sucursal_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `monto_apertura` decimal(12,2) NOT NULL DEFAULT 0.00,
  `monto_cierre` decimal(12,2) DEFAULT NULL,
  `monto_esperado` decimal(12,2) DEFAULT NULL,
  `diferencia` decimal(12,2) DEFAULT NULL,
  `estado` enum('abierta','cerrada') NOT NULL DEFAULT 'abierta',
  `abierta_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `cerrada_en` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_caja_sucursal` (`sucursal_id`),
  KEY `fk_caja_usuario` (`usuario_id`),
  CONSTRAINT `fk_caja_sucursal` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursal` (`id`),
  CONSTRAINT `fk_caja_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `caja`
--

LOCK TABLES `caja` WRITE;
/*!40000 ALTER TABLE `caja` DISABLE KEYS */;
/*!40000 ALTER TABLE `caja` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `campania`
--

DROP TABLE IF EXISTS `campania`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `campania` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(120) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `tipo` enum('temporada','liquidacion','lanzamiento','black_friday','cierre') NOT NULL,
  `banner_url` varchar(255) DEFAULT NULL,
  `fecha_inicio` datetime NOT NULL,
  `fecha_fin` datetime NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `campania`
--

LOCK TABLES `campania` WRITE;
/*!40000 ALTER TABLE `campania` DISABLE KEYS */;
/*!40000 ALTER TABLE `campania` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `carrito`
--

DROP TABLE IF EXISTS `carrito`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `carrito` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `cliente_id` int(11) DEFAULT NULL,
  `session_token` char(64) NOT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `session_token` (`session_token`),
  KEY `fk_carrito_cliente` (`cliente_id`),
  CONSTRAINT `fk_carrito_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `cliente` (`usuario_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `carrito`
--

LOCK TABLES `carrito` WRITE;
/*!40000 ALTER TABLE `carrito` DISABLE KEYS */;
/*!40000 ALTER TABLE `carrito` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `carrito_item`
--

DROP TABLE IF EXISTS `carrito_item`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `carrito_item` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `carrito_id` bigint(20) NOT NULL,
  `variante_id` int(11) NOT NULL,
  `cantidad` int(11) NOT NULL DEFAULT 1,
  `precio_unitario` decimal(12,2) NOT NULL,
  `agregado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_carrito_item` (`carrito_id`,`variante_id`),
  KEY `fk_ci_variante` (`variante_id`),
  CONSTRAINT `fk_ci_carrito` FOREIGN KEY (`carrito_id`) REFERENCES `carrito` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ci_variante` FOREIGN KEY (`variante_id`) REFERENCES `variante` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `carrito_item`
--

LOCK TABLES `carrito_item` WRITE;
/*!40000 ALTER TABLE `carrito_item` DISABLE KEYS */;
/*!40000 ALTER TABLE `carrito_item` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `categoria`
--

DROP TABLE IF EXISTS `categoria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `categoria` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `padre_id` int(11) DEFAULT NULL,
  `nombre` varchar(80) NOT NULL,
  `slug` varchar(90) NOT NULL,
  `imagen` varchar(255) DEFAULT NULL,
  `orden` int(11) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `idx_categoria_padre` (`padre_id`),
  CONSTRAINT `fk_categoria_padre` FOREIGN KEY (`padre_id`) REFERENCES `categoria` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `categoria`
--

LOCK TABLES `categoria` WRITE;
/*!40000 ALTER TABLE `categoria` DISABLE KEYS */;
INSERT INTO `categoria` VALUES (1,NULL,'Ropa','ropa',NULL,1,1),(2,1,'Vestidos','vestidos',NULL,1,1),(3,1,'Blusas y tops','blusas-y-tops',NULL,2,1),(4,1,'Pantalones','pantalones',NULL,3,1),(5,1,'Faldas','faldas',NULL,4,1),(6,1,'Abrigos y chaquetas','abrigos-y-chaquetas',NULL,5,1),(7,1,'Ropa deportiva','ropa-deportiva',NULL,6,1),(8,NULL,'Calzado','calzado',NULL,2,1),(9,8,'Zapatos','zapatos',NULL,1,1),(10,8,'Zapatillas','zapatillas',NULL,2,1),(11,NULL,'Accesorios','accesorios',NULL,3,1),(12,11,'Carteras','carteras',NULL,1,1),(13,11,'Bisuteria','bisuteria',NULL,2,1);
/*!40000 ALTER TABLE `categoria` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ciudad`
--

DROP TABLE IF EXISTS `ciudad`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ciudad` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `departamento_id` int(11) NOT NULL,
  `nombre` varchar(80) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ciudad` (`departamento_id`,`nombre`),
  CONSTRAINT `fk_ciudad_depto` FOREIGN KEY (`departamento_id`) REFERENCES `departamento` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ciudad`
--

LOCK TABLES `ciudad` WRITE;
/*!40000 ALTER TABLE `ciudad` DISABLE KEYS */;
INSERT INTO `ciudad` VALUES (1,1,'Santa Cruz de la Sierra',1),(2,1,'Montero',1),(3,1,'Warnes',1),(4,2,'La Paz',1),(5,2,'El Alto',1),(6,3,'Cochabamba',1),(7,3,'Quillacollo',1),(8,4,'Oruro',1),(9,5,'Potosi',1),(10,6,'Sucre',1),(11,7,'Tarija',1),(12,8,'Trinidad',1),(13,9,'Cobija',1);
/*!40000 ALTER TABLE `ciudad` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cliente`
--

DROP TABLE IF EXISTS `cliente`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cliente` (
  `usuario_id` int(11) NOT NULL,
  `tipo` enum('minorista','mayorista') NOT NULL DEFAULT 'minorista',
  `nit` varchar(20) DEFAULT NULL,
  `razon_social` varchar(150) DEFAULT NULL,
  `mayorista_aprobado` tinyint(1) NOT NULL DEFAULT 0,
  `descuento_extra` decimal(5,2) NOT NULL DEFAULT 0.00,
  `limite_credito` decimal(12,2) NOT NULL DEFAULT 0.00,
  `fecha_nacimiento` date DEFAULT NULL,
  `puntos` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`usuario_id`),
  CONSTRAINT `fk_cliente_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cliente`
--

LOCK TABLES `cliente` WRITE;
/*!40000 ALTER TABLE `cliente` DISABLE KEYS */;
/*!40000 ALTER TABLE `cliente` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `color`
--

DROP TABLE IF EXISTS `color`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `color` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(40) NOT NULL,
  `hex` char(7) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `color`
--

LOCK TABLES `color` WRITE;
/*!40000 ALTER TABLE `color` DISABLE KEYS */;
INSERT INTO `color` VALUES (1,'Negro','#111111'),(2,'Blanco','#FFFFFF'),(3,'Beige','#E8DCC8'),(4,'Rojo','#C1272D'),(5,'Azul marino','#1B2A4A'),(6,'Verde oliva','#6B705C'),(7,'Rosa palo','#E8B4B8'),(8,'Camel','#B98A5B'),(9,'Gris jaspeado','#9A9A9A'),(10,'Estampado floral','#D9A7B0');
/*!40000 ALTER TABLE `color` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `compra`
--

DROP TABLE IF EXISTS `compra`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `compra` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `numero` varchar(20) NOT NULL,
  `proveedor_id` int(11) NOT NULL,
  `almacen_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `fecha` date NOT NULL,
  `subtotal` decimal(12,2) NOT NULL DEFAULT 0.00,
  `descuento` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total` decimal(12,2) NOT NULL DEFAULT 0.00,
  `estado` enum('borrador','confirmada','recibida','anulada') NOT NULL DEFAULT 'borrador',
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero` (`numero`),
  KEY `fk_compra_proveedor` (`proveedor_id`),
  KEY `fk_compra_almacen` (`almacen_id`),
  KEY `fk_compra_usuario` (`usuario_id`),
  CONSTRAINT `fk_compra_almacen` FOREIGN KEY (`almacen_id`) REFERENCES `almacen` (`id`),
  CONSTRAINT `fk_compra_proveedor` FOREIGN KEY (`proveedor_id`) REFERENCES `proveedor` (`id`),
  CONSTRAINT `fk_compra_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compra`
--

LOCK TABLES `compra` WRITE;
/*!40000 ALTER TABLE `compra` DISABLE KEYS */;
/*!40000 ALTER TABLE `compra` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `compra_detalle`
--

DROP TABLE IF EXISTS `compra_detalle`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `compra_detalle` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `compra_id` bigint(20) NOT NULL,
  `variante_id` int(11) NOT NULL,
  `cantidad` int(11) NOT NULL,
  `costo_unitario` decimal(12,2) NOT NULL,
  `subtotal` decimal(12,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_cd_compra` (`compra_id`),
  KEY `fk_cd_variante` (`variante_id`),
  CONSTRAINT `fk_cd_compra` FOREIGN KEY (`compra_id`) REFERENCES `compra` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cd_variante` FOREIGN KEY (`variante_id`) REFERENCES `variante` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compra_detalle`
--

LOCK TABLES `compra_detalle` WRITE;
/*!40000 ALTER TABLE `compra_detalle` DISABLE KEYS */;
/*!40000 ALTER TABLE `compra_detalle` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `consulta_reporte`
--

DROP TABLE IF EXISTS `consulta_reporte`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `consulta_reporte` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `conversacion_id` bigint(20) DEFAULT NULL,
  `usuario_id` int(11) NOT NULL,
  `plantilla_id` int(11) DEFAULT NULL,
  `pregunta` text NOT NULL,
  `entrada` enum('texto','voz') NOT NULL DEFAULT 'texto',
  `parametros` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`parametros`)),
  `sql_ejecutado` text DEFAULT NULL,
  `filas` int(11) DEFAULT NULL,
  `exito` tinyint(1) NOT NULL DEFAULT 1,
  `error` varchar(255) DEFAULT NULL,
  `duracion_ms` int(11) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_cr_conversacion` (`conversacion_id`),
  KEY `fk_cr_plantilla` (`plantilla_id`),
  KEY `idx_cr_usuario` (`usuario_id`,`creado_en`),
  CONSTRAINT `fk_cr_conversacion` FOREIGN KEY (`conversacion_id`) REFERENCES `conversacion` (`id`),
  CONSTRAINT `fk_cr_plantilla` FOREIGN KEY (`plantilla_id`) REFERENCES `plantilla_reporte` (`id`),
  CONSTRAINT `fk_cr_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `consulta_reporte`
--

LOCK TABLES `consulta_reporte` WRITE;
/*!40000 ALTER TABLE `consulta_reporte` DISABLE KEYS */;
/*!40000 ALTER TABLE `consulta_reporte` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `conversacion`
--

DROP TABLE IF EXISTS `conversacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `conversacion` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) DEFAULT NULL,
  `session_token` char(64) NOT NULL,
  `canal` enum('web','movil','pos') NOT NULL DEFAULT 'web',
  `tipo` enum('asistente_compra','reporte','soporte') NOT NULL DEFAULT 'asistente_compra',
  `titulo` varchar(150) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_conv_usuario` (`usuario_id`),
  KEY `idx_conv_session` (`session_token`),
  CONSTRAINT `fk_conv_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conversacion`
--

LOCK TABLES `conversacion` WRITE;
/*!40000 ALTER TABLE `conversacion` DISABLE KEYS */;
/*!40000 ALTER TABLE `conversacion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `departamento`
--

DROP TABLE IF EXISTS `departamento`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `departamento` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(60) NOT NULL,
  `pais` varchar(60) NOT NULL DEFAULT 'Bolivia',
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `departamento`
--

LOCK TABLES `departamento` WRITE;
/*!40000 ALTER TABLE `departamento` DISABLE KEYS */;
INSERT INTO `departamento` VALUES (1,'Santa Cruz','Bolivia',1),(2,'La Paz','Bolivia',1),(3,'Cochabamba','Bolivia',1),(4,'Oruro','Bolivia',1),(5,'Potosi','Bolivia',1),(6,'Chuquisaca','Bolivia',1),(7,'Tarija','Bolivia',1),(8,'Beni','Bolivia',1),(9,'Pando','Bolivia',1);
/*!40000 ALTER TABLE `departamento` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `devolucion`
--

DROP TABLE IF EXISTS `devolucion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `devolucion` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `numero` varchar(20) NOT NULL,
  `pedido_id` bigint(20) NOT NULL,
  `cliente_id` int(11) DEFAULT NULL,
  `motivo` enum('talla_incorrecta','defecto','no_coincide','arrepentimiento','otro') NOT NULL,
  `detalle` varchar(255) DEFAULT NULL,
  `estado` enum('solicitada','aprobada','rechazada','recibida','reembolsada') NOT NULL DEFAULT 'solicitada',
  `monto_reembolso` decimal(12,2) NOT NULL DEFAULT 0.00,
  `usuario_gestiona_id` int(11) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `cerrado_en` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero` (`numero`),
  KEY `fk_dev_pedido` (`pedido_id`),
  KEY `fk_dev_cliente` (`cliente_id`),
  KEY `fk_dev_usuario` (`usuario_gestiona_id`),
  CONSTRAINT `fk_dev_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `cliente` (`usuario_id`),
  CONSTRAINT `fk_dev_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedido` (`id`),
  CONSTRAINT `fk_dev_usuario` FOREIGN KEY (`usuario_gestiona_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `devolucion`
--

LOCK TABLES `devolucion` WRITE;
/*!40000 ALTER TABLE `devolucion` DISABLE KEYS */;
/*!40000 ALTER TABLE `devolucion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `devolucion_detalle`
--

DROP TABLE IF EXISTS `devolucion_detalle`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `devolucion_detalle` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `devolucion_id` bigint(20) NOT NULL,
  `pedido_detalle_id` bigint(20) NOT NULL,
  `variante_id` int(11) NOT NULL,
  `cantidad` int(11) NOT NULL,
  `estado_prenda` enum('nueva','usada','danada') NOT NULL DEFAULT 'nueva',
  `reingresa_stock` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `fk_dd_devolucion` (`devolucion_id`),
  KEY `fk_dd_detalle` (`pedido_detalle_id`),
  KEY `fk_dd_variante` (`variante_id`),
  CONSTRAINT `fk_dd_detalle` FOREIGN KEY (`pedido_detalle_id`) REFERENCES `pedido_detalle` (`id`),
  CONSTRAINT `fk_dd_devolucion` FOREIGN KEY (`devolucion_id`) REFERENCES `devolucion` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dd_variante` FOREIGN KEY (`variante_id`) REFERENCES `variante` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `devolucion_detalle`
--

LOCK TABLES `devolucion_detalle` WRITE;
/*!40000 ALTER TABLE `devolucion_detalle` DISABLE KEYS */;
/*!40000 ALTER TABLE `devolucion_detalle` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `direccion_cliente`
--

DROP TABLE IF EXISTS `direccion_cliente`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `direccion_cliente` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `cliente_id` int(11) NOT NULL,
  `alias` varchar(50) NOT NULL,
  `ciudad_id` int(11) NOT NULL,
  `direccion` varchar(200) NOT NULL,
  `referencia` varchar(200) DEFAULT NULL,
  `latitud` decimal(10,7) DEFAULT NULL,
  `longitud` decimal(10,7) DEFAULT NULL,
  `destinatario` varchar(120) DEFAULT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `es_principal` tinyint(1) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `fk_dir_ciudad` (`ciudad_id`),
  KEY `idx_dir_cliente` (`cliente_id`),
  CONSTRAINT `fk_dir_ciudad` FOREIGN KEY (`ciudad_id`) REFERENCES `ciudad` (`id`),
  CONSTRAINT `fk_dir_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `cliente` (`usuario_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `direccion_cliente`
--

LOCK TABLES `direccion_cliente` WRITE;
/*!40000 ALTER TABLE `direccion_cliente` DISABLE KEYS */;
/*!40000 ALTER TABLE `direccion_cliente` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dispositivo`
--

DROP TABLE IF EXISTS `dispositivo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `dispositivo` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) DEFAULT NULL,
  `uuid` varchar(64) NOT NULL,
  `plataforma` enum('web','android','ios') NOT NULL,
  `modelo` varchar(80) DEFAULT NULL,
  `push_token` varchar(255) DEFAULT NULL,
  `ultima_sync` datetime DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `fk_dispositivo_usuario` (`usuario_id`),
  CONSTRAINT `fk_dispositivo_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dispositivo`
--

LOCK TABLES `dispositivo` WRITE;
/*!40000 ALTER TABLE `dispositivo` DISABLE KEYS */;
/*!40000 ALTER TABLE `dispositivo` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `envio`
--

DROP TABLE IF EXISTS `envio`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `envio` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `pedido_id` bigint(20) NOT NULL,
  `direccion_id` int(11) DEFAULT NULL,
  `repartidor_id` int(11) DEFAULT NULL,
  `empresa` varchar(80) DEFAULT NULL,
  `tracking` varchar(80) DEFAULT NULL,
  `estado` enum('preparando','en_ruta','entregado','fallido','devuelto') NOT NULL DEFAULT 'preparando',
  `costo` decimal(12,2) NOT NULL DEFAULT 0.00,
  `fecha_estimada` date DEFAULT NULL,
  `entregado_en` datetime DEFAULT NULL,
  `evidencia_url` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pedido_id` (`pedido_id`),
  KEY `fk_envio_direccion` (`direccion_id`),
  KEY `fk_envio_repartidor` (`repartidor_id`),
  CONSTRAINT `fk_envio_direccion` FOREIGN KEY (`direccion_id`) REFERENCES `direccion_cliente` (`id`),
  CONSTRAINT `fk_envio_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedido` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_envio_repartidor` FOREIGN KEY (`repartidor_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `envio`
--

LOCK TABLES `envio` WRITE;
/*!40000 ALTER TABLE `envio` DISABLE KEYS */;
/*!40000 ALTER TABLE `envio` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `escala_precio`
--

DROP TABLE IF EXISTS `escala_precio`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `escala_precio` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `variante_id` int(11) NOT NULL,
  `cantidad_min` int(11) NOT NULL,
  `precio_unitario` decimal(12,2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_escala` (`variante_id`,`cantidad_min`),
  CONSTRAINT `fk_escala_variante` FOREIGN KEY (`variante_id`) REFERENCES `variante` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `escala_precio`
--

LOCK TABLES `escala_precio` WRITE;
/*!40000 ALTER TABLE `escala_precio` DISABLE KEYS */;
/*!40000 ALTER TABLE `escala_precio` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `guia_talla`
--

DROP TABLE IF EXISTS `guia_talla`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `guia_talla` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `categoria_id` int(11) NOT NULL,
  `talla_id` int(11) NOT NULL,
  `busto_min` decimal(5,1) DEFAULT NULL,
  `busto_max` decimal(5,1) DEFAULT NULL,
  `cintura_min` decimal(5,1) DEFAULT NULL,
  `cintura_max` decimal(5,1) DEFAULT NULL,
  `cadera_min` decimal(5,1) DEFAULT NULL,
  `cadera_max` decimal(5,1) DEFAULT NULL,
  `altura_min` decimal(5,1) DEFAULT NULL,
  `altura_max` decimal(5,1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_guia` (`categoria_id`,`talla_id`),
  KEY `fk_guia_talla` (`talla_id`),
  CONSTRAINT `fk_guia_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categoria` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_guia_talla` FOREIGN KEY (`talla_id`) REFERENCES `talla` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `guia_talla`
--

LOCK TABLES `guia_talla` WRITE;
/*!40000 ALTER TABLE `guia_talla` DISABLE KEYS */;
INSERT INTO `guia_talla` VALUES (1,2,1,78.0,82.0,60.0,64.0,86.0,90.0,NULL,NULL),(2,2,2,83.0,87.0,65.0,69.0,91.0,95.0,NULL,NULL),(3,2,3,88.0,93.0,70.0,75.0,96.0,101.0,NULL,NULL),(4,2,4,94.0,99.0,76.0,81.0,102.0,107.0,NULL,NULL),(5,2,5,100.0,106.0,82.0,88.0,108.0,114.0,NULL,NULL),(6,2,6,107.0,114.0,89.0,96.0,115.0,122.0,NULL,NULL),(7,3,1,78.0,82.0,60.0,64.0,NULL,NULL,NULL,NULL),(8,3,2,83.0,87.0,65.0,69.0,NULL,NULL,NULL,NULL),(9,3,3,88.0,93.0,70.0,75.0,NULL,NULL,NULL,NULL),(10,3,4,94.0,99.0,76.0,81.0,NULL,NULL,NULL,NULL),(11,3,5,100.0,106.0,82.0,88.0,NULL,NULL,NULL,NULL),(12,3,6,107.0,114.0,89.0,96.0,NULL,NULL,NULL,NULL),(13,4,1,NULL,NULL,60.0,64.0,86.0,90.0,NULL,NULL),(14,4,2,NULL,NULL,65.0,69.0,91.0,95.0,NULL,NULL),(15,4,3,NULL,NULL,70.0,75.0,96.0,101.0,NULL,NULL),(16,4,4,NULL,NULL,76.0,81.0,102.0,107.0,NULL,NULL),(17,4,5,NULL,NULL,82.0,88.0,108.0,114.0,NULL,NULL),(18,4,6,NULL,NULL,89.0,96.0,115.0,122.0,NULL,NULL),(19,5,1,NULL,NULL,60.0,64.0,86.0,90.0,NULL,NULL),(20,5,2,NULL,NULL,65.0,69.0,91.0,95.0,NULL,NULL),(21,5,3,NULL,NULL,70.0,75.0,96.0,101.0,NULL,NULL),(22,5,4,NULL,NULL,76.0,81.0,102.0,107.0,NULL,NULL),(23,5,5,NULL,NULL,82.0,88.0,108.0,114.0,NULL,NULL),(24,5,6,NULL,NULL,89.0,96.0,115.0,122.0,NULL,NULL);
/*!40000 ALTER TABLE `guia_talla` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventario`
--

DROP TABLE IF EXISTS `inventario`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `inventario` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `variante_id` int(11) NOT NULL,
  `almacen_id` int(11) NOT NULL,
  `stock` int(11) NOT NULL DEFAULT 0,
  `stock_reservado` int(11) NOT NULL DEFAULT 0,
  `stock_minimo` int(11) NOT NULL DEFAULT 0,
  `ubicacion` varchar(40) DEFAULT NULL,
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inventario` (`variante_id`,`almacen_id`),
  KEY `idx_inv_almacen` (`almacen_id`),
  CONSTRAINT `fk_inv_almacen` FOREIGN KEY (`almacen_id`) REFERENCES `almacen` (`id`),
  CONSTRAINT `fk_inv_variante` FOREIGN KEY (`variante_id`) REFERENCES `variante` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_inv_stock` CHECK (`stock` >= 0 and `stock_reservado` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventario`
--

LOCK TABLES `inventario` WRITE;
/*!40000 ALTER TABLE `inventario` DISABLE KEYS */;
/*!40000 ALTER TABLE `inventario` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `marca`
--

DROP TABLE IF EXISTS `marca`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `marca` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(80) NOT NULL,
  `slug` varchar(90) NOT NULL,
  `logo` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `marca`
--

LOCK TABLES `marca` WRITE;
/*!40000 ALTER TABLE `marca` DISABLE KEYS */;
/*!40000 ALTER TABLE `marca` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `medida_cliente`
--

DROP TABLE IF EXISTS `medida_cliente`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `medida_cliente` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `cliente_id` int(11) NOT NULL,
  `altura_cm` decimal(5,1) NOT NULL,
  `peso_kg` decimal(5,1) NOT NULL,
  `busto_cm` decimal(5,1) DEFAULT NULL,
  `cintura_cm` decimal(5,1) DEFAULT NULL,
  `cadera_cm` decimal(5,1) DEFAULT NULL,
  `entrepierna_cm` decimal(5,1) DEFAULT NULL,
  `hombro_cm` decimal(5,1) DEFAULT NULL,
  `origen` enum('manual','estimado','escaneo_camara') NOT NULL DEFAULT 'manual',
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_medida_cliente` (`cliente_id`),
  CONSTRAINT `fk_medida_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `cliente` (`usuario_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `medida_cliente`
--

LOCK TABLES `medida_cliente` WRITE;
/*!40000 ALTER TABLE `medida_cliente` DISABLE KEYS */;
/*!40000 ALTER TABLE `medida_cliente` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `mensaje`
--

DROP TABLE IF EXISTS `mensaje`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mensaje` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `conversacion_id` bigint(20) NOT NULL,
  `rol` enum('usuario','asistente','sistema','herramienta') NOT NULL,
  `contenido` mediumtext DEFAULT NULL,
  `herramienta` varchar(60) DEFAULT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `audio_url` varchar(255) DEFAULT NULL,
  `tokens_entrada` int(11) DEFAULT NULL,
  `tokens_salida` int(11) DEFAULT NULL,
  `latencia_ms` int(11) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_msg_conv` (`conversacion_id`,`creado_en`),
  CONSTRAINT `fk_msg_conversacion` FOREIGN KEY (`conversacion_id`) REFERENCES `conversacion` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `mensaje`
--

LOCK TABLES `mensaje` WRITE;
/*!40000 ALTER TABLE `mensaje` DISABLE KEYS */;
/*!40000 ALTER TABLE `mensaje` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `metodo_pago`
--

DROP TABLE IF EXISTS `metodo_pago`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `metodo_pago` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codigo` varchar(30) NOT NULL,
  `nombre` varchar(60) NOT NULL,
  `tipo` enum('efectivo','qr','tarjeta','transferencia','contra_entrega') NOT NULL,
  `requiere_comprobante` tinyint(1) NOT NULL DEFAULT 0,
  `disponible_offline` tinyint(1) NOT NULL DEFAULT 0,
  `canal` enum('todos','online','tienda') NOT NULL DEFAULT 'todos',
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `metodo_pago`
--

LOCK TABLES `metodo_pago` WRITE;
/*!40000 ALTER TABLE `metodo_pago` DISABLE KEYS */;
INSERT INTO `metodo_pago` VALUES (1,'efectivo','Efectivo','efectivo',0,1,'tienda',1),(2,'qr_simple','QR Simple (BCB)','qr',1,0,'todos',1),(3,'tarjeta_pos','Tarjeta en POS','tarjeta',0,0,'tienda',1),(4,'tarjeta_online','Tarjeta credito/debito','tarjeta',0,0,'online',1),(5,'transferencia','Transferencia bancaria','transferencia',1,0,'online',1),(6,'contra_entrega','Pago contra entrega','contra_entrega',0,1,'online',1);
/*!40000 ALTER TABLE `metodo_pago` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `movimiento_caja`
--

DROP TABLE IF EXISTS `movimiento_caja`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `movimiento_caja` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `caja_id` bigint(20) NOT NULL,
  `tipo` enum('ingreso','egreso') NOT NULL,
  `monto` decimal(12,2) NOT NULL,
  `concepto` varchar(150) NOT NULL,
  `pago_id` bigint(20) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_mc_caja` (`caja_id`),
  KEY `fk_mc_pago` (`pago_id`),
  CONSTRAINT `fk_mc_caja` FOREIGN KEY (`caja_id`) REFERENCES `caja` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mc_pago` FOREIGN KEY (`pago_id`) REFERENCES `pago` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `movimiento_caja`
--

LOCK TABLES `movimiento_caja` WRITE;
/*!40000 ALTER TABLE `movimiento_caja` DISABLE KEYS */;
/*!40000 ALTER TABLE `movimiento_caja` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `movimiento_inventario`
--

DROP TABLE IF EXISTS `movimiento_inventario`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `movimiento_inventario` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `variante_id` int(11) NOT NULL,
  `almacen_id` int(11) NOT NULL,
  `tipo` enum('entrada','salida','ajuste','transferencia_salida','transferencia_entrada','devolucion','reserva','liberacion') NOT NULL,
  `cantidad` int(11) NOT NULL,
  `stock_resultante` int(11) NOT NULL,
  `referencia_tipo` varchar(30) DEFAULT NULL,
  `referencia_id` bigint(20) DEFAULT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `motivo` varchar(200) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_mov_almacen` (`almacen_id`),
  KEY `fk_mov_usuario` (`usuario_id`),
  KEY `idx_mov_variante` (`variante_id`,`creado_en`),
  KEY `idx_mov_ref` (`referencia_tipo`,`referencia_id`),
  CONSTRAINT `fk_mov_almacen` FOREIGN KEY (`almacen_id`) REFERENCES `almacen` (`id`),
  CONSTRAINT `fk_mov_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`),
  CONSTRAINT `fk_mov_variante` FOREIGN KEY (`variante_id`) REFERENCES `variante` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `movimiento_inventario`
--

LOCK TABLES `movimiento_inventario` WRITE;
/*!40000 ALTER TABLE `movimiento_inventario` DISABLE KEYS */;
/*!40000 ALTER TABLE `movimiento_inventario` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notificacion`
--

DROP TABLE IF EXISTS `notificacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notificacion` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `titulo` varchar(120) NOT NULL,
  `mensaje` varchar(255) NOT NULL,
  `tipo` enum('pedido','stock','promocion','sistema','devolucion') NOT NULL,
  `url` varchar(255) DEFAULT NULL,
  `leida` tinyint(1) NOT NULL DEFAULT 0,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_notif_usuario` (`usuario_id`,`leida`),
  CONSTRAINT `fk_notif_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notificacion`
--

LOCK TABLES `notificacion` WRITE;
/*!40000 ALTER TABLE `notificacion` DISABLE KEYS */;
/*!40000 ALTER TABLE `notificacion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pago`
--

DROP TABLE IF EXISTS `pago`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pago` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `pedido_id` bigint(20) NOT NULL,
  `metodo_pago_id` int(11) NOT NULL,
  `monto` decimal(12,2) NOT NULL,
  `moneda` char(3) NOT NULL DEFAULT 'BOB',
  `estado` enum('pendiente','confirmado','rechazado','reembolsado') NOT NULL DEFAULT 'pendiente',
  `referencia_externa` varchar(120) DEFAULT NULL,
  `qr_payload` text DEFAULT NULL,
  `comprobante_url` varchar(255) DEFAULT NULL,
  `usuario_confirma_id` int(11) DEFAULT NULL,
  `idempotency_key` char(36) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `confirmado_en` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idempotency_key` (`idempotency_key`),
  KEY `fk_pago_metodo` (`metodo_pago_id`),
  KEY `fk_pago_usuario` (`usuario_confirma_id`),
  KEY `idx_pago_pedido` (`pedido_id`),
  CONSTRAINT `fk_pago_metodo` FOREIGN KEY (`metodo_pago_id`) REFERENCES `metodo_pago` (`id`),
  CONSTRAINT `fk_pago_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedido` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pago_usuario` FOREIGN KEY (`usuario_confirma_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pago`
--

LOCK TABLES `pago` WRITE;
/*!40000 ALTER TABLE `pago` DISABLE KEYS */;
/*!40000 ALTER TABLE `pago` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pedido`
--

DROP TABLE IF EXISTS `pedido`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pedido` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `numero` varchar(20) NOT NULL,
  `cliente_id` int(11) DEFAULT NULL,
  `sucursal_id` int(11) NOT NULL,
  `almacen_id` int(11) NOT NULL,
  `vendedor_id` int(11) DEFAULT NULL,
  `canal` enum('online','tienda') NOT NULL,
  `modalidad` enum('menudeo','mayoreo') NOT NULL DEFAULT 'menudeo',
  `tipo_entrega` enum('inmediata','recojo_tienda','domicilio') NOT NULL DEFAULT 'inmediata',
  `estado` enum('pendiente','pagado','preparando','listo','enviado','entregado','cancelado','devuelto') NOT NULL DEFAULT 'pendiente',
  `direccion_id` int(11) DEFAULT NULL,
  `promocion_id` int(11) DEFAULT NULL,
  `subtotal` decimal(12,2) NOT NULL DEFAULT 0.00,
  `descuento` decimal(12,2) NOT NULL DEFAULT 0.00,
  `costo_envio` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total` decimal(12,2) NOT NULL DEFAULT 0.00,
  `moneda` char(3) NOT NULL DEFAULT 'BOB',
  `nota` varchar(255) DEFAULT NULL,
  `idempotency_key` char(36) DEFAULT NULL,
  `creado_offline` tinyint(1) NOT NULL DEFAULT 0,
  `creado_en_cliente` datetime DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero` (`numero`),
  UNIQUE KEY `idempotency_key` (`idempotency_key`),
  KEY `fk_pedido_almacen` (`almacen_id`),
  KEY `fk_pedido_vendedor` (`vendedor_id`),
  KEY `fk_pedido_direccion` (`direccion_id`),
  KEY `fk_pedido_promocion` (`promocion_id`),
  KEY `idx_pedido_fecha` (`creado_en`),
  KEY `idx_pedido_sucursal_fecha` (`sucursal_id`,`creado_en`),
  KEY `idx_pedido_estado` (`estado`),
  KEY `idx_pedido_cliente` (`cliente_id`),
  CONSTRAINT `fk_pedido_almacen` FOREIGN KEY (`almacen_id`) REFERENCES `almacen` (`id`),
  CONSTRAINT `fk_pedido_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `cliente` (`usuario_id`),
  CONSTRAINT `fk_pedido_direccion` FOREIGN KEY (`direccion_id`) REFERENCES `direccion_cliente` (`id`),
  CONSTRAINT `fk_pedido_promocion` FOREIGN KEY (`promocion_id`) REFERENCES `promocion` (`id`),
  CONSTRAINT `fk_pedido_sucursal` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursal` (`id`),
  CONSTRAINT `fk_pedido_vendedor` FOREIGN KEY (`vendedor_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pedido`
--

LOCK TABLES `pedido` WRITE;
/*!40000 ALTER TABLE `pedido` DISABLE KEYS */;
/*!40000 ALTER TABLE `pedido` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pedido_detalle`
--

DROP TABLE IF EXISTS `pedido_detalle`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pedido_detalle` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `pedido_id` bigint(20) NOT NULL,
  `variante_id` int(11) NOT NULL,
  `descripcion` varchar(200) NOT NULL,
  `cantidad` int(11) NOT NULL,
  `precio_unitario` decimal(12,2) NOT NULL,
  `descuento` decimal(12,2) NOT NULL DEFAULT 0.00,
  `subtotal` decimal(12,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pd_pedido` (`pedido_id`),
  KEY `idx_pd_variante` (`variante_id`),
  CONSTRAINT `fk_pd_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedido` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pd_variante` FOREIGN KEY (`variante_id`) REFERENCES `variante` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pedido_detalle`
--

LOCK TABLES `pedido_detalle` WRITE;
/*!40000 ALTER TABLE `pedido_detalle` DISABLE KEYS */;
/*!40000 ALTER TABLE `pedido_detalle` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pedido_historial`
--

DROP TABLE IF EXISTS `pedido_historial`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pedido_historial` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `pedido_id` bigint(20) NOT NULL,
  `estado` varchar(20) NOT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `comentario` varchar(255) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_ph_pedido` (`pedido_id`),
  KEY `fk_ph_usuario` (`usuario_id`),
  CONSTRAINT `fk_ph_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedido` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ph_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pedido_historial`
--

LOCK TABLES `pedido_historial` WRITE;
/*!40000 ALTER TABLE `pedido_historial` DISABLE KEYS */;
/*!40000 ALTER TABLE `pedido_historial` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `permiso`
--

DROP TABLE IF EXISTS `permiso`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `permiso` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codigo` varchar(80) NOT NULL,
  `modulo` varchar(50) NOT NULL,
  `descripcion` varchar(200) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`)
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `permiso`
--

LOCK TABLES `permiso` WRITE;
/*!40000 ALTER TABLE `permiso` DISABLE KEYS */;
INSERT INTO `permiso` VALUES (1,'*','sistema','Comodin: acceso total'),(2,'usuario.ver','usuario','Listar usuarios'),(3,'usuario.crear','usuario','Crear usuarios'),(4,'usuario.editar','usuario','Editar usuarios'),(5,'usuario.eliminar','usuario','Dar de baja usuarios'),(6,'rol.gestionar','rol','Crear roles y asignar permisos'),(7,'bitacora.ver','bitacora','Consultar la bitacora de auditoria'),(8,'sucursal.ver','sucursal','Ver sucursales'),(9,'sucursal.ver_todas','sucursal','Ver datos de todas las sucursales'),(10,'sucursal.gestionar','sucursal','Crear y editar sucursales y almacenes'),(11,'producto.ver','producto','Ver el catalogo interno'),(12,'producto.crear','producto','Crear productos y variantes'),(13,'producto.editar','producto','Editar productos y precios'),(14,'producto.eliminar','producto','Dar de baja productos'),(15,'inventario.ver','inventario','Consultar stock'),(16,'inventario.ajustar','inventario','Ajustar stock manualmente'),(17,'inventario.transferir','inventario','Solicitar y recibir transferencias'),(18,'compra.ver','compra','Ver compras a proveedores'),(19,'compra.gestionar','compra','Registrar compras y recepciones'),(20,'venta.ver','venta','Ver pedidos y ventas'),(21,'venta.crear','venta','Registrar ventas en mostrador'),(22,'venta.anular','venta','Anular o cancelar pedidos'),(23,'venta.despachar','venta','Preparar y despachar pedidos'),(24,'pago.confirmar','pago','Confirmar pagos y comprobantes'),(25,'caja.operar','caja','Abrir y cerrar caja'),(26,'devolucion.gestionar','devolucion','Aprobar y procesar devoluciones'),(27,'promocion.gestionar','promocion','Crear campanias y promociones'),(28,'reporte.ver','reporte','Ver reportes'),(29,'reporte.demanda','reporte','Pedir reportes bajo demanda por chat o voz'),(30,'reporte.exportar','reporte','Exportar reportes a PDF o Excel'),(31,'ia.asistente','ia','Usar el asistente conversacional interno');
/*!40000 ALTER TABLE `permiso` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `plantilla_reporte`
--

DROP TABLE IF EXISTS `plantilla_reporte`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `plantilla_reporte` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codigo` varchar(60) NOT NULL,
  `nombre` varchar(120) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `sql_plantilla` text NOT NULL,
  `parametros` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`parametros`)),
  `permiso_id` int(11) DEFAULT NULL,
  `visual_default` enum('tabla','barras','lineas','torta','tarjeta') NOT NULL DEFAULT 'tabla',
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`),
  KEY `fk_plantilla_permiso` (`permiso_id`),
  CONSTRAINT `fk_plantilla_permiso` FOREIGN KEY (`permiso_id`) REFERENCES `permiso` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `plantilla_reporte`
--

LOCK TABLES `plantilla_reporte` WRITE;
/*!40000 ALTER TABLE `plantilla_reporte` DISABLE KEYS */;
INSERT INTO `plantilla_reporte` VALUES (1,'ventas_por_rango','Ventas en un rango de fechas y horas','Total vendido y cantidad de pedidos entre dos momentos, con filtro opcional de sucursal y canal.','SELECT DATE(creado_en) AS fecha, COUNT(DISTINCT pedido_id) AS pedidos,\n         SUM(cantidad) AS unidades, SUM(subtotal) AS total\n  FROM v_ventas_detalle\n  WHERE creado_en BETWEEN :desde AND :hasta\n    AND (:sucursal_id IS NULL OR sucursal_id = :sucursal_id)\n    AND (:canal IS NULL OR canal = :canal)\n  GROUP BY DATE(creado_en) ORDER BY fecha','{\"desde\":{\"tipo\":\"datetime\",\"requerido\":true},\"hasta\":{\"tipo\":\"datetime\",\"requerido\":true},\"sucursal_id\":{\"tipo\":\"int\",\"requerido\":false},\"canal\":{\"tipo\":\"enum\",\"opciones\":[\"online\",\"tienda\"],\"requerido\":false}}',NULL,'lineas',1),(2,'ventas_por_sucursal','Ranking de sucursales','Compara el total vendido por sucursal en un periodo.','SELECT sucursal, departamento, COUNT(DISTINCT pedido_id) AS pedidos, SUM(subtotal) AS total\n  FROM v_ventas_detalle\n  WHERE creado_en BETWEEN :desde AND :hasta\n  GROUP BY sucursal_id, sucursal, departamento ORDER BY total DESC','{\"desde\":{\"tipo\":\"datetime\",\"requerido\":true},\"hasta\":{\"tipo\":\"datetime\",\"requerido\":true}}',NULL,'barras',1),(3,'productos_mas_vendidos','Productos mas vendidos','Top N de productos por unidades vendidas en un periodo.','SELECT producto, categoria, SUM(cantidad) AS unidades, SUM(subtotal) AS total\n  FROM v_ventas_detalle\n  WHERE creado_en BETWEEN :desde AND :hasta\n    AND (:sucursal_id IS NULL OR sucursal_id = :sucursal_id)\n  GROUP BY producto_id, producto, categoria ORDER BY unidades DESC LIMIT :limite','{\"desde\":{\"tipo\":\"datetime\",\"requerido\":true},\"hasta\":{\"tipo\":\"datetime\",\"requerido\":true},\"sucursal_id\":{\"tipo\":\"int\",\"requerido\":false},\"limite\":{\"tipo\":\"int\",\"requerido\":false,\"defecto\":10}}',NULL,'barras',1),(4,'stock_bajo','Productos con stock bajo','Variantes cuyo stock disponible esta por debajo del minimo configurado.','SELECT s.nombre AS sucursal, a.nombre AS almacen, p.nombre AS producto,\n         t.nombre AS talla, c.nombre AS color, v.sku,\n         i.stock, i.stock_reservado, i.stock_minimo\n  FROM inventario i\n  JOIN almacen a ON a.id = i.almacen_id\n  JOIN sucursal s ON s.id = a.sucursal_id\n  JOIN variante v ON v.id = i.variante_id\n  JOIN producto p ON p.id = v.producto_id\n  JOIN talla t ON t.id = v.talla_id\n  JOIN color c ON c.id = v.color_id\n  WHERE (i.stock - i.stock_reservado) <= i.stock_minimo\n    AND (:sucursal_id IS NULL OR s.id = :sucursal_id)\n  ORDER BY (i.stock - i.stock_reservado) ASC','{\"sucursal_id\":{\"tipo\":\"int\",\"requerido\":false}}',NULL,'tabla',1),(5,'ventas_por_hora','Ventas por hora del dia','Distribucion horaria de las ventas: sirve para dimensionar el personal por turno.','SELECT HOUR(creado_en) AS hora, COUNT(DISTINCT pedido_id) AS pedidos, SUM(subtotal) AS total\n  FROM v_ventas_detalle\n  WHERE creado_en BETWEEN :desde AND :hasta\n    AND (:sucursal_id IS NULL OR sucursal_id = :sucursal_id)\n  GROUP BY HOUR(creado_en) ORDER BY hora','{\"desde\":{\"tipo\":\"datetime\",\"requerido\":true},\"hasta\":{\"tipo\":\"datetime\",\"requerido\":true},\"sucursal_id\":{\"tipo\":\"int\",\"requerido\":false}}',NULL,'barras',1),(6,'desempeno_vendedores','Desempenio de vendedores','Ventas atribuidas a cada vendedor en un periodo.','SELECT CONCAT(u.nombre, \" \", u.apellido) AS vendedor, s.nombre AS sucursal,\n         COUNT(DISTINCT vd.pedido_id) AS pedidos, SUM(vd.subtotal) AS total\n  FROM v_ventas_detalle vd\n  JOIN usuario u ON u.id = vd.vendedor_id\n  JOIN sucursal s ON s.id = vd.sucursal_id\n  WHERE vd.creado_en BETWEEN :desde AND :hasta\n    AND (:sucursal_id IS NULL OR vd.sucursal_id = :sucursal_id)\n  GROUP BY u.id, vendedor, sucursal ORDER BY total DESC','{\"desde\":{\"tipo\":\"datetime\",\"requerido\":true},\"hasta\":{\"tipo\":\"datetime\",\"requerido\":true},\"sucursal_id\":{\"tipo\":\"int\",\"requerido\":false}}',NULL,'barras',1),(7,'efectividad_probador','Efectividad del probador virtual','Cuantas pruebas virtuales terminaron en compra, por producto.','SELECT p.nombre AS producto, COUNT(*) AS pruebas,\n         SUM(pv.convirtio_en_compra) AS compras,\n         ROUND(100 * SUM(pv.convirtio_en_compra) / COUNT(*), 1) AS conversion_pct\n  FROM prueba_virtual pv\n  JOIN variante v ON v.id = pv.variante_id\n  JOIN producto p ON p.id = v.producto_id\n  WHERE pv.creado_en BETWEEN :desde AND :hasta\n  GROUP BY p.id, p.nombre ORDER BY pruebas DESC LIMIT :limite','{\"desde\":{\"tipo\":\"datetime\",\"requerido\":true},\"hasta\":{\"tipo\":\"datetime\",\"requerido\":true},\"limite\":{\"tipo\":\"int\",\"requerido\":false,\"defecto\":15}}',NULL,'tabla',1),(8,'devoluciones_por_motivo','Devoluciones por motivo','Cuenta y monto de devoluciones agrupadas por motivo en un periodo.','SELECT d.motivo, COUNT(*) AS casos, SUM(d.monto_reembolso) AS monto\n  FROM devolucion d\n  WHERE d.creado_en BETWEEN :desde AND :hasta\n  GROUP BY d.motivo ORDER BY casos DESC','{\"desde\":{\"tipo\":\"datetime\",\"requerido\":true},\"hasta\":{\"tipo\":\"datetime\",\"requerido\":true}}',NULL,'torta',1);
/*!40000 ALTER TABLE `plantilla_reporte` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `producto`
--

DROP TABLE IF EXISTS `producto`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `producto` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `categoria_id` int(11) NOT NULL,
  `marca_id` int(11) DEFAULT NULL,
  `codigo` varchar(30) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `slug` varchar(170) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `material` varchar(120) DEFAULT NULL,
  `cuidados` varchar(255) DEFAULT NULL,
  `temporada` enum('verano','invierno','otono','primavera','todo_ano') NOT NULL DEFAULT 'todo_ano',
  `tipo_prenda` enum('superior','inferior','vestido','abrigo','calzado','accesorio','ropa_interior') NOT NULL,
  `destacado` tinyint(1) NOT NULL DEFAULT 0,
  `vendidos` int(11) NOT NULL DEFAULT 0,
  `calificacion` decimal(3,2) NOT NULL DEFAULT 0.00,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`),
  UNIQUE KEY `slug` (`slug`),
  KEY `fk_producto_marca` (`marca_id`),
  KEY `idx_producto_categoria` (`categoria_id`),
  FULLTEXT KEY `ft_producto` (`nombre`,`descripcion`,`material`),
  CONSTRAINT `fk_producto_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categoria` (`id`),
  CONSTRAINT `fk_producto_marca` FOREIGN KEY (`marca_id`) REFERENCES `marca` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `producto`
--

LOCK TABLES `producto` WRITE;
/*!40000 ALTER TABLE `producto` DISABLE KEYS */;
/*!40000 ALTER TABLE `producto` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `producto_imagen`
--

DROP TABLE IF EXISTS `producto_imagen`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `producto_imagen` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `producto_id` int(11) NOT NULL,
  `color_id` int(11) DEFAULT NULL,
  `url` varchar(255) NOT NULL,
  `alt` varchar(150) DEFAULT NULL,
  `orden` int(11) NOT NULL DEFAULT 0,
  `es_principal` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `fk_img_color` (`color_id`),
  KEY `idx_img_producto` (`producto_id`),
  CONSTRAINT `fk_img_color` FOREIGN KEY (`color_id`) REFERENCES `color` (`id`),
  CONSTRAINT `fk_img_producto` FOREIGN KEY (`producto_id`) REFERENCES `producto` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `producto_imagen`
--

LOCK TABLES `producto_imagen` WRITE;
/*!40000 ALTER TABLE `producto_imagen` DISABLE KEYS */;
/*!40000 ALTER TABLE `producto_imagen` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `producto_prenda_3d`
--

DROP TABLE IF EXISTS `producto_prenda_3d`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `producto_prenda_3d` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `producto_id` int(11) NOT NULL,
  `color_id` int(11) DEFAULT NULL,
  `url_glb` varchar(255) DEFAULT NULL,
  `url_textura` varchar(255) DEFAULT NULL,
  `anclaje_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`anclaje_json`)),
  `escala_base` decimal(6,3) NOT NULL DEFAULT 1.000,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `fk_p3d_producto` (`producto_id`),
  KEY `fk_p3d_color` (`color_id`),
  CONSTRAINT `fk_p3d_color` FOREIGN KEY (`color_id`) REFERENCES `color` (`id`),
  CONSTRAINT `fk_p3d_producto` FOREIGN KEY (`producto_id`) REFERENCES `producto` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `producto_prenda_3d`
--

LOCK TABLES `producto_prenda_3d` WRITE;
/*!40000 ALTER TABLE `producto_prenda_3d` DISABLE KEYS */;
/*!40000 ALTER TABLE `producto_prenda_3d` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `promocion`
--

DROP TABLE IF EXISTS `promocion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `promocion` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `campania_id` int(11) DEFAULT NULL,
  `nombre` varchar(120) NOT NULL,
  `tipo` enum('porcentaje','monto_fijo','2x1','envio_gratis') NOT NULL,
  `valor` decimal(12,2) NOT NULL DEFAULT 0.00,
  `codigo_cupon` varchar(30) DEFAULT NULL,
  `min_compra` decimal(12,2) NOT NULL DEFAULT 0.00,
  `aplica_a` enum('todo','categoria','producto','variante') NOT NULL DEFAULT 'todo',
  `aplica_id` int(11) DEFAULT NULL,
  `canal` enum('todos','online','tienda') NOT NULL DEFAULT 'todos',
  `modalidad` enum('todas','menudeo','mayoreo') NOT NULL DEFAULT 'todas',
  `usos_max` int(11) DEFAULT NULL,
  `usos_actuales` int(11) NOT NULL DEFAULT 0,
  `fecha_inicio` datetime NOT NULL,
  `fecha_fin` datetime NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo_cupon` (`codigo_cupon`),
  KEY `fk_promo_campania` (`campania_id`),
  CONSTRAINT `fk_promo_campania` FOREIGN KEY (`campania_id`) REFERENCES `campania` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `promocion`
--

LOCK TABLES `promocion` WRITE;
/*!40000 ALTER TABLE `promocion` DISABLE KEYS */;
/*!40000 ALTER TABLE `promocion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `proveedor`
--

DROP TABLE IF EXISTS `proveedor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `proveedor` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(150) NOT NULL,
  `nit` varchar(20) DEFAULT NULL,
  `contacto` varchar(120) DEFAULT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `email` varchar(120) DEFAULT NULL,
  `direccion` varchar(200) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `proveedor`
--

LOCK TABLES `proveedor` WRITE;
/*!40000 ALTER TABLE `proveedor` DISABLE KEYS */;
INSERT INTO `proveedor` VALUES (1,'Textiles del Sur SRL','1023456789','Marcela Vargas','+591 3 3456789','ventas@textilesdelsur.bo',NULL,1),(2,'Importadora Moda Andina','2098765432','Luis Choque','+591 2 2987654','compras@modaandina.bo',NULL,1),(3,'Confecciones Prisma','3055512345','Ana Rojas','+591 4 4551234','contacto@prisma.bo',NULL,1);
/*!40000 ALTER TABLE `proveedor` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `prueba_virtual`
--

DROP TABLE IF EXISTS `prueba_virtual`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `prueba_virtual` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `cliente_id` int(11) DEFAULT NULL,
  `session_token` char(64) DEFAULT NULL,
  `variante_id` int(11) NOT NULL,
  `modo` enum('avatar','ra_camara') NOT NULL,
  `talla_recomendada_id` int(11) DEFAULT NULL,
  `ajuste` tinyint(4) DEFAULT NULL,
  `captura_url` varchar(255) DEFAULT NULL,
  `duracion_seg` int(11) DEFAULT NULL,
  `convirtio_en_compra` tinyint(1) NOT NULL DEFAULT 0,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_pv_cliente` (`cliente_id`),
  KEY `fk_pv_talla` (`talla_recomendada_id`),
  KEY `idx_pv_variante` (`variante_id`),
  KEY `idx_pv_fecha` (`creado_en`),
  CONSTRAINT `fk_pv_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `cliente` (`usuario_id`),
  CONSTRAINT `fk_pv_talla` FOREIGN KEY (`talla_recomendada_id`) REFERENCES `talla` (`id`),
  CONSTRAINT `fk_pv_variante` FOREIGN KEY (`variante_id`) REFERENCES `variante` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `prueba_virtual`
--

LOCK TABLES `prueba_virtual` WRITE;
/*!40000 ALTER TABLE `prueba_virtual` DISABLE KEYS */;
/*!40000 ALTER TABLE `prueba_virtual` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `resena`
--

DROP TABLE IF EXISTS `resena`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `resena` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `producto_id` int(11) NOT NULL,
  `cliente_id` int(11) NOT NULL,
  `pedido_id` bigint(20) DEFAULT NULL,
  `calificacion` tinyint(4) NOT NULL,
  `comentario` varchar(500) DEFAULT NULL,
  `talla_comprada_id` int(11) DEFAULT NULL,
  `ajuste_real` enum('pequena','justa','grande') DEFAULT NULL,
  `aprobado` tinyint(1) NOT NULL DEFAULT 0,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_resena` (`producto_id`,`cliente_id`,`pedido_id`),
  KEY `fk_res_cliente` (`cliente_id`),
  KEY `fk_res_pedido` (`pedido_id`),
  KEY `fk_res_talla` (`talla_comprada_id`),
  CONSTRAINT `fk_res_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `cliente` (`usuario_id`),
  CONSTRAINT `fk_res_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedido` (`id`),
  CONSTRAINT `fk_res_producto` FOREIGN KEY (`producto_id`) REFERENCES `producto` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_res_talla` FOREIGN KEY (`talla_comprada_id`) REFERENCES `talla` (`id`),
  CONSTRAINT `ck_res_calif` CHECK (`calificacion` between 1 and 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `resena`
--

LOCK TABLES `resena` WRITE;
/*!40000 ALTER TABLE `resena` DISABLE KEYS */;
/*!40000 ALTER TABLE `resena` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rol`
--

DROP TABLE IF EXISTS `rol`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `rol` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) NOT NULL,
  `descripcion` varchar(200) DEFAULT NULL,
  `es_sistema` tinyint(1) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rol`
--

LOCK TABLES `rol` WRITE;
/*!40000 ALTER TABLE `rol` DISABLE KEYS */;
INSERT INTO `rol` VALUES (1,'administrador','Acceso total al sistema',1,1),(2,'gerente','Gerente de sucursal: ve y opera solo su sucursal',1,1),(3,'vendedor','Atiende ventas en mostrador y pedidos online',1,1),(4,'almacenero','Gestiona stock, transferencias y recepcion de compras',1,1),(5,'repartidor','Entrega pedidos a domicilio',1,1),(6,'cliente','Compra en la tienda en linea',1,1);
/*!40000 ALTER TABLE `rol` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rol_permiso`
--

DROP TABLE IF EXISTS `rol_permiso`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `rol_permiso` (
  `rol_id` int(11) NOT NULL,
  `permiso_id` int(11) NOT NULL,
  PRIMARY KEY (`rol_id`,`permiso_id`),
  KEY `fk_rp_permiso` (`permiso_id`),
  CONSTRAINT `fk_rp_permiso` FOREIGN KEY (`permiso_id`) REFERENCES `permiso` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp_rol` FOREIGN KEY (`rol_id`) REFERENCES `rol` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rol_permiso`
--

LOCK TABLES `rol_permiso` WRITE;
/*!40000 ALTER TABLE `rol_permiso` DISABLE KEYS */;
INSERT INTO `rol_permiso` VALUES (1,1),(2,2),(2,7),(2,8),(2,11),(2,13),(2,15),(2,16),(2,17),(2,18),(2,19),(2,20),(2,21),(2,22),(2,23),(2,24),(2,25),(2,26),(2,27),(2,28),(2,29),(2,30),(2,31),(3,11),(3,15),(3,20),(3,21),(3,23),(3,24),(3,25),(3,28),(3,31),(4,11),(4,15),(4,16),(4,17),(4,18),(4,19),(4,23),(4,28),(5,20),(5,23);
/*!40000 ALTER TABLE `rol_permiso` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sesion`
--

DROP TABLE IF EXISTS `sesion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sesion` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `dispositivo_id` int(11) DEFAULT NULL,
  `token_hash` char(64) NOT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `expira_en` datetime NOT NULL,
  `revocado` tinyint(1) NOT NULL DEFAULT 0,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `fk_sesion_dispositivo` (`dispositivo_id`),
  KEY `idx_sesion_usuario` (`usuario_id`),
  CONSTRAINT `fk_sesion_dispositivo` FOREIGN KEY (`dispositivo_id`) REFERENCES `dispositivo` (`id`),
  CONSTRAINT `fk_sesion_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sesion`
--

LOCK TABLES `sesion` WRITE;
/*!40000 ALTER TABLE `sesion` DISABLE KEYS */;
INSERT INTO `sesion` VALUES (1,1,NULL,'fbfb6ebdc635413d11670a2d4216faa6631e119a41a9e5b4e7d60d99b2f7f0c1','::1','curl/8.16.0','2026-09-26 20:10:55',0,'2026-08-28 00:10:55'),(2,1,NULL,'b6ffbf3af29428b8396f5a1fa7f61921595d5dd081c0036462eaa807b3698f7f','::1','curl/8.16.0','2026-09-26 20:11:03',0,'2026-08-28 00:11:03');
/*!40000 ALTER TABLE `sesion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sucursal`
--

DROP TABLE IF EXISTS `sucursal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sucursal` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codigo` varchar(20) NOT NULL,
  `nombre` varchar(120) NOT NULL,
  `ciudad_id` int(11) NOT NULL,
  `direccion` varchar(200) NOT NULL,
  `latitud` decimal(10,7) DEFAULT NULL,
  `longitud` decimal(10,7) DEFAULT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `email` varchar(120) DEFAULT NULL,
  `horario` varchar(120) DEFAULT NULL,
  `es_virtual` tinyint(1) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`),
  KEY `idx_sucursal_ciudad` (`ciudad_id`),
  CONSTRAINT `fk_sucursal_ciudad` FOREIGN KEY (`ciudad_id`) REFERENCES `ciudad` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sucursal`
--

LOCK TABLES `sucursal` WRITE;
/*!40000 ALTER TABLE `sucursal` DISABLE KEYS */;
INSERT INTO `sucursal` VALUES (1,'SC-CENTRO','Aurora Centro',1,'Calle Libertad 234, 1er anillo',NULL,NULL,'+591 3 3334455',NULL,'L-S 09:00-21:00',0,1,'2026-08-28 00:10:35'),(2,'SC-VENTURA','Aurora Ventura Mall',1,'Av. Banzer km 8, Ventura Mall',NULL,NULL,'+591 3 3345566',NULL,'L-D 10:00-22:00',0,1,'2026-08-28 00:10:35'),(3,'LP-SOPOCACHI','Aurora Sopocachi',4,'Av. 20 de Octubre 1850',NULL,NULL,'+591 2 2445566',NULL,'L-S 09:30-20:30',0,1,'2026-08-28 00:10:35'),(4,'CB-RECOLETA','Aurora Recoleta',6,'Av. Pando 1120',NULL,NULL,'+591 4 4556677',NULL,'L-S 09:00-20:00',0,1,'2026-08-28 00:10:35'),(5,'SCZ-CD','Centro de Distribucion Nacional',1,'Parque Industrial PI-12',NULL,NULL,NULL,NULL,NULL,1,1,'2026-08-28 00:10:35');
/*!40000 ALTER TABLE `sucursal` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sync_operacion`
--

DROP TABLE IF EXISTS `sync_operacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sync_operacion` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `dispositivo_id` int(11) NOT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `idempotency_key` char(36) NOT NULL,
  `entidad` varchar(40) NOT NULL,
  `operacion` enum('crear','actualizar','eliminar') NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`payload`)),
  `estado` enum('pendiente','aplicado','conflicto','rechazado') NOT NULL DEFAULT 'pendiente',
  `resultado` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`resultado`)),
  `error` varchar(255) DEFAULT NULL,
  `creado_en_cliente` datetime NOT NULL,
  `recibido_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `procesado_en` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idempotency_key` (`idempotency_key`),
  KEY `fk_sync_dispositivo` (`dispositivo_id`),
  KEY `fk_sync_usuario` (`usuario_id`),
  KEY `idx_sync_estado` (`estado`,`recibido_en`),
  CONSTRAINT `fk_sync_dispositivo` FOREIGN KEY (`dispositivo_id`) REFERENCES `dispositivo` (`id`),
  CONSTRAINT `fk_sync_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sync_operacion`
--

LOCK TABLES `sync_operacion` WRITE;
/*!40000 ALTER TABLE `sync_operacion` DISABLE KEYS */;
/*!40000 ALTER TABLE `sync_operacion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `talla`
--

DROP TABLE IF EXISTS `talla`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `talla` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(10) NOT NULL,
  `tipo` enum('alfa','numerica','calzado','unica') NOT NULL DEFAULT 'alfa',
  `orden` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_talla` (`nombre`,`tipo`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `talla`
--

LOCK TABLES `talla` WRITE;
/*!40000 ALTER TABLE `talla` DISABLE KEYS */;
INSERT INTO `talla` VALUES (1,'XS','alfa',1),(2,'S','alfa',2),(3,'M','alfa',3),(4,'L','alfa',4),(5,'XL','alfa',5),(6,'XXL','alfa',6),(7,'36','numerica',1),(8,'38','numerica',2),(9,'40','numerica',3),(10,'42','numerica',4),(11,'44','numerica',5),(12,'35','calzado',1),(13,'36','calzado',2),(14,'37','calzado',3),(15,'38','calzado',4),(16,'39','calzado',5),(17,'UNICA','unica',1);
/*!40000 ALTER TABLE `talla` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transferencia`
--

DROP TABLE IF EXISTS `transferencia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `transferencia` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `numero` varchar(20) NOT NULL,
  `almacen_origen_id` int(11) NOT NULL,
  `almacen_destino_id` int(11) NOT NULL,
  `estado` enum('borrador','solicitada','aprobada','en_transito','recibida','rechazada') NOT NULL DEFAULT 'solicitada',
  `usuario_solicita_id` int(11) NOT NULL,
  `usuario_aprueba_id` int(11) DEFAULT NULL,
  `observacion` varchar(255) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `recibido_en` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero` (`numero`),
  KEY `fk_tr_origen` (`almacen_origen_id`),
  KEY `fk_tr_destino` (`almacen_destino_id`),
  KEY `fk_tr_solicita` (`usuario_solicita_id`),
  KEY `fk_tr_aprueba` (`usuario_aprueba_id`),
  CONSTRAINT `fk_tr_aprueba` FOREIGN KEY (`usuario_aprueba_id`) REFERENCES `usuario` (`id`),
  CONSTRAINT `fk_tr_destino` FOREIGN KEY (`almacen_destino_id`) REFERENCES `almacen` (`id`),
  CONSTRAINT `fk_tr_origen` FOREIGN KEY (`almacen_origen_id`) REFERENCES `almacen` (`id`),
  CONSTRAINT `fk_tr_solicita` FOREIGN KEY (`usuario_solicita_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transferencia`
--

LOCK TABLES `transferencia` WRITE;
/*!40000 ALTER TABLE `transferencia` DISABLE KEYS */;
/*!40000 ALTER TABLE `transferencia` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transferencia_detalle`
--

DROP TABLE IF EXISTS `transferencia_detalle`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `transferencia_detalle` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `transferencia_id` bigint(20) NOT NULL,
  `variante_id` int(11) NOT NULL,
  `cantidad` int(11) NOT NULL,
  `cantidad_recibida` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `fk_trd_transferencia` (`transferencia_id`),
  KEY `fk_trd_variante` (`variante_id`),
  CONSTRAINT `fk_trd_transferencia` FOREIGN KEY (`transferencia_id`) REFERENCES `transferencia` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_trd_variante` FOREIGN KEY (`variante_id`) REFERENCES `variante` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transferencia_detalle`
--

LOCK TABLES `transferencia_detalle` WRITE;
/*!40000 ALTER TABLE `transferencia_detalle` DISABLE KEYS */;
/*!40000 ALTER TABLE `transferencia_detalle` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usuario`
--

DROP TABLE IF EXISTS `usuario`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `usuario` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rol_id` int(11) NOT NULL,
  `sucursal_id` int(11) DEFAULT NULL,
  `nombre` varchar(80) NOT NULL,
  `apellido` varchar(80) NOT NULL,
  `email` varchar(120) NOT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `ci` varchar(20) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `avatar_url` varchar(255) DEFAULT NULL,
  `email_verificado` tinyint(1) NOT NULL DEFAULT 0,
  `intentos_fallidos` tinyint(4) NOT NULL DEFAULT 0,
  `bloqueado_hasta` datetime DEFAULT NULL,
  `ultimo_acceso` datetime DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_usuario_rol` (`rol_id`),
  KEY `idx_usuario_sucursal` (`sucursal_id`),
  CONSTRAINT `fk_usuario_rol` FOREIGN KEY (`rol_id`) REFERENCES `rol` (`id`),
  CONSTRAINT `fk_usuario_sucursal` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursal` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuario`
--

LOCK TABLES `usuario` WRITE;
/*!40000 ALTER TABLE `usuario` DISABLE KEYS */;
INSERT INTO `usuario` VALUES (1,1,NULL,'Administrador','Aurora','admin@aurora.bo','+591 70000000',NULL,'$2y$12$QZBst2P7PGNT1E1H/PNxxu.h9NuQmDBdQBqwKmyW6BXC7JXVow0X6',NULL,1,0,NULL,'2026-08-27 20:11:03',1,'2026-08-28 00:10:35','2026-08-28 00:11:03');
/*!40000 ALTER TABLE `usuario` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary table structure for view `v_stock_sucursal`
--

DROP TABLE IF EXISTS `v_stock_sucursal`;
/*!50001 DROP VIEW IF EXISTS `v_stock_sucursal`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8;
/*!50001 CREATE VIEW `v_stock_sucursal` AS SELECT
 1 AS `sucursal_id`,
  1 AS `sucursal`,
  1 AS `variante_id`,
  1 AS `sku`,
  1 AS `producto_id`,
  1 AS `producto`,
  1 AS `talla`,
  1 AS `color`,
  1 AS `stock_total`,
  1 AS `reservado`,
  1 AS `disponible` */;
SET character_set_client = @saved_cs_client;

--
-- Temporary table structure for view `v_ventas_detalle`
--

DROP TABLE IF EXISTS `v_ventas_detalle`;
/*!50001 DROP VIEW IF EXISTS `v_ventas_detalle`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8;
/*!50001 CREATE VIEW `v_ventas_detalle` AS SELECT
 1 AS `pedido_id`,
  1 AS `numero`,
  1 AS `creado_en`,
  1 AS `canal`,
  1 AS `modalidad`,
  1 AS `estado`,
  1 AS `sucursal_id`,
  1 AS `sucursal`,
  1 AS `departamento`,
  1 AS `vendedor_id`,
  1 AS `cliente_id`,
  1 AS `variante_id`,
  1 AS `sku`,
  1 AS `producto_id`,
  1 AS `producto`,
  1 AS `categoria_id`,
  1 AS `categoria`,
  1 AS `cantidad`,
  1 AS `precio_unitario`,
  1 AS `subtotal` */;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `variante`
--

DROP TABLE IF EXISTS `variante`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `variante` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `producto_id` int(11) NOT NULL,
  `talla_id` int(11) NOT NULL,
  `color_id` int(11) NOT NULL,
  `sku` varchar(40) NOT NULL,
  `codigo_barras` varchar(40) DEFAULT NULL,
  `precio_menor` decimal(12,2) NOT NULL,
  `precio_mayor` decimal(12,2) NOT NULL,
  `costo` decimal(12,2) NOT NULL DEFAULT 0.00,
  `peso_gr` int(11) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sku` (`sku`),
  UNIQUE KEY `uq_variante` (`producto_id`,`talla_id`,`color_id`),
  UNIQUE KEY `codigo_barras` (`codigo_barras`),
  KEY `fk_var_talla` (`talla_id`),
  KEY `fk_var_color` (`color_id`),
  KEY `idx_var_producto` (`producto_id`),
  CONSTRAINT `fk_var_color` FOREIGN KEY (`color_id`) REFERENCES `color` (`id`),
  CONSTRAINT `fk_var_producto` FOREIGN KEY (`producto_id`) REFERENCES `producto` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_var_talla` FOREIGN KEY (`talla_id`) REFERENCES `talla` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `variante`
--

LOCK TABLES `variante` WRITE;
/*!40000 ALTER TABLE `variante` DISABLE KEYS */;
/*!40000 ALTER TABLE `variante` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'aurora'
--

--
-- Current Database: `aurora`
--

USE `aurora`;

--
-- Final view structure for view `v_stock_sucursal`
--

/*!50001 DROP VIEW IF EXISTS `v_stock_sucursal`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = cp850 */;
/*!50001 SET character_set_results     = cp850 */;
/*!50001 SET collation_connection      = cp850_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_stock_sucursal` AS select `s`.`id` AS `sucursal_id`,`s`.`nombre` AS `sucursal`,`v`.`id` AS `variante_id`,`v`.`sku` AS `sku`,`p`.`id` AS `producto_id`,`p`.`nombre` AS `producto`,`t`.`nombre` AS `talla`,`c`.`nombre` AS `color`,sum(`i`.`stock`) AS `stock_total`,sum(`i`.`stock_reservado`) AS `reservado`,sum(`i`.`stock` - `i`.`stock_reservado`) AS `disponible` from ((((((`inventario` `i` join `almacen` `a` on(`a`.`id` = `i`.`almacen_id`)) join `sucursal` `s` on(`s`.`id` = `a`.`sucursal_id`)) join `variante` `v` on(`v`.`id` = `i`.`variante_id`)) join `producto` `p` on(`p`.`id` = `v`.`producto_id`)) join `talla` `t` on(`t`.`id` = `v`.`talla_id`)) join `color` `c` on(`c`.`id` = `v`.`color_id`)) group by `s`.`id`,`s`.`nombre`,`v`.`id`,`v`.`sku`,`p`.`id`,`p`.`nombre`,`t`.`nombre`,`c`.`nombre` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_ventas_detalle`
--

/*!50001 DROP VIEW IF EXISTS `v_ventas_detalle`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = cp850 */;
/*!50001 SET character_set_results     = cp850 */;
/*!50001 SET collation_connection      = cp850_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_ventas_detalle` AS select `pe`.`id` AS `pedido_id`,`pe`.`numero` AS `numero`,`pe`.`creado_en` AS `creado_en`,`pe`.`canal` AS `canal`,`pe`.`modalidad` AS `modalidad`,`pe`.`estado` AS `estado`,`pe`.`sucursal_id` AS `sucursal_id`,`s`.`nombre` AS `sucursal`,`d`.`nombre` AS `departamento`,`pe`.`vendedor_id` AS `vendedor_id`,`pe`.`cliente_id` AS `cliente_id`,`pd`.`variante_id` AS `variante_id`,`v`.`sku` AS `sku`,`pr`.`id` AS `producto_id`,`pr`.`nombre` AS `producto`,`cat`.`id` AS `categoria_id`,`cat`.`nombre` AS `categoria`,`pd`.`cantidad` AS `cantidad`,`pd`.`precio_unitario` AS `precio_unitario`,`pd`.`subtotal` AS `subtotal` from (((((((`pedido` `pe` join `pedido_detalle` `pd` on(`pd`.`pedido_id` = `pe`.`id`)) join `variante` `v` on(`v`.`id` = `pd`.`variante_id`)) join `producto` `pr` on(`pr`.`id` = `v`.`producto_id`)) join `categoria` `cat` on(`cat`.`id` = `pr`.`categoria_id`)) join `sucursal` `s` on(`s`.`id` = `pe`.`sucursal_id`)) join `ciudad` `ci` on(`ci`.`id` = `s`.`ciudad_id`)) join `departamento` `d` on(`d`.`id` = `ci`.`departamento_id`)) where `pe`.`estado` not in ('cancelado','pendiente') */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-27 21:11:07
