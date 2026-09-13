# 6. Plan de entrega — hasta el 23 de septiembre

Fecha de inicio: **27 de agosto de 2026**. Entrega: **23 de septiembre de 2026**.
Disponibles: **27 días**.

El orden no es arbitrario: cada sprint deja algo demostrable y desbloquea al
siguiente. El riesgo alto (offline, RA, IA) se ataca temprano, no al final.

---

## Sprint 0 — Fundación ✅ COMPLETADO

| Entregable | Estado |
|---|---|
| Modelo de datos completo: 46 tablas + 2 vistas de reporte | ✅ cargado y verificado en MariaDB |
| Núcleo del backend sin dependencias: router, PDO, JWT, validador, RBAC, bitácora, límite de tasa | ✅ |
| Módulo de autenticación: registro, login, refresh rotatorio, perfil, cambio de contraseña | ✅ probado end-to-end |
| Datos iniciales: 6 roles, 31 permisos, 9 departamentos, 5 sucursales, 8 almacenes, tallas, colores, guía de tallas, métodos de pago, 8 plantillas de reporte | ✅ |
| Documentación de análisis y arquitectura | ✅ |

**Verificado:** login correcto y fallido, validación 422, 401 sin token, 403 sin
permiso, 405 por verbo incorrecto, bitácora registrando IP y acción.

---

## Sprint 1 — Catálogo e inventario · 28 ago – 2 sep

Sin catálogo no hay nada que vender, y sin inventario multialmacén el problema
de las sucursales queda sin resolver.

- [ ] CRUD de categorías, marcas, tallas y colores
- [ ] CRUD de productos y generación masiva de variantes (talla × color)
- [ ] Carga de imágenes por producto y por color
- [ ] Escalas de precio para mayoreo
- [ ] Búsqueda del catálogo: texto completo, filtros combinados, orden, paginación
- [ ] Disponibilidad por sucursal en la ficha de producto
- [ ] Inventario: consulta, ajuste manual con motivo, alertas de stock mínimo
- [ ] Transferencias entre almacenes: solicitar → aprobar → despachar → recibir
- [ ] Compras a proveedores y recepción en almacén
- [ ] CRUD de sucursales, almacenes y usuarios del personal
- [ ] Gestión de roles y permisos desde la interfaz
- [ ] Consulta de bitácora con filtros

**Demostrable al cierre:** un administrador crea un producto con 18 variantes,
lo distribuye entre tres almacenes, transfiere stock entre sucursales y todo
queda en bitácora.

---

## Sprint 2 — Ventas, pagos y PWA · 3 – 9 sep

- [ ] Carrito para cliente registrado y visitante
- [ ] Cálculo de precio: minorista, mayorista y escalas por cantidad
- [ ] Checkout online: dirección, tipo de entrega, promoción, resumen
- [ ] Venta de mostrador (POS): búsqueda por código de barras, cobro rápido
- [ ] Reserva y descuento de stock según el estado del pedido
- [ ] Pagos: efectivo, QR, tarjeta POS, tarjeta online, transferencia, contra entrega
- [ ] Caja: apertura, movimientos, cierre con arqueo y diferencia
- [ ] Ciclo de vida del pedido con historial de estados
- [ ] Envíos y asignación a repartidor
- [ ] Devoluciones con reingreso condicional de stock
- [ ] Campañas, promociones y cupones
- [ ] **PWA:** manifiesto, Service Worker, instalación, armazón de la tienda
- [ ] Pantallas cliente: inicio, catálogo, ficha, carrito, checkout, mis pedidos
- [ ] Pantallas empresa: panel, POS, pedidos, inventario, administración

**Demostrable al cierre:** una compra completa en línea y una venta de mostrador,
ambas descontando del almacén correcto, con la app instalable desde el navegador.

---

## Sprint 3 — Probador, IA y reportes · 10 – 15 sep

Las dos novedades del proyecto, más el requisito de reportes bajo demanda.

