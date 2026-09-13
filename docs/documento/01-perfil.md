# 1. PERFIL

## 1.1. INTRODUCCIÓN

El comercio de indumentaria femenina en Bolivia se sostiene sobre un modelo que
lleva décadas sin cambiar: la clienta se traslada al local, recorre las perchas,
espera turno en el probador y hace fila en la caja. Ese modelo funciona mientras
la demanda sea moderada; deja de funcionar cuando una marca gana prestigio y su
público crece más rápido que la superficie de sus tiendas.

La empresa que motiva este proyecto atraviesa exactamente esa situación. Su
crecimiento la llevó a operar sucursales en varios departamentos del país, con
más de un local dentro de un mismo departamento, y aun así sus tiendas se
saturan. La saturación se agudiza en temporada alta y en los cierres de campaña,
cuando la afluencia se multiplica y el tiempo de atención por clienta se
convierte en el cuello de botella de todo el negocio.

Frente a ese escenario, la respuesta que la empresa venía dando era la más
intuitiva y también la más costosa: abrir más sucursales. Cada apertura, sin
embargo, arrastra una cadena de costos que no se detiene —alquiler, adecuación
del local, contratación de personal de piso y caja, stock inmovilizado,
supervisión— y que crece de manera lineal con el número de locales, sin resolver
la causa del problema.

El diagnóstico que da origen a este trabajo es que **la empresa está intentando
resolver con metros cuadrados un problema que es de canal**. La clienta acude al
local por dos razones concretas: porque no existe un canal digital que reemplace
la visita, y porque necesita probarse la prenda antes de comprarla. Mientras la
segunda razón siga vigente, un comercio electrónico convencional no descongestiona
nada: la clienta navega el catálogo en línea y termina yendo igual a la tienda a
probarse la ropa.

**AURORA** se propone como un sistema de comercio electrónico que ataca ambas
razones simultáneamente. Por un lado implementa una tienda en línea completa
—catálogo, carrito, pagos, entrega a domicilio o retiro en tienda— integrada con
las mismas sucursales, almacenes e inventario que sostienen la operación física,
de modo que los canales no compiten sino que comparten stock. Por otro lado, y
esta es la contribución diferencial del proyecto, incorpora un **probador digital
con realidad aumentada**: a partir de la estatura y el peso de la clienta —o de
sus medidas completas si decide aportarlas— el sistema construye un modelo
corporal sobre el cual se renderiza la prenda, calcula la talla recomendada
contra una guía de tallas por categoría y permite, mediante la cámara del
dispositivo, verse la prenda superpuesta en tiempo real.

A ello se suma un **asistente conversacional basado en inteligencia artificial**
que atiende las consultas de la clienta sobre las prendas del catálogo real, y
que del lado de la empresa habilita una capacidad que los sistemas tradicionales
no ofrecen: **reportes bajo demanda solicitados por chat y por voz**. Un gerente
puede preguntar en lenguaje natural por las ventas de una sucursal determinada
en un rango horario arbitrario y obtener la respuesta en segundos, sin depender
de que alguien haya programado ese reporte de antemano.

Finalmente, el sistema se concibe desde el inicio como una **aplicación web
progresiva capaz de operar sin conexión a internet**. Esta decisión no es un
adorno técnico: en el contexto boliviano, la intermitencia de la conectividad en
locales comerciales es real, y una caja que deja de vender porque se cayó la red
es una pérdida directa. AURORA permite registrar ventas sin conexión, las encola
localmente y las sincroniza al recuperar la red sin duplicarlas.

## 1.2. OBJETIVO GENERAL

Desarrollar e implementar un sistema de comercio electrónico multisucursal para
una cadena nacional de indumentaria femenina, que integre un probador digital con
realidad aumentada y un asistente conversacional con inteligencia artificial, con
el fin de trasladar al canal digital la experiencia de compra presencial, reducir
la saturación de las tiendas físicas y contener los costos de expansión de la
empresa.

