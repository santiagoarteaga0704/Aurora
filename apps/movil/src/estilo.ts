import { StyleSheet } from 'react-native'

/**
 * Paleta.
 *
 * Es la mitad oscura del sistema visual de AURORA, la misma que usa la pantalla
 * de operaciones en el navegador. No es una decision estetica: quien usa la app
 * en el mostrador usa tambien la caja, y dos aplicaciones con colores distintos
 * para lo mismo se sienten como dos sistemas.
 */
export const C = {
  fondo: '#16120F',
  panel: '#211B16',
  alto: '#2C241E',
  borde: '#3A302A',
  texto: '#ECE5DA',
  suave: '#9D9287',
  vino: '#6E1A2B',
  vinoClaro: '#8E2437',
  laton: '#A8843C',
  salvia: '#46654E',
  alerta: '#B4472A',
  ocre: '#C98A1F',
} as const

export const E = {
  e1: 4,
  e2: 8,
  e3: 12,
  e4: 16,
  e5: 24,
  e6: 32,
} as const

export const bs = (n: number): string =>
  `Bs ${n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: C.fondo,
  },
  contenido: {
    padding: E.e4,
    gap: E.e4,
  },
  titulo: {
    fontSize: 26,
    color: C.texto,
    fontWeight: '600',
  },
  rotulo: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: C.suave,
  },
  texto: {
    fontSize: 15,
    color: C.texto,
  },
  suave: {
    fontSize: 13,
    color: C.suave,
    lineHeight: 19,
  },
  tarjeta: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.borde,
    borderRadius: 4,
    padding: E.e4,
    gap: E.e2,
  },
  campo: {
    backgroundColor: C.alto,
    borderWidth: 1,
    borderColor: C.borde,
    borderRadius: 4,
    paddingHorizontal: E.e3,
    paddingVertical: E.e3,
    color: C.texto,
    fontSize: 16,
  },
  boton: {
    backgroundColor: C.vino,
    borderRadius: 4,
    paddingVertical: E.e3,
    paddingHorizontal: E.e4,
    alignItems: 'center',
  },
  botonLinea: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.borde,
  },
  botonTexto: {
    color: C.texto,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  botonApagado: {
    opacity: 0.45,
  },
  marca: {
    alignSelf: 'flex-start',
    paddingHorizontal: E.e2,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: C.alto,
    borderWidth: 1,
    borderColor: C.borde,
    color: C.suave,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  aviso: {
    padding: E.e3,
    borderRadius: 4,
    backgroundColor: C.alto,
    borderLeftWidth: 2,
    borderLeftColor: C.laton,
    color: C.texto,
    fontSize: 13,
    lineHeight: 19,
  },
  avisoError: {
    borderLeftColor: C.alerta,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: E.e3,
  },
  cifra: {
    fontVariant: ['tabular-nums'],
    color: C.texto,
  },
})
