# 1. Análisis y requerimientos

## 1.1 Situación problemática

Una tienda de ropa femenina con presencia nacional opera sucursales en varios
departamentos, y más de una sucursal dentro de un mismo departamento. Su
prestigio le trajo un problema de capacidad: **las tiendas se saturan**, y la
saturación se agrava en temporada alta y en cierre de campaña.

La respuesta que la empresa venía dando era abrir más sucursales. Esa decisión
encadena costos que no se detienen:

| Consecuencia de abrir una sucursal más | Costo asociado |
|---|---|
| Alquiler y adecuación del local | Fijo mensual, alto |
| Más personal de piso y caja | Planilla creciente por cada apertura |
| Stock inmovilizado en cada local | Capital de trabajo distribuido |
| Supervisión y logística entre locales | Coordinación manual, sin visibilidad central |

El diagnóstico real es que **la empresa está resolviendo con metros cuadrados un
problema que es de canal**. La clienta va físicamente por dos razones concretas:

1. **Tiene que ir** — no hay un canal digital que reemplace la visita.
2. **Necesita probarse la ropa** — la talla y la caída de una prenda no se
   deducen de una fotografía.

Mientras la segunda razón siga vigente, un e-commerce convencional no descongestiona
nada: la clienta mira en línea y termina yendo igual a la tienda a probarse.

## 1.2 Solución propuesta

AURORA es un sistema de comercio electrónico que ataca las dos razones a la vez:

- Elimina la razón (1) con una **tienda en línea completa** —catálogo, carrito,
  pagos, entrega a domicilio o recojo en tienda— integrada con las mismas
  sucursales, almacenes e inventario que usa la operación física.
- Elimina la razón (2) con un **probador digital**: un modelo corporal generado
  a partir de las medidas de la clienta sobre el cual se renderiza la prenda,
  complementado con **realidad aumentada** para verse la prenda encima con la
  cámara del dispositivo.

A eso se suma un **asistente conversacional con IA** que atiende consultas sobre
la ropa del lado del cliente, y del lado de la empresa resuelve **reportes bajo
demanda por chat y por voz**.

### Efecto esperado sobre el problema original

| Problema | Cómo lo atiende AURORA |
|---|---|
| Tienda llena, colas en temporada | Venta en línea con retiro en tienda o envío; la compra ya no requiere estar en el local |
| Cada sucursal nueva exige más personal | Un pedido online se prepara desde el almacén, no requiere un vendedor por clienta |
| La clienta no puede probarse | Probador digital + RA + talla recomendada por medidas |
| Costos de apertura de sucursales | El crecimiento pasa por el canal digital y el centro de distribución, no por nuevos locales |
| Falta de visibilidad entre sucursales | Inventario multialmacén consolidado y reportes bajo demanda en tiempo real |

## 1.3 Actores del sistema

| Actor | Descripción | Ámbito de datos |
|---|---|---|
| **Administrador** | Configura el sistema completo: usuarios, roles, permisos, sucursales, almacenes, catálogo, promociones. Ve la bitácora. | Nacional |
| **Gerente de sucursal** | Opera y supervisa su sucursal: ventas, stock, caja, personal, reportes. | Su sucursal |
| **Vendedor** | Atiende ventas en mostrador, cobra, prepara pedidos online. | Su sucursal |
| **Almacenero** | Recibe compras, ajusta stock, envía y recibe transferencias entre almacenes. | Sus almacenes |
| **Repartidor** | Recibe pedidos asignados y registra la entrega. | Pedidos asignados |
| **Cliente minorista** | Compra al detalle en la tienda en línea. Usa el probador y el chat. | Sus propios datos |
| **Cliente mayorista** | Compra por volumen con precios escalonados. Requiere NIT validado. | Sus propios datos |
| **Visitante** | Navega el catálogo y usa el probador sin registrarse. | Público |
| **Asistente IA** | Actor no humano: responde consultas de catálogo y ejecuta reportes bajo demanda con las plantillas autorizadas. | Según el permiso de quien pregunta |

## 1.4 Requerimientos funcionales

### Seguridad y administración