- [ ] Registro de medidas corporales y estimación desde altura y peso
- [ ] Generación de parámetros del avatar y clasificación de tipo de cuerpo
- [ ] Render del avatar con la prenda superpuesta (modo por defecto)
- [ ] Cálculo de talla recomendada contra `guia_talla` + ajuste esperado
- [ ] Corrección de la recomendación con las reseñas de ajuste real
- [ ] **Modo RA:** cámara, detección de pose, anclaje y escalado de la prenda
- [ ] Captura y registro de la prueba virtual; métrica de conversión
- [ ] Asistente de compra: chat sobre el catálogo real, con recomendaciones
- [ ] Reportes bajo demanda por **texto**: selección de plantilla + parámetros validados
- [ ] Reportes bajo demanda por **voz**: transcripción local y lectura de la respuesta
- [ ] Imposición del ámbito de sucursal en el servidor
- [ ] Reportes clásicos con gráficos y exportación a PDF y hoja de cálculo

**Demostrable al cierre:** una clienta se prueba un vestido con la cámara y
recibe su talla; un gerente pide por voz «ventas de Ventura de 14:00 a 18:00 de
ayer» y obtiene el gráfico.

---

## Sprint 4 — Móvil y modo offline · 16 – 20 sep

- [ ] Proyecto Flutter: navegación, tema, cliente HTTP, almacenamiento seguro del token
- [ ] Pantallas móviles: catálogo, ficha, carrito, checkout, pedidos, probador
- [ ] POS móvil para vendedores con escaneo de código de barras
- [ ] Base SQLite local y cola de operaciones pendientes
- [ ] **Offline en el PWA:** caché por tipo de recurso, cola en IndexedDB, indicador de estado
- [ ] Endpoint de sincronización por lote con claves de idempotencia
- [ ] Resolución y notificación de conflictos de stock
- [ ] Notificaciones push de pedidos y stock bajo
- [ ] Prueba real: cortar la red, vender, restaurar la red, verificar que no se duplicó

**Demostrable al cierre:** con el Wi-Fi apagado se registran tres ventas; al
reconectar aparecen una sola vez cada una en el servidor.

---

## Sprint 5 — Despliegue y cierre · 21 – 23 sep

- [ ] Despliegue de API y PWA en hosting con HTTPS
- [ ] Base de datos de producción con datos de demostración realistas
- [ ] APK firmado apuntando a la API de producción
- [ ] Repaso de seguridad: `APP_DEBUG=false`, CORS cerrado, secreto rotado
- [ ] Datos de prueba: ~60 productos, ~600 variantes, ~400 ventas repartidas en el año para que los reportes tengan sustancia
- [ ] Manual de usuario por rol
- [ ] Documentación final: casos de uso, diccionario de datos, contrato REST
- [ ] Guion de la demostración

---

## Riesgos y cómo se mitigan

| Riesgo | Impacto | Mitigación |
|---|---|---|
| La RA con cámara consume más tiempo del previsto | Alto | El modo avatar es el predeterminado y funciona sin cámara; la RA se construye encima, no debajo |
| El hosting compartido limita PHP o CORS | Alto | Verificar el despliegue en el Sprint 2, no en el 5 |
| Los reportes por voz fallan en navegadores sin Web Speech API | Medio | El campo de texto siempre está disponible; la voz es un atajo, no la única vía |
| La sincronización offline duplica ventas | Alto | Claves de idempotencia únicas desde el diseño de la base, ya implementadas |
| El docente exige otro stack | Medio | Esquema SQL, contrato REST, PWA y Flutter son independientes del lenguaje del backend |
| Costo o latencia de la API de IA | Bajo | Límite de tasa por usuario; caché de respuestas frecuentes; toda consulta queda registrada |

## Hitos de control

| Fecha | Debe estar funcionando |
|---|---|
| 2 sep | Catálogo e inventario multialmacén completos |
| 9 sep | Compra online y venta de mostrador de punta a punta |
| 15 sep | Probador con RA + reportes por chat y voz |
| 20 sep | App Flutter y modo offline verificados |
| 23 sep | Todo desplegado, con datos y documentación |
