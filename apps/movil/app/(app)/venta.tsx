import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import type { FilaInventario } from '@aurora/contratos'
import { api, ErrorApi } from '@/api'
import { useSesion } from '@/sesion'
import { claveIdempotencia, contarPendientes, encolar, sincronizar } from '@/cola'
import { bs, C, E, estilos } from '@/estilo'

interface VarianteVendible {
  variante_id: number
  sku: string
  producto: string
  talla: string
  color: string
  disponible: number
  precio: number
}

interface Linea {
  variante_id: number
  sku: string
  nombre: string
  precio: number
  cantidad: number
}

/**
 * Punto de venta del telefono.
 *
 * La diferencia con el del navegador no es la pantalla mas chica: es que aqui
 * se puede LEER el codigo de barras. En el mostrador, tipear un SKU de trece
 * caracteres con una prenda en la mano es el cuello de botella de la venta.
 *
 * El catalogo se baja entero al abrir y se busca en memoria. Son unas decenas
 * de variantes; una peticion por tecla —o por lectura— seria mas lento y, sobre
 * todo, dejaria de funcionar justo cuando se corta la senial, que es cuando
 * esta app tiene que seguir vendiendo.
 */
export default function Venta() {
  const { perfil } = useSesion()

  const [catalogo, setCatalogo] = useState<VarianteVendible[] | null>(null)
  const [buscado, setBuscado] = useState('')
  const [ticket, setTicket] = useState<Linea[]>([])
  const [cobrando, setCobrando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enCola, setEnCola] = useState(0)

  const [camara, setCamara] = useState(false)
  const [permiso, pedirPermiso] = useCameraPermissions()

  // Evita que una misma lectura dispare veinte veces: la camara entrega un
  // cuadro tras otro y el codigo sigue ahi mientras no se mueva la prenda.
  const ultimaLectura = useRef<{ codigo: string; cuando: number } | null>(null)

  const cargarCatalogo = useCallback(async () => {
    if (!perfil?.sucursal_id) {
      setError('Tu usuario no tiene sucursal asignada, así que no se sabe de qué stock vender.')
      return
    }

    try {
      /**
       * El stock sale del inventario y el precio del catalogo.
       *
       * Son dos consultas porque son dos preguntas distintas: cuanto hay en
       * ESTA sucursal, y cuanto cuesta. `FilaInventario` no trae precio y el
       * catalogo no dice cuanto queda en una sucursal concreta. Es lo mismo que
       * hace el punto de venta del navegador.
       */
      const [stock, precios] = await Promise.all([
        api.pagina<FilaInventario>(
          `/api/inventario?sucursal_id=${perfil.sucursal_id}&por_pagina=100`
        ),
        api.pagina<{ id: number; nombre: string; precio_desde: number }>(
          '/api/catalogo/productos?por_pagina=100'
        ),
      ])

      const porProducto = new Map(precios.datos.map((p) => [p.nombre, p.precio_desde]))

      setCatalogo(
        stock.datos.map((v) => ({
          variante_id: v.variante_id,
          sku: v.sku,
          producto: v.producto,
          talla: v.talla,
          color: v.color,
          disponible: v.disponible,
          precio: porProducto.get(v.producto) ?? 0,
        }))
      )
    } catch (e) {
      const fallo = e as ErrorApi
      // Sin catalogo no se puede vender, pero se dice por que: "no hay
      // internet" y "no tenés permiso" se arreglan de formas muy distintas.
      setError(
        fallo.esDeRed
          ? 'No se pudo bajar el catálogo. Conectate una vez para poder vender sin señal después.'
          : fallo.message
      )
      setCatalogo([])
    }
  }, [perfil?.sucursal_id])

  useEffect(() => {
    void cargarCatalogo()
  }, [cargarCatalogo])

  useEffect(() => {
    void contarPendientes().then(setEnCola)
  }, [])

  const resultados = useMemo(() => {
    const q = buscado.trim().toLowerCase()
    if (q.length < 2 || !catalogo) return []
    return catalogo
      .filter((v) => `${v.sku} ${v.producto} ${v.talla} ${v.color}`.toLowerCase().includes(q))
      .slice(0, 20)
  }, [buscado, catalogo])

  const total = ticket.reduce((s, l) => s + l.precio * l.cantidad, 0)

  const agregar = (v: VarianteVendible) => {
    setBuscado('')
    setAviso(null)

    setTicket((t) => {
      const yaEsta = t.find((l) => l.variante_id === v.variante_id)
      if (yaEsta) {
        return t.map((l) =>
          l.variante_id === v.variante_id ? { ...l, cantidad: l.cantidad + 1 } : l
        )
      }
      return [
        ...t,
        {
          variante_id: v.variante_id,
          sku: v.sku,
          nombre: `${v.producto} · ${v.talla} / ${v.color}`,
          precio: v.precio,
          cantidad: 1,
        },
      ]
    })
  }

  /**
   * Lo que pasa al leer un codigo.
   *
   * Si el SKU no esta en el catalogo se avisa en vez de no hacer nada: una
   * lectura que no produce ningun efecto hace que la persona vuelva a apuntar
   * cinco veces creyendo que la camara no lee.
   */
  const alLeer = ({ data }: { data: string }) => {
    const ahora = Date.now()
    const previa = ultimaLectura.current
    if (previa && previa.codigo === data && ahora - previa.cuando < 2000) return
    ultimaLectura.current = { codigo: data, cuando: ahora }

    const v = catalogo?.find((x) => x.sku.toLowerCase() === data.trim().toLowerCase())

    if (!v) {
      setAviso(`El código ${data} no está en el catálogo de esta sucursal.`)
      return
    }

    if (v.disponible <= 0) {
      setAviso(`${v.producto} ${v.talla} no tiene stock acá.`)
      return
    }

    agregar(v)
    setAviso(`${v.producto} ${v.talla} agregado.`)
  }

  const quitar = (varianteId: number) => {
    setTicket((t) => t.filter((l) => l.variante_id !== varianteId))
  }

  const cobrar = async () => {
    if (ticket.length === 0 || !perfil?.sucursal_id) return

    setCobrando(true)
    setError(null)

    const clave = claveIdempotencia()
    const cuerpo = {
      canal: 'tienda',
      tipo_entrega: 'inmediata',
      sucursal_id: perfil.sucursal_id,
      creado_offline: true,
      items: ticket.map((l) => ({ variante_id: l.variante_id, cantidad: l.cantidad })),
      pago: { metodo_pago_id: 1, monto: total },
    }

    const resumen = `${ticket.reduce((s, l) => s + l.cantidad, 0)} artículo(s) · ${bs(total)}`

    try {
      const pedido = await api.enviar<{ numero: string }>('/api/pedidos', cuerpo, {
        idempotencia: clave,
      })
      setTicket([])
      setAviso(`Venta ${pedido.numero} cobrada.`)
      void cargarCatalogo()
    } catch (e) {
      const fallo = e as ErrorApi

      if (fallo.esDeRed) {
        // La venta NO se pierde: se guarda con la MISMA clave, asi que si el
        // servidor alcanzo a registrarla, el reenvio devuelve la que ya existe
        // en vez de cobrar dos veces.
        await encolar({
          entidad: 'pedido',
          cuerpo,
          idempotencia: clave,
          resumen,
          monto: total,
        })
        setTicket([])
        setEnCola(await contarPendientes())
        setAviso('Sin señal: la venta quedó guardada y se envía sola al volver.')
      } else {
        setError(fallo.message)
      }
    } finally {
      setCobrando(false)
    }
  }

  const enviarCola = async () => {
    const r = await sincronizar()
    setEnCola(await contarPendientes())
    setAviso(
      r.conflictos > 0
        ? `${r.aplicadas} enviadas, ${r.conflictos} no entraron. Revisalas en la caja.`
        : `${r.aplicadas} venta(s) enviadas.`
    )
    void cargarCatalogo()
  }

  const abrirCamara = async () => {
    if (!permiso?.granted) {
      const r = await pedirPermiso()
      if (!r.granted) {
        setAviso('Sin permiso de cámara no se puede leer el código. Se puede buscar por SKU.')
        return
      }
    }
    ultimaLectura.current = null
    setCamara(true)
  }

  if (catalogo === null) {
    return (
      <View style={[estilos.pantalla, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={C.laton} />
      </View>
    )
  }

  return (
    <View style={estilos.pantalla}>
      <View style={{ padding: E.e4, gap: E.e3 }}>
        {enCola > 0 && (
          <Pressable style={[estilos.aviso, { borderLeftColor: C.ocre }]} onPress={() => void enviarCola()}>
            <Text style={{ color: C.texto }}>
              {enCola} venta{enCola === 1 ? '' : 's'} sin enviar. Tocá para intentar ahora.
            </Text>
          </Pressable>
        )}

        {error && <Text style={[estilos.aviso, estilos.avisoError]}>{error}</Text>}
        {aviso && <Text style={estilos.aviso}>{aviso}</Text>}

        <View style={{ flexDirection: 'row', gap: E.e2 }}>
          <TextInput
            style={[estilos.campo, { flex: 1 }]}
            placeholder="Buscar por SKU o nombre"
            placeholderTextColor={C.suave}
            autoCapitalize="none"
            value={buscado}
            onChangeText={setBuscado}
          />
          <Pressable
            style={[estilos.boton, { paddingHorizontal: E.e4, justifyContent: 'center' }]}
            onPress={() => void abrirCamara()}
          >
            <Text style={{ color: C.texto, fontSize: 20 }}>▣</Text>
          </Pressable>
        </View>
      </View>

      {resultados.length > 0 ? (
        <FlatList
          data={resultados}
          keyExtractor={(v) => String(v.variante_id)}
          contentContainerStyle={{ paddingHorizontal: E.e4, gap: E.e2, paddingBottom: E.e4 }}
          renderItem={({ item }) => (
            <Pressable
              style={[estilos.tarjeta, item.disponible <= 0 && estilos.botonApagado]}
              disabled={item.disponible <= 0}
              onPress={() => agregar(item)}
            >
              <Text style={estilos.rotulo}>{item.sku}</Text>
              <Text style={estilos.texto}>{item.producto}</Text>
              <View style={estilos.fila}>
                <Text style={estilos.suave}>
                  {item.talla} / {item.color} · {item.disponible} disp.
                </Text>
                <Text style={estilos.cifra}>{bs(item.precio)}</Text>
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={ticket}
          keyExtractor={(l) => String(l.variante_id)}
          contentContainerStyle={{ paddingHorizontal: E.e4, gap: E.e2, paddingBottom: E.e4 }}
          ListEmptyComponent={
            <Text style={[estilos.suave, { textAlign: 'center', marginTop: E.e6 }]}>
              Leé un código o buscá por SKU para empezar a cobrar.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={estilos.tarjeta}>
              <View style={estilos.fila}>
                <Text style={[estilos.texto, { flex: 1 }]}>{item.nombre}</Text>
                <Pressable onPress={() => quitar(item.variante_id)}>
                  <Text style={{ color: C.alerta, fontSize: 18, paddingHorizontal: E.e2 }}>✕</Text>
                </Pressable>
              </View>
              <View style={estilos.fila}>
                <Text style={estilos.suave}>
                  {item.cantidad} × {bs(item.precio)}
                </Text>
                <Text style={estilos.cifra}>{bs(item.precio * item.cantidad)}</Text>
              </View>
            </View>
          )}
        />
      )}

      {ticket.length > 0 && (
        <View
          style={{
            padding: E.e4,
            gap: E.e3,
            backgroundColor: C.panel,
            borderTopWidth: 1,
            borderTopColor: C.borde,
          }}
        >
          <View style={estilos.fila}>
            <Text style={estilos.rotulo}>Total</Text>
            <Text style={[estilos.cifra, { fontSize: 24 }]}>{bs(total)}</Text>
          </View>

          <Pressable
            style={[estilos.boton, cobrando && estilos.botonApagado]}
            onPress={() => void cobrar()}
            disabled={cobrando}
          >
            <Text style={estilos.botonTexto}>{cobrando ? 'Cobrando' : 'Cobrar en efectivo'}</Text>
          </Pressable>
        </View>
      )}

      {/* --- Camara --- */}
      <Modal visible={camara} animationType="slide" onRequestClose={() => setCamara(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr', 'upc_a'],
            }}
            onBarcodeScanned={alLeer}
          />

          <View style={{ padding: E.e4, gap: E.e3, backgroundColor: C.panel }}>
            <Text style={estilos.suave}>
              {aviso ?? 'Apuntá al código de barras de la etiqueta.'}
            </Text>
            <Text style={estilos.rotulo}>
              {ticket.reduce((s, l) => s + l.cantidad, 0)} en el ticket · {bs(total)}
            </Text>
            <Pressable style={[estilos.boton, estilos.botonLinea]} onPress={() => setCamara(false)}>
              <Text style={estilos.botonTexto}>Listo</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}
