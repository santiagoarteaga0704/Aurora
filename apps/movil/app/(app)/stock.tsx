import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native'
import type { FilaInventario } from '@aurora/contratos'
import { api, ErrorApi } from '@/api'
import { useSesion } from '@/sesion'
import { C, E, estilos } from '@/estilo'

/**
 * Consulta de stock.
 *
 * Responde la pregunta que se hace de pie, con una clienta esperando: "¿queda
 * en otra talla?", "¿lo tienen en la otra sucursal?". Por eso se puede mirar
 * TODAS las sucursales y no solo la propia: la respuesta util muchas veces es
 * "en Ventura hay dos, te lo traemos".
 *
 * Ese alcance lo decide el servidor, no esta pantalla: a quien esta limitado a
 * su sucursal le devuelve solo la suya, pida lo que pida.
 */
export default function Stock() {
  const { perfil } = useSesion()

  const [filas, setFilas] = useState<FilaInventario[] | null>(null)
  const [buscado, setBuscado] = useState('')
  const [soloMia, setSoloMia] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const sucursal = soloMia && perfil?.sucursal_id ? `sucursal_id=${perfil.sucursal_id}&` : ''
      const r = await api.pagina<FilaInventario>(`/api/inventario?${sucursal}por_pagina=100`)
      setFilas(r.datos)
    } catch (e) {
      const fallo = e as ErrorApi
      setError(
        fallo.esDeRed ? 'Sin señal no se puede consultar el stock de otras sucursales.' : fallo.message
      )
      setFilas([])
    }
  }, [soloMia, perfil?.sucursal_id])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const resultados = useMemo(() => {
    const q = buscado.trim().toLowerCase()
    if (!filas) return []
    if (q.length < 2) return filas.slice(0, 40)
    return filas.filter((f) =>
      `${f.sku} ${f.producto} ${f.talla} ${f.color} ${f.sucursal}`.toLowerCase().includes(q)
    )
  }, [filas, buscado])

  return (
    <View style={estilos.pantalla}>
      <View style={{ padding: E.e4, gap: E.e3 }}>
        <TextInput
          style={estilos.campo}
          placeholder="Buscar prenda, SKU o talla"
          placeholderTextColor={C.suave}
          autoCapitalize="none"
          value={buscado}
          onChangeText={setBuscado}
        />

        <View style={{ flexDirection: 'row', gap: E.e2 }}>
          <Pressable
            style={[estilos.boton, estilos.botonLinea, soloMia && { borderColor: C.laton }]}
            onPress={() => setSoloMia(true)}
          >
            <Text style={[estilos.botonTexto, soloMia && { color: C.laton }]}>Mi sucursal</Text>
          </Pressable>
          <Pressable
            style={[estilos.boton, estilos.botonLinea, !soloMia && { borderColor: C.laton }]}
            onPress={() => setSoloMia(false)}
          >
            <Text style={[estilos.botonTexto, !soloMia && { color: C.laton }]}>Todas</Text>
          </Pressable>
        </View>

        {error && <Text style={[estilos.aviso, estilos.avisoError]}>{error}</Text>}
      </View>

      {filas === null ? (
        <ActivityIndicator color={C.laton} style={{ marginTop: E.e6 }} />
      ) : (
        <FlatList
          data={resultados}
          keyExtractor={(f) => `${f.variante_id}-${f.almacen_id}`}
          contentContainerStyle={{ paddingHorizontal: E.e4, gap: E.e2, paddingBottom: E.e4 }}
          ListEmptyComponent={
            <Text style={[estilos.suave, { textAlign: 'center', marginTop: E.e6 }]}>
              No hay nada que coincida.
            </Text>
          }
          renderItem={({ item }) => (
            <View
              style={[
                estilos.tarjeta,
                item.bajo_minimo && { borderLeftWidth: 2, borderLeftColor: C.ocre },
              ]}
            >
              <View style={estilos.fila}>
                <Text style={estilos.rotulo}>{item.sku}</Text>
                <Text style={[estilos.cifra, { fontSize: 20 }]}>{item.disponible}</Text>
              </View>

              <Text style={estilos.texto}>{item.producto}</Text>

              <View style={estilos.fila}>
                <Text style={estilos.suave}>
                  {item.talla} / {item.color}
                </Text>
                <Text style={estilos.suave}>{item.almacen}</Text>
              </View>

              {!soloMia && <Text style={estilos.marca}>{item.sucursal}</Text>}

              {item.reservado > 0 && (
                <Text style={estilos.suave}>
                  {item.stock} en total, {item.reservado} reservadas para pedidos
                </Text>
              )}

              {item.bajo_minimo && <Text style={[estilos.marca, { color: C.ocre }]}>bajo el mínimo</Text>}
            </View>
          )}
        />
      )}
    </View>
  )
}