| ID | Requerimiento |
|---|---|
| RF-01 | Registrar clientes minoristas y mayoristas; los mayoristas requieren NIT y aprobación manual |
| RF-02 | Autenticar por correo y contraseña, con bloqueo temporal tras 5 intentos fallidos |
| RF-03 | Mantener sesión en dispositivos móviles y offline mediante token de refresco rotatorio |
| RF-04 | Administrar roles y permisos de forma dinámica, sin recompilar ni tocar el código |
| RF-05 | Registrar en bitácora toda operación sensible con usuario, IP, valores previos y nuevos |
| RF-06 | Administrar departamentos, ciudades, sucursales y almacenes |

### Catálogo

| ID | Requerimiento |
|---|---|
| RF-07 | Administrar categorías jerárquicas, marcas, tallas y colores |
| RF-08 | Administrar productos y sus variantes (SKU = producto × talla × color) con precio minorista y mayorista |
| RF-09 | Definir precios escalonados por cantidad para venta al por mayor |
| RF-10 | Buscar en el catálogo por texto libre, categoría, marca, talla, color, rango de precio, temporada y disponibilidad por sucursal |
| RF-11 | Ordenar resultados por relevancia, precio, novedad, más vendidos y mejor calificados |
| RF-12 | Gestionar galería de imágenes por producto y por color |

### Inventario

| ID | Requerimiento |
|---|---|
| RF-13 | Mantener stock por variante y por almacén, con stock reservado y stock mínimo |
| RF-14 | Registrar todo movimiento de inventario con su tipo, referencia y stock resultante |
| RF-15 | Transferir mercadería entre almacenes con flujo de solicitud, aprobación y recepción |
| RF-16 | Alertar cuando el stock disponible cae bajo el mínimo |
| RF-17 | Registrar compras a proveedores y su recepción en almacén |

### Ventas

| ID | Requerimiento |
|---|---|
| RF-18 | Gestionar carrito para clientes registrados y visitantes |
| RF-19 | Aplicar automáticamente precio minorista o mayorista según el tipo de cliente y la cantidad |
| RF-20 | Registrar ventas del canal **online** y del canal **tienda** (mostrador) en el mismo modelo |
| RF-21 | Reservar stock al confirmar un pedido y descontarlo al despacharlo |
| RF-22 | Ofrecer entrega inmediata, recojo en tienda o envío a domicilio |
| RF-23 | Aceptar pagos en efectivo, QR, tarjeta en POS, tarjeta en línea, transferencia y contra entrega |
| RF-24 | Operar caja por sucursal con apertura, movimientos, cierre y arqueo |
| RF-25 | Gestionar el ciclo de vida del pedido con historial de estados |
| RF-26 | Gestionar devoluciones con motivo, aprobación, reingreso de stock y reembolso |
| RF-27 | Administrar campañas y promociones por porcentaje, monto fijo, 2x1 y envío gratis, con cupones |

### Probador digital y realidad aumentada

| ID | Requerimiento |
|---|---|
| RF-28 | Registrar las medidas corporales de la clienta; si solo ingresa estatura y peso, estimar el resto |
| RF-29 | Generar un modelo corporal digital a partir de esas medidas |
| RF-30 | Renderizar una prenda sobre el modelo, respetando talla y color elegidos |
| RF-31 | Calcular la talla recomendada contra la guía de tallas de la categoría e indicar el ajuste esperado |
| RF-32 | Ofrecer un modo de realidad aumentada que superponga la prenda sobre la imagen de la cámara |
| RF-33 | Registrar cada prueba virtual y si terminó en compra, para medir su efectividad |
| RF-34 | Corregir la recomendación de talla con las reseñas reales de ajuste de otras clientas |

### Asistente de IA

| ID | Requerimiento |
|---|---|
| RF-35 | Chat donde la clienta pregunta sobre la ropa y el asistente responde consultando el catálogo real |
| RF-36 | Recomendar prendas según ocasión, presupuesto, talla y preferencias declaradas |
| RF-37 | Permitir al personal autorizado pedir reportes en lenguaje natural, por texto y por voz |
| RF-38 | Resolver esos reportes sobre plantillas SQL autorizadas y parametrizadas, nunca con SQL generado libremente |
| RF-39 | Respetar el ámbito de datos del usuario: un gerente solo obtiene datos de su sucursal |
| RF-40 | Registrar cada consulta con su pregunta, plantilla, parámetros y resultado |