## 1.3. OBJETIVOS ESPECÍFICOS

- Construir un catálogo de productos con variantes de talla y color, dotado de
  múltiples mecanismos de búsqueda —texto libre, categoría, marca, talla, color,
  rango de precio, temporada y disponibilidad por sucursal— accesible sin
  necesidad de registro previo.

- Implementar un módulo de inventario multialmacén que mantenga el stock por
  variante y por almacén, registre todo movimiento con su trazabilidad y permita
  transferencias entre almacenes de distintas sucursales.

- Desarrollar un proceso de venta unificado que atienda tanto el canal en línea
  como la venta de mostrador, y que aplique automáticamente precios minoristas o
  mayoristas según el tipo de cliente y la cantidad adquirida.

- Incorporar múltiples formas de pago —efectivo, código QR, tarjeta en punto de
  venta, tarjeta en línea, transferencia bancaria y pago contra entrega— junto a
  las modalidades de entrega inmediata, retiro en tienda y envío a domicilio.

- Implementar un probador digital que genere un modelo corporal a partir de las
  medidas de la clienta, renderice sobre él las prendas del catálogo y calcule la
  talla recomendada con su ajuste esperado.

- Extender el probador con un modo de realidad aumentada que superponga la prenda
  sobre la imagen capturada por la cámara del dispositivo.

- Desarrollar un asistente conversacional con inteligencia artificial que
  responda consultas sobre las prendas del catálogo y oriente la decisión de
  compra.

- Habilitar la generación de reportes bajo demanda mediante lenguaje natural, por
  texto y por voz, sobre consultas parametrizadas y autorizadas, respetando el
  ámbito de datos de cada usuario.

- Diseñar el sistema como aplicación web progresiva capaz de operar sin conexión,
  con sincronización idempotente de las operaciones registradas fuera de línea.

- Desarrollar una aplicación móvil en Flutter que consuma la misma interfaz de
  programación de aplicaciones que el cliente web.

- Implementar un esquema de seguridad basado en roles y permisos administrables
  en tiempo de ejecución, con registro de auditoría de todas las operaciones
  sensibles.

## 1.4. DESCRIPCIÓN DEL PROBLEMA

La empresa es una cadena de tiendas de ropa femenina con presencia en varios
departamentos de Bolivia y con más de un local en algunos de ellos. Su operación
actual es enteramente presencial: la venta ocurre en mostrador, el inventario se
administra por local y la información de cada sucursal no se consolida de forma
automática.

El prestigio alcanzado por la marca produjo un efecto que la empresa no
anticipó. El volumen de clientas superó la capacidad física de atención de los
locales. Las tiendas permanecen llenas, y la situación se agrava en dos momentos
específicos del calendario comercial: la temporada alta y el cierre de campaña,
cuando la concentración de público vuelve inviable atender con la calidad que la
marca busca proyectar.

La lectura que la empresa hizo del problema fue de capacidad instalada, y en
consecuencia la respuesta fue abrir nuevas sucursales. Esta decisión genera los
siguientes costos:

| Consecuencia | Naturaleza del costo |
|---|---|
| Alquiler y adecuación de cada local nuevo | Fijo, mensual, elevado |
| Contratación de personal de piso y caja por sucursal | Planilla creciente con cada apertura |
| Stock distribuido e inmovilizado en cada local | Capital de trabajo fragmentado |
| Supervisión y logística entre locales | Coordinación manual, sin visibilidad central |
| Riesgo de quiebre de stock en un local con excedente en otro | Venta perdida por falta de consolidación |

El problema de fondo es que la apertura de sucursales no ataca la causa de la
concentración de público, sino que reparte esa concentración entre más locales,
replicando el costo en cada uno. Las razones por las que la clienta debe
trasladarse físicamente permanecen intactas:

1. **Obligación de asistir.** No existe un canal alternativo que permita completar
   la compra a distancia. Toda transacción exige presencia física.

2. **Imposibilidad de probarse la prenda a distancia.** En el rubro de la
   indumentaria, la talla y la caída de una prenda no se deducen de una
   fotografía. La incertidumbre sobre el calce es el principal motivo de
   abandono de compra en línea y la principal causa de devolución.

A estas dos razones se suman deficiencias operativas derivadas de la ausencia de
un sistema integrado:

3. **Falta de visibilidad consolidada del inventario.** No es posible conocer en
   tiempo real la disponibilidad de una prenda en toda la red, lo que impide
   derivar una venta a otra sucursal o al centro de distribución.

4. **Reportes rígidos y tardíos.** La información gerencial depende de reportes
   previamente programados. Una consulta específica —el comportamiento de una
   sucursal en una franja horaria concreta— requiere solicitud e intervención
   técnica, y llega cuando la decisión ya se tomó.

5. **Dependencia total de la conectividad.** Una interrupción del servicio de
   internet en un local detiene por completo la capacidad de registrar ventas.

6. **Ausencia de canal para venta mayorista.** La atención a clientes que compran
   por volumen se realiza por los mismos canales que la venta al detalle, sin
   precios escalonados ni condiciones diferenciadas.

El sistema propuesto aborda estas seis dimensiones en un único producto,
sustituyendo la estrategia de expansión física por una estrategia de expansión
de canal.

## 1.5. ALCANCE

El sistema se organiza en los siguientes módulos.

### 1.5.1. Módulo de Autenticación y Autorización

Registro de clientes minoristas y mayoristas, inicio y cierre de sesión con
tokens de acceso y de refresco, bloqueo temporal de cuenta ante intentos fallidos
reiterados, recuperación y cambio de contraseña. Administración dinámica de roles
y permisos, de modo que un administrador pueda definir un rol nuevo y asignarle
privilegios sin intervención sobre el código. Registro de auditoría de todas las
operaciones sensibles, con usuario, dirección de red, valores previos y valores
resultantes.

### 1.5.2. Módulo de Usuarios y Organización

Administración del personal de la empresa y su asignación a sucursales.
Administración de la estructura territorial —departamentos y ciudades—, de las
sucursales de la cadena y de los almacenes que operan dentro de cada sucursal,
distinguiendo entre almacén de piso de venta, depósito, devoluciones y tránsito.
Administración del perfil, direcciones de envío y medidas corporales de los
clientes.

### 1.5.3. Módulo de Catálogo

Administración de categorías jerárquicas, marcas, tallas y colores. Alta de
productos y generación de sus variantes vendibles como combinación de talla y
color, cada una con su propio código, código de barras, precio minorista, precio
mayorista y escalas de precio por cantidad. Gestión de la galería de imágenes por
producto y por color, y de los recursos tridimensionales que consume el probador.
Búsqueda por texto completo y por filtros combinados, con ordenamiento por
relevancia, precio, novedad, productos más vendidos y mejor calificados.

### 1.5.4. Módulo de Inventario

Control de existencias por variante y por almacén, distinguiendo stock físico,
stock reservado y stock mínimo. Registro de todo movimiento de inventario con su
tipo, cantidad, existencia resultante, documento de referencia y responsable.
Transferencias entre almacenes con flujo de solicitud, aprobación, despacho y
recepción. Alertas por existencias bajo el mínimo configurado. Administración de
proveedores, registro de órdenes de compra y recepción de mercadería.

### 1.5.5. Módulo de Ventas

Carrito de compras para clientes registrados y visitantes. Determinación
automática del precio aplicable según el tipo de cliente y la cantidad. Proceso
de compra en línea con selección de dirección, modalidad de entrega y promoción.
Registro de ventas de mostrador con búsqueda por código de barras. Reserva de
existencias al confirmar el pedido y descuento al despacharlo. Gestión del ciclo
de vida del pedido con historial de estados. Administración de campañas
promocionales, promociones y cupones de descuento. Gestión de devoluciones con
motivo, aprobación, reingreso condicional de existencias y reembolso.

