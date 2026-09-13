# AURORA · aplicación móvil

App de **operaciones** para el personal. No es una segunda tienda: el PWA ya es
instalable y rehacer la vidriera en React Native sería hacer dos veces lo mismo.

Lo que tiene sentido en un teléfono es lo que se hace de pie:

| Pantalla | Para qué | Permiso |
|---|---|---|
| **Vender** | Cobrar leyendo el código de barras de la etiqueta | `venta.crear` |
| **Stock** | «¿Queda en otra talla?», «¿lo tienen en Ventura?» | `inventario.ver` |
| **Ruta** | Hoja de reparto: dirección y marcar entregado | `venta.despachar` |

Las pestañas aparecen según el permiso. Un repartidor no ve el punto de venta,
una vendedora no ve la hoja de ruta.

## Correr en desarrollo

```bash
npm run dev -w @aurora/movil     # abre Metro y muestra el QR
```

Con **Expo Go** en el teléfono se escanea el QR. Hace falta que el teléfono y la
computadora estén en la misma red, y que la app apunte a la IP de la
computadora, no a `localhost`:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.X:8000 npm run dev -w @aurora/movil
```

El valor por defecto es `http://10.0.2.2:8000`, que es como el **emulador de
Android** ve el `localhost` de la máquina que lo hospeda.

## Generar el APK

```bash
npm run apk -w @aurora/movil     # eas build -p android --profile preview
```

Necesita una cuenta de Expo (`npx eas login`). Es el único paso del proyecto que
depende de una credencial externa.

## Lo que comparte con el PWA, y por qué

Tres cosas, y ninguna es casualidad:

- **El contrato.** `@aurora/contratos` es la misma dependencia. Si la API cambia
  una regla, esta app deja de compilar, que es exactamente lo que se quiere.

- **La idempotencia.** La clave se genera **al encolar**, no al enviar. Si se
  generara al enviar, un reintento después de una respuesta perdida llevaría una
  clave nueva y la venta se cobraría dos veces.

- **El endpoint de sincronización.** Va por `POST /api/sync/lote`, igual que el
  navegador, así que una venta hecha en el teléfono deja constancia en
  `sync_operacion` y se puede revisar desde la caja. No queda encerrada en este
  aparato.

Lo que **no** comparte es dónde guarda las cosas, porque la plataforma es otra:

| | PWA | Móvil |
|---|---|---|
| Token | `localStorage` | `expo-secure-store` (llavero cifrado) |
| Cola sin conexión | IndexedDB | SQLite |

El token va al llavero y no a un archivo: un teléfono de mostrador se pierde o
se lo prestan.

## Estado de la verificación

- ✅ `tsc --noEmit` limpio.
- ✅ `expo-doctor`: 21/21.
- ✅ `expo export --platform android` genera el bundle.
- ⛔ **Sin probar en un dispositivo.** No hay teléfono ni emulador de Android en
  la máquina donde se desarrolló. Que compile y empaquete no es lo mismo que que
  funcione: falta abrirla con Expo Go y cobrar una venta de verdad.
- ⛔ **Sin APK firmado**, a la espera de la cuenta de Expo.

## Por qué no corre en web

`expo-sqlite` necesita un `.wasm` que el empaquetador web no resuelve en esta
configuración, y `expo-camera` en web pide un polyfill aparte. Web no es un
objetivo de esta app —el objetivo es Android— así que no se persiguió. Se deja
anotado para que nadie lo intente creyendo que debería funcionar.