### Reportes

| ID | Requerimiento |
|---|---|
| RF-41 | Reportes clásicos: ventas por período, por sucursal, por producto, por vendedor, stock, devoluciones |
| RF-42 | Reportes bajo demanda con rangos horarios arbitrarios y filtros combinados |
| RF-43 | Exportar cualquier reporte a PDF y a hoja de cálculo |
| RF-44 | Presentar resultados como tabla o gráfico según la naturaleza del dato |

### Operación offline

| ID | Requerimiento |
|---|---|
| RF-45 | Instalarse como aplicación (PWA) en escritorio y móvil |
| RF-46 | Navegar el catálogo previamente visitado sin conexión |
| RF-47 | Registrar ventas de mostrador sin conexión y encolarlas |
| RF-48 | Sincronizar automáticamente al recuperar la red, sin duplicar operaciones |
| RF-49 | Informar visiblemente el estado de conexión y cuántas operaciones están pendientes |
| RF-50 | Resolver conflictos de stock detectados durante la sincronización y notificarlos |

## 1.5 Requerimientos no funcionales

| ID | Categoría | Requerimiento |
|---|---|---|
| RNF-01 | Restricción | Sin frameworks, CMS ni generadores de código: PHP puro, JS vanilla, Flutter |
| RNF-02 | Disponibilidad | Las funciones críticas de venta operan sin conexión |
| RNF-03 | Rendimiento | Respuesta de catálogo bajo 500 ms con 10.000 variantes |
| RNF-04 | Rendimiento | Reporte bajo demanda resuelto en menos de 5 s |
| RNF-05 | Seguridad | Contraseñas con bcrypt costo 12; nunca en claro ni en bitácora |
| RNF-06 | Seguridad | Toda consulta a base de datos por sentencia preparada |
| RNF-07 | Seguridad | Autorización por permiso en cada endpoint, verificada en el servidor |
| RNF-08 | Seguridad | Límite de tasa en autenticación y en los endpoints de IA |
| RNF-09 | Auditoría | Toda operación sensible queda en bitácora con usuario, IP y valores |
| RNF-10 | Usabilidad | Interfaz responsiva desde 320 px |
| RNF-11 | Accesibilidad | Contraste AA, navegación por teclado, etiquetas en formularios |
| RNF-12 | Portabilidad | Web, Android e iOS contra la misma API REST |
| RNF-13 | Mantenibilidad | Backend modular; el contrato HTTP declarado en un solo archivo |
| RNF-14 | Integridad | Reglas de negocio críticas respaldadas por restricciones de base de datos |
| RNF-15 | Idempotencia | Toda operación sincronizada lleva clave de idempotencia |

## 1.6 Reglas de negocio

| ID | Regla |
|---|---|
| RN-01 | El precio mayorista solo aplica a clientes mayoristas aprobados |
| RN-02 | Si la cantidad alcanza una escala de precio, se usa el precio de esa escala |
| RN-03 | No se puede vender por encima del stock disponible (stock − reservado) |
| RN-04 | Confirmar un pedido reserva stock; despacharlo lo descuenta; cancelarlo lo libera |
| RN-05 | Una venta de mostrador descuenta del almacén principal de su sucursal |
| RN-06 | Un pedido online se atiende desde el almacén con stock más cercano al destino |
| RN-07 | Solo se aceptan métodos marcados como disponibles offline cuando no hay conexión |
| RN-08 | Una devolución aprobada reingresa stock solo si la prenda vuelve en estado nuevo |
| RN-09 | Un usuario sin permiso `sucursal.ver_todas` solo accede a datos de su sucursal |
| RN-10 | La talla recomendada surge de la guía de la categoría, ajustada por las reseñas de ajuste real |
| RN-11 | Un cliente solo reseña productos que compró y recibió |
| RN-12 | Una promoción se aplica una sola vez por pedido y respeta su tope de usos |
| RN-13 | La caja debe estar abierta para registrar un cobro en efectivo en mostrador |
| RN-14 | Cambiar la contraseña revoca las demás sesiones del usuario |
