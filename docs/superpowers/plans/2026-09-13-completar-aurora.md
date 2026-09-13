# Plan de cierre de AURORA — Parcial 1 de SI2

> **Para quien ejecute:** las tareas van en orden. Cada una termina con algo
> probado y comiteado. Los pasos usan `- [ ]` para ir tachando.

**Objetivo:** completar lo que falta de la plataforma para la entrega del 23 de
septiembre de 2026.

**Arquitectura:** el backend ya está entero (12 módulos, 96 endpoints) y el PWA
cubre tienda y mostrador. Lo que falta son las dos novedades que el enunciado
exige —probador con RA y asistente de IA—, los huecos del alcance declarado, el
móvil, el despliegue y seis capítulos del documento. Nada de esto reemplaza lo
hecho: todo se monta encima.

**Stack:** NestJS 11 + Prisma + PostgreSQL 16 · React 19 + Vite (PWA) ·
React Native (Expo) · Azure.

**Estado del que parte:** `ESTADO.md` en la raíz. 423 pruebas en verde,
commit `4e52cc1`, subido a github.com/santiagoarteaga0704/Aurora.

---

## Restricciones globales

- **Español sin tildes en el código** (nombres, comentarios), con tildes en los
  textos que ve el usuario. Es la convención que ya sigue todo el repo.
- **El modelo de datos no se toca.** La fuente de verdad es
  `database/schema.postgres.sql`. Nada de `prisma db push` ni `migrate`.
- **Todo movimiento de stock pasa por `StockService`.** Ninguna excepción.
- **El precio y el descuento los decide el servidor.** Siempre.
- **Cada módulo nuevo suma su suite** a `scripts/probar-todo.mjs` y todas tienen
  que quedar en verde antes de comitear.
- **Verificación visual obligatoria** para toda pantalla nueva: captura headless
  con Edge antes de darla por hecha. Ya encontró cinco defectos que el
  typecheck no ve.

---

## Bloqueos que NO dependen de mí

Estos tres no los puedo resolver solo. Todo lo demás avanza sin ellos.

| # | Bloqueo | Qué hace falta | Qué queda bloqueado |
|---|---|---|---|
| B1 | **Cuenta de Azure** | Que Santiago active Azure for Students con el correo de la UAGRM | Tarea 9 entera |
| B2 | **Cuenta de Expo** | Credenciales de Expo para EAS Build | El `.apk` de la tarea 8 (la app se construye igual) |
| B3 | **Clave de IA** | Decidir Claude o Azure OpenAI, y la clave | Solo la *mejora* del asistente. Ver tarea 1: el asistente funciona sin clave |
| B4 | **Datos de portada** | Grupo, registro, integrantes | El armado final del entregable (tarea 10) |
| B5 | **Confirmar el stack** | Hablar con el docente | Nada técnico, pero decide si todo esto sirve |

---

# FASE 1 — Las dos novedades del enunciado

Es lo que distingue a AURORA de un e-commerce cualquiera, y lo primero que el
docente va a mirar.

## Tarea 1: Asistente de IA y reportes por chat y voz

**Tablas que conecta:** `conversacion`, `mensaje`, y `consulta_reporte` con su
`conversacion_id`.

**Decisión de arquitectura — se resuelve sin clave de IA.**

El asistente NO depende de que haya una clave configurada. Se resuelve en dos
capas:

1. **Intérprete determinista** (siempre): un analizador en español que mapea la
   pregunta a `{codigo_plantilla, parametros}` usando las 8 plantillas y sus
   parámetros declarados. Reconoce fechas relativas ("ayer", "la semana
   pasada", "este mes"), sucursales por nombre y los sinónimos de cada reporte.
2. **Modelo de lenguaje** (si hay clave): cuando el intérprete no está seguro,
   se le pasa al modelo el catálogo de plantillas y la pregunta, y devuelve el
   mismo `{codigo, parametros}`. **Nunca SQL.**

Por qué así y no al revés: si el demo depende de una clave y ese día no hay
saldo o no hay internet, no hay asistente. Con el intérprete, siempre hay algo
que mostrar, y el modelo lo mejora. Es la misma decisión que se tomó en FORJA.

**Archivos:**
- Crear: `packages/contratos/src/asistente.ts`
- Crear: `apps/api/src/modulos/asistente/interprete.service.ts`
- Crear: `apps/api/src/modulos/asistente/modelo.service.ts`
- Crear: `apps/api/src/modulos/asistente/asistente.service.ts`
- Crear: `apps/api/src/modulos/asistente/asistente.controller.ts`
- Crear: `apps/api/src/modulos/asistente/asistente.module.ts`
- Crear: `apps/web/src/operaciones/Asistente.tsx`
- Crear: `scripts/probar-asistente.mjs`
- Modificar: `apps/api/src/app.module.ts`, `packages/contratos/src/index.ts`,
  `apps/web/src/App.tsx`, `apps/web/src/operaciones/LayoutOperaciones.tsx`,
  `scripts/probar-todo.mjs`

**Interfaces:**
- Consume: `ReportesService.ejecutar(codigo, datos, usuario, ctx)` del módulo de
  reportes, y `ReportesService.plantillas(usuario)` para el catálogo.
- Produce: `InterpreteService.interpretar(texto, plantillas, ahora)` →
  `{ codigo: string | null, parametros: Record<string, unknown>, confianza: number, motivo: string }`

- [ ] **1.1** Contrato: `conversacionSchema`, `preguntarSchema`, tipos
      `Conversacion`, `Mensaje`, `RespuestaAsistente`.
- [ ] **1.2** `InterpreteService` con su suite: fechas relativas, sucursal por
      nombre, sinónimos por plantilla, y el caso de "no entendí".
- [ ] **1.3** `ModeloService`: adaptador detrás de una interfaz. Implementación
      para Claude leyendo `ANTHROPIC_API_KEY`; si está vacía, devuelve `null` y
      el asistente se queda con el intérprete. **Antes de escribirlo, cargar la
      skill `claude-api`** (el repo toca la API de Anthropic).
- [ ] **1.4** `AsistenteService`: conversación, mensajes, y el puente al motor
      de reportes. Registra `consulta_reporte.conversacion_id`.
- [ ] **1.5** Controlador y módulo. Permiso: `ia.asistente` para el chat,
      `reporte.demanda` para pedir reportes.
- [x] **1.6** Pantalla de chat en operaciones, con **entrada por voz** usando
      `SpeechRecognition` del navegador (es lo que pide el enunciado: "por chat
      y voz"). Si el navegador no lo soporta, se oculta el micrófono.
- [x] **1.7** Suite `probar-asistente.mjs`: el intérprete acierta sin clave, el
      resultado sale por el motor de reportes, el alcance por sucursal se
      respeta, y una pregunta con intención de inyección no produce SQL.
- [x] **1.8** Captura headless de la pantalla. Commit.

**Verificación:** `npm run pruebas` en verde. Preguntar "¿cuánto se vendió ayer?"
sin clave de IA configurada tiene que devolver el reporte.

---

### Hallazgo durante la Tarea 1 — datos de demostracion planos

`scripts/datos-demo.mjs` crea los pedidos por la API, asi que el servidor les
pone la hora actual. Todas las ventas de ejemplo quedan en el mismo instante.

Consecuencia: `ventas_por_rango` dibuja **una sola barra**, `ventas_por_hora`
**una sola hora**, y "el mes pasado" sale vacio. Los reportes funcionan —las 460
pruebas lo confirman— pero en la demostracion parecen rotos, que a efectos de la
defensa es lo mismo.

No se arregla desde la API: la fecha la pone el servidor y esta bien que asi
sea. Hace falta un pase de SQL despues de sembrar que reparta los pedidos sobre
las ultimas semanas. Se hace junto con el resto de los datos de demostracion,
antes de las capturas del documento (Tarea 10).

---

## Tarea 2: Probador virtual

**Tablas que conecta:** `medida_cliente`, `avatar`, `prueba_virtual`.

**Cómo funciona el cálculo de talla:** las medidas de la clienta se comparan
contra `guia_talla`, que ya está sembrada (24 filas) y ya se sirve por API. Si
solo hay estatura y peso, se estiman busto, cintura y cadera con una relación
antropométrica simple y se marca el `origen` como `estimado` — la tabla
`medida_cliente` ya tiene esa columna, justamente para no mentir sobre de dónde
salió el dato.

**Archivos:**
- Crear: `packages/contratos/src/probador.ts`
- Crear: `apps/api/src/modulos/probador/medidas.service.ts`
- Crear: `apps/api/src/modulos/probador/tallas.service.ts`
- Crear: `apps/api/src/modulos/probador/probador.controller.ts`
- Crear: `apps/api/src/modulos/probador/probador.module.ts`
- Crear: `apps/web/src/tienda/MisMedidas.tsx`
- Crear: `apps/web/src/tienda/Probador.tsx`
- Modificar: `apps/web/src/tienda/Producto.tsx` (botón "¿Cuál es mi talla?")
- Crear: `scripts/probar-probador.mjs`

**Interfaces:**
- Produce: `TallasService.recomendar(clienteId, categoriaId)` →
  `{ talla_id, talla, ajuste: 'justo'|'holgado'|'ajustado', confianza, motivo }`

- [x] **2.1** Contrato: `medidasSchema` (altura, peso, busto, cintura, cadera,
      todas opcionales salvo altura y peso), tipos de recomendación.
- [x] **2.2** `MedidasService`: guardar y leer las medidas del cliente de la
      sesión. Nadie lee las medidas de otro.
- [x] **2.3** `TallasService.recomendar` con su suite: talla exacta, entre dos
      tallas, fuera de la guía, y medidas estimadas desde altura y peso.
- [x] **2.4** Registrar cada prueba en `prueba_virtual`, con
      `convirtio_en_compra` que se marca al comprar esa variante. Eso alimenta
      el reporte `efectividad_probador`, que hoy corre pero siempre da vacío.
- [x] **2.5** Pantalla "Mis medidas" en la tienda.
- [x] **2.6** En la ficha de producto, botón que devuelve la talla recomendada.
- [x] **2.7** Suite + captura. Commit.

**Verificación:** cargar medidas, abrir un vestido y recibir una talla. El
reporte `efectividad_probador` deja de venir vacío.

**Hecho.** 43 pruebas propias, 503 en total. Capturas en `docs/capturas/`.

Dos desvíos respecto de lo planificado, los dos deliberados:

- **No hay `Probador.tsx` aparte.** El avatar se dibuja dentro de `MisMedidas`,
  al lado del formulario que lo produce. Una pantalla separada habría mostrado
  lo mismo sin el contexto que lo hace útil: la silueta sirve justamente para
  ver, mientras se escribe, que la cadera que se tipeó es la correcta. La
  pantalla de probarse una prenda encima es la de RA, que es la Tarea 3.

- **La talla no espera al botón.** Con sesión iniciada se busca sola al abrir la
  ficha. El botón "¿Cuál es mi talla?" quedó solo para quien entra sin sesión,
  que es a quien sí hay algo que pedirle. Pedirle un clic a la persona cuyas
  medidas ya tenemos era cobrarle el trámite a quien el probador debía ayudar.

Dos correcciones que salieron al mirar las pantallas, ninguna del probador:

- `Grafico` caía en el `return` de la torta para cualquier `visual` que no
  reconociera, `tabla` incluido: una plantilla que pide expresamente no dibujar
  recibía una torta. Afectaba también a la pantalla de Reportes.

- `scripts/captura.mjs` capturaba en blanco sin decir por qué. Eran tres cosas
  encadenadas: Edge reusaba el perfil del usuario, el login del puente se comía
  el presupuesto de tiempo virtual, y —la de fondo— Git Bash reescribía
  `/mis-medidas` como `C:/Program Files/Git/mis-medidas` antes de que Node la
  leyera. Ahora la ruta va sin barra inicial y, si igual llega convertida, el
  script lo dice en vez de capturar otra pantalla.

---

## Tarea 3: Realidad aumentada

**Tabla que conecta:** `producto_prenda_3d` (tiene `anclaje_json`).

**Alcance decidido:** superposición sobre la cámara con anclaje por puntos del
cuerpo, no modelo 3D. Se usa `getUserMedia` y un canvas; la prenda se posiciona
con el `anclaje_json` de la variante (hombros y cintura en proporción a la
altura detectada del torso). Un modelo 3D con física de tela no entra en 10 días
y no es lo que se está evaluando.

**Archivos:**
- Crear: `apps/web/src/tienda/RealidadAumentada.tsx`
- Modificar: `apps/api/src/modulos/probador/probador.controller.ts` (endpoint de
  prenda 3D/anclaje)

- [x] **3.1** Endpoint que devuelve el anclaje de una variante.
- [x] **3.2** Componente de cámara con permiso, encuadre y captura.
- [x] **3.3** Superposición de la prenda escalada por el anclaje.
- [x] **3.4** Botón "Probar en RA" en la ficha, solo si el navegador tiene
      cámara. Commit.

**Verificación:** ~~no se puede automatizar sin cámara~~ — **sí se pudo.**
Chromium sabe fabricar un video sintético y aceptar el permiso solo
(`--use-fake-device-for-media-stream`), así que `scripts/captura.mjs --camara`
abre el probador y lo fotografía. La captura está en
`docs/capturas/ra-camara.png`: se ve el video de la cámara, la prenda dibujada
en su color real y el anclaje sembrado de ese vestido. No queda nada como
verificación manual.

**Hecho.** 9 pruebas propias del anclaje, 512 en total.

Tres decisiones que conviene tener a mano para la defensa:

- **No hay detección de pose, y es deliberado.** El navegador no trae ninguna
  API que la haga; meterla significaba un modelo de visión por computadora
  servido desde un CDN ajeno, en una aplicación que es una PWA y tiene que
  andar sin conexión. En su lugar, la prenda se ancla por proporciones y se
  arrastra hasta que calce. Es menos vistoso y es honesto.

- **El anclaje propio es opcional.** `anclaje_json` está cargado para cuatro
  productos; el resto usa el genérico del tipo de prenda. Exigir que alguien
  midiera a mano los treinta antes de encender la RA la habría dejado apagada
  para siempre. Cuando se carga el fino de un producto, ese gana sin tocar
  código, y hay una prueba que lo comprueba.

- **La prenda es una forma en su color real, no una foto.** `url_textura` está
  previsto y el componente lo usa si existe, pero hoy no hay texturas cargadas.
  La pantalla lo dice con todas las letras en vez de dejar creer que es la
  prenda fotografiada.

---

# FASE 2 — Huecos del alcance declarado

## Tarea 4: Reseñas

**Tabla:** `resena` (tiene el CHECK de calificación 1 a 5 y el único
`producto_id + cliente_id + pedido_id`).

- [ ] **4.1** Contrato y servicio: solo puede reseñar quien compró esa variante
      en un pedido entregado. La restricción única de la base ya impide dos
      reseñas del mismo pedido.
- [ ] **4.2** Recalcular `producto.calificacion` al crear o borrar una reseña.
- [ ] **4.3** Mostrar reseñas en la ficha de producto y permitir escribirlas
      desde el detalle de un pedido entregado.
- [ ] **4.4** Suite + commit.

## Tarea 5: Notificaciones

**Tabla:** `notificacion`.

- [ ] **5.1** `NotificacionesService.crear(usuarioId, tipo, titulo, mensaje, url)`
      y el listado con marcar-como-leída.
- [ ] **5.2** Engancharlo donde ya hay hechos que avisar: cambio de estado de
      pedido, pago confirmado o rechazado, devolución resuelta, stock bajo
      mínimo al ajustar.
- [ ] **5.3** Campanita en el cromo de las dos mitades del PWA.
- [ ] **5.4** Suite + commit.

## Tarea 6: Sincronización por lote

**Tabla:** `sync_operacion`. **Hueco documentado:**
`docs/anexos/arquitectura-tecnica.md` describe un `POST /api/sync/lote` que no
existe; hoy la cola postea directo a `/api/pedidos` con clave de idempotencia.

**Decisión:** implementar el endpoint. Registrar cada operación encolada en
`sync_operacion` con su estado y motivo es lo que permite mostrar los conflictos
en el mostrador — hoy la cola los guarda y ninguna pantalla los muestra, que es
un cabo suelto real.

- [ ] **6.1** `POST /api/sync/lote`: recibe las operaciones en orden, las aplica
      una por una, y devuelve el resultado de cada una (`aplicada` o
      `conflicto` con motivo).
- [ ] **6.2** La cola del PWA pasa a usarlo.
- [ ] **6.3** Pantalla de conflictos en el punto de venta: qué venta quedó sin
      aplicar y por qué.
- [ ] **6.4** Suite que simula una venta offline cuyo stock ya no alcanza.
      Commit.

---

# FASE 3 — Pantallas del PWA que faltan

La API las soporta enteras; les falta la interfaz.

## Tarea 7: Administración, compras, posventa y cuenta

- [ ] **7.1** `apps/web/src/operaciones/Usuarios.tsx` — personal, alta, edición,
      baja, y aprobación de mayoristas.
- [ ] **7.2** `apps/web/src/operaciones/Roles.tsx` — permisos por rol con las
      casillas agrupadas por módulo.
- [ ] **7.3** `apps/web/src/operaciones/Compras.tsx` — proveedores y compras con
      su recepción.
- [ ] **7.4** `apps/web/src/operaciones/Devoluciones.tsx` — el ciclo completo,
      con la clasificación de prenda al recibir.
- [ ] **7.5** `apps/web/src/operaciones/Envios.tsx` — hoja de ruta del
      repartidor.
- [ ] **7.6** `apps/web/src/operaciones/Promociones.tsx` — campañas y
      promociones.
- [ ] **7.7** `apps/web/src/tienda/MiCuenta.tsx` — datos, direcciones, medidas.
- [ ] **7.8** Capturas de cada una. Commit por pantalla o por par.

---

# FASE 4 — Aplicación móvil

## Tarea 8: React Native con Expo

**Bloqueo parcial B2:** la app se construye y corre en Expo Go sin cuenta; el
`.apk` firmado necesita credenciales de Expo.

**Alcance:** la app móvil es para el personal, no una segunda tienda. Lo que
tiene sentido en el celular: punto de venta con lector de código de barras,
consulta de stock, y la hoja de ruta del repartidor. Rehacer la tienda en móvil
cuando el PWA ya es instalable sería duplicar trabajo.

- [ ] **8.1** `apps/movil` con Expo SDK, TypeScript y `@aurora/contratos`.
- [ ] **8.2** Sesión y cliente de API compartiendo el contrato.
- [ ] **8.3** Punto de venta con `expo-camera` para escanear códigos de barras.
- [ ] **8.4** Consulta de stock por sucursal.
- [ ] **8.5** Hoja de ruta del repartidor con marcar entregado.
- [ ] **8.6** Cola sin conexión con `expo-sqlite`, misma idempotencia.
- [ ] **8.7** **[B2]** `eas build -p android --profile preview` para el `.apk`.

---

# FASE 5 — Despliegue

## Tarea 9: Azure

**Bloqueo B1: no se puede empezar sin la cuenta.**

- [ ] **9.1** **[B1]** Activar Azure for Students.
- [ ] **9.2** `infra/` con Bicep: App Service (Linux, Node 20), PostgreSQL
      Flexible Server B1ms, Static Web Apps, Blob Storage.
- [ ] **9.3** Cargar esquema, correlativos y semilla en la base de Azure con
      `AURORA_PSQL` apuntando allá.
- [ ] **9.4** Variables de entorno y secretos en App Service. `JWT_SECRET` nuevo
      para producción, nunca el de desarrollo.
- [ ] **9.5** GitHub Actions: build y deploy en cada push a `main`.
- [ ] **9.6** Correr `npm run pruebas` contra la URL de Azure con `AURORA_API`.

---

# FASE 6 — Documento

## Tarea 10: Los seis capítulos que faltan

**Bloqueo B4 solo para la portada.** Los capítulos se escriben igual.

- [ ] **10.1** **Corregir "46 tablas" → 54** en los capítulos ya escritos.
- [ ] **10.2** Cap. 2 Marco Teórico: e-commerce, probador virtual y RA, IA
      conversacional, PWA y operación sin conexión, pasarelas de pago en
      Bolivia, PUDS, UML.
- [ ] **10.3** Cap. 3 Análisis: paquetes, diagramas de comunicación por ciclo,
      análisis de clases.
- [ ] **10.4** Cap. 4 Diseño: despliegue (rehacer, apuntaba a PHP en Hostinger),
      capas, clases, mapeo entidad-tabla, **tabla de volumen de las 54 tablas**,
      script, relacional.
- [ ] **10.5** Cap. 5 Implementación: reescribir con el stack nuevo, más el
      enlace del repositorio y del APK.
- [ ] **10.6** Cap. 6 Pruebas: formalizar las suites automatizadas.
- [ ] **10.7** Bibliografía y anexos.
- [ ] **10.8** **[B4]** Portada y regenerar el entregable con
      `scripts/build-documento.ps1`.

---

## Orden y por qué

1. **Fase 1** primero: son las dos novedades exigidas y lo que más peso tiene en
   la nota. Ninguna está bloqueada.
2. **Fase 2 y 3** después: cierran el alcance declarado y no dependen de nadie.
3. **Fase 4** cuando lo anterior esté firme.
4. **Fase 5** en cuanto haya cuenta de Azure. Si tarda, el proyecto se entrega
   corriendo en local y el capítulo 5 lo declara.
5. **Fase 6** en paralelo desde el día 20; el documento no se deja para el final
   porque es la mitad de la nota.

**Si hay que recortar**, el orden para sacrificar es: RA con superposición
simple antes que modelo 3D (ya decidido), después notificaciones, después
reseñas. **Nunca el documento.**
