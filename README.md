# AURORA — Comercio electrónico multisucursal de ropa femenina

Proyecto de **SI2 — Parcial 1**. Entrega: **23 de septiembre de 2026**.

Una cadena nacional de ropa de mujer tiene sucursales en varios departamentos y
enfrenta un problema de escala: las tiendas se saturan en temporada y en cierre
de campaña, y la única salida que veía la empresa era abrir más locales y
contratar más gente. AURORA ataca el problema por otro lado: **traslada la
experiencia de la tienda física al canal digital**, con un probador virtual que
resuelve la razón número uno por la que la gente igual va al local — no poder
probarse la ropa.

## Las dos novedades

| # | Novedad | Cómo funciona |
|---|---------|---------------|
| 1 | **Probador digital con realidad aumentada** | La clienta carga estatura y peso (o sus medidas completas) y el sistema genera un modelo corporal. Sobre él se renderiza la prenda y se calcula la talla recomendada contra la guía de tallas por categoría. En modo RA la prenda se superpone sobre la cámara en tiempo real. |
| 2 | **Asistente conversacional con IA** | Un chat donde la clienta pregunta por la ropa y el asistente responde consultando el catálogo real. Para el personal, el mismo motor resuelve **reportes bajo demanda por chat y voz**: "muéstrame las ventas de la sucursal Ventura de 14:00 a 18:00 de ayer". |

El asistente **nunca escribe SQL**. Elige el código de una de las 8 plantillas de
`plantilla_reporte` y devuelve parámetros; el backend los valida y ejecuta una
sentencia preparada. Eso cierra la puerta a la inyección por prompt.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | NestJS 11 + TypeScript, Prisma |
| Base de datos | PostgreSQL 16 — 54 tablas, 39 tipos enumerados, 91 claves ajenas, 2 vistas |
| Web | React 19 + Vite, PWA con Service Worker e IndexedDB |
| Móvil | React Native (Expo), APK vía EAS Build |
| Contrato | Paquete `@aurora/contratos` compartido por los tres |
| Despliegue | Azure — App Service, Static Web Apps, Database for PostgreSQL, Blob Storage |

> **Nota de migración.** El proyecto nació en PHP 8 puro + MySQL + Flutter y se
> migró en septiembre de 2026. La base de datos se conservó entera: el esquema
> MySQL se convirtió a PostgreSQL con `scripts/mysql-a-postgres.mjs`, que deja la
> conversión reproducible y auditable. El backend PHP anterior queda en
> `_legacy-php/` como registro de la migración y se borra antes de la entrega.

## Estructura

```
aurora-si2/
├── apps/
│   ├── api/                  API REST en NestJS
│   │   ├── prisma/           schema.prisma (generado por introspección)
│   │   └── src/
│   │       ├── nucleo/       Prisma, autenticación, permisos, bitácora,
│   │       │                 validación, respuesta única, errores
│   │       └── modulos/      Un directorio por módulo de negocio
│   ├── web/                  PWA en React (tienda y punto de venta)
│   └── movil/                App en React Native     (pendiente)
├── packages/
│   └── contratos/            Esquemas Zod, tipos y permisos compartidos
├── database/
│   ├── schema.postgres.sql   Esquema — FUENTE DE VERDAD del modelo de datos
│   ├── seed.postgres.sql     Catálogos maestros y usuario administrador
│   └── *.mysql.sql           Originales, conservados como registro
├── scripts/                  Conversión, carga y pruebas
├── docs/                     Documento PUDS y diagramas UML
└── entregable/               .docx y .pdf generados
```

### Regla de dependencia

`modulos/` conoce `nucleo/`; `nucleo/` nunca conoce `modulos/`. Y el modelo de
datos **no** se declara en Prisma: la fuente de verdad es
`database/schema.postgres.sql`, que se carga y luego se introspecciona con
`prisma db pull`. El capítulo 4 del documento exige entregar el script
relacional, así que el script es el original y no una exportación.

> **No usar `prisma db push` ni `prisma migrate`** contra esta base. Prisma no
> sabe representar tres cosas del esquema y las borraría al sincronizar: los
> `CHECK` de `inventario` y `resena`, el índice GIN de búsqueda de texto sobre
> `producto`, y las dos vistas de reporte. Para cambiar el esquema se edita el
> SQL, se recarga con `npm run db:cargar` y se vuelve a introspeccionar.

## Puesta en marcha

```bash
# 1. Base de datos (contenedor propio en el 5434; el 5432 y el 5433 están
#    ocupados por otros proyectos de la máquina)
docker run -d --name aurora-db \
  -e POSTGRES_PASSWORD=aurora -e POSTGRES_USER=aurora -e POSTGRES_DB=aurora \
  -p 5434:5432 postgres:16-alpine

# 2. Dependencias
npm install

# 3. Configuración
cp apps/api/.env.example apps/api/.env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # a JWT_SECRET

# 4. Cargar el esquema y los catálogos maestros
npm run db:cargar

# 5. Generar el cliente de Prisma y compilar
npm run prisma -- generate
npm run build

# 6. Datos de demostracion (opcional pero recomendado)
npm run db:demo

# 7. Levantar API y PWA
npm run api    # http://localhost:8000
npm run web    # http://localhost:5180
```

Verificación:

```bash
curl http://localhost:8000/api/salud
npm run pruebas                      # 423 comprobaciones
```

El contrato REST queda documentado en <http://localhost:8000/api/docs>.

**Credenciales iniciales:** `admin@aurora.bo` / `Aurora2026!` — cambiarlas
después del primer ingreso.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run db:generar` | Regenera el SQL de PostgreSQL desde los originales de MySQL |
| `npm run db:cargar` | Vacía la base y vuelve a aplicar esquema y semilla |
| `npm run api` | Levanta la API en modo watch |
| `npm run web` | Levanta el PWA en el 5180 |
| `npm run db:demo` | Carga 14 productos, stock, promociones y personal |
| `npm run build` | Compila el contrato y la API |
| `npm run pruebas` | Las ocho suites de prueba de la API |

## Repositorio

https://github.com/santiagoarteaga0704/Aurora

## Estado

Ver `ESTADO.md` — dice qué está hecho, qué está verificado y qué sigue.