### 1.5.6. Módulo de Pagos y Caja

Registro de pagos por efectivo, código QR, tarjeta en punto de venta, tarjeta en
línea, transferencia bancaria y pago contra entrega, con carga de comprobante
cuando el método lo exige. Apertura de caja por sucursal y turno, registro de
movimientos de ingreso y egreso, y cierre con arqueo y cálculo de diferencia.

### 1.5.7. Módulo de Entregas

Modalidades de entrega inmediata, retiro en tienda y envío a domicilio. Asignación
de pedidos a repartidores, seguimiento del estado del envío y registro de la
entrega con evidencia.

### 1.5.8. Módulo de Probador Digital y Realidad Aumentada

Registro de las medidas corporales de la clienta, con estimación de las medidas
faltantes cuando sólo se aportan estatura y peso. Generación de un modelo
corporal paramétrico y clasificación del tipo de cuerpo. Renderizado de la prenda
seleccionada sobre el modelo, respetando talla y color. Cálculo de la talla
recomendada contra la guía de tallas de la categoría, con indicación del ajuste
esperado. Modo de realidad aumentada que superpone la prenda sobre la imagen de
la cámara mediante detección de puntos corporales. Registro de cada prueba
virtual y de su conversión en compra. Reseñas de las clientas con calificación y
ajuste real percibido, empleadas para corregir la recomendación de talla.

### 1.5.9. Módulo de Inteligencia Artificial

Asistente conversacional que responde consultas de las clientas sobre las prendas
del catálogo real y formula recomendaciones según ocasión, presupuesto y talla.
Interfaz de reportes bajo demanda para el personal autorizado, con entrada por
texto y por voz, que traduce la solicitud en lenguaje natural a una consulta
parametrizada sobre plantillas previamente autorizadas, respetando el ámbito de
datos del solicitante. Registro de cada consulta con su pregunta, plantilla,
parámetros, resultado y duración.

### 1.5.10. Módulo de Reportes

Reportes de ventas por período, sucursal, producto, categoría, vendedor, canal y
modalidad; reportes de existencias y de existencias bajo el mínimo; reportes de
devoluciones por motivo; reportes de efectividad del probador virtual.
Presentación en tabla o gráfico según la naturaleza del dato y exportación a
documento portátil y a hoja de cálculo.

### 1.5.11. Módulo de Operación sin Conexión y Sincronización

Instalación de la aplicación web como aplicación progresiva en escritorio y
dispositivo móvil. Almacenamiento local del catálogo consultado y del armazón de
la aplicación. Registro de ventas de mostrador sin conexión con encolamiento
local. Sincronización automática por lote al recuperar la red, con claves de
idempotencia que impiden la duplicación de operaciones. Detección, registro y
notificación de conflictos de existencias surgidos durante la sincronización.
Indicador permanente del estado de conexión y de la cantidad de operaciones
pendientes.

### 1.5.12. Módulo de Notificaciones

Notificaciones al cliente sobre el estado de su pedido y sobre campañas vigentes.
Notificaciones al personal sobre existencias bajo el mínimo, pedidos pendientes de
preparación, solicitudes de transferencia y devoluciones por gestionar.

### 1.5.13. Fuera del alcance

- Facturación electrónica ante el Servicio de Impuestos Nacionales.
- Integración con sistemas de planificación de recursos empresariales preexistentes.
- Contabilidad, planilla salarial y gestión de recursos humanos.
- Confección de los modelos tridimensionales de las prendas, que se asumen
  provistos como insumo.
- Aplicación para clientes en sistema operativo iOS distribuida por tienda
  oficial; la entrega móvil comprende el archivo de instalación para Android.
