import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native'
import type { Envio, EstadoEnvio } from '@aurora/contratos'
import { TRANSICIONES_ENVIO } from '@aurora/contratos'
import { api, ErrorApi } from '@/api'
import { useSesion } from '@/sesion'
import { bs, C, E, estilos } from '@/estilo'

const TEXTO: Record<EstadoEnvio, string> = {
  preparando: 'Preparando',
  en_ruta: 'En ruta',
  entregado: 'Entregado',
  fallido: 'No se pudo',
  devuelto: 'Devuelto',
}

const ACCION: Record<EstadoEnvio, string> = {
  preparando: 'Volver a preparación',
  en_ruta: 'Salir a ruta',
  entregado: 'Entregado',
  fallido: 'No se pudo entregar',
  devuelto: 'Devolver al local',
}

const COLOR: Record<EstadoEnvio, string> = {
  preparando: C.ocre,
  en_ruta: C.vinoClaro,
  entregado: C.salvia,
  fallido: C.alerta,
  devuelto: C.borde,
}

/**
 * Hoja de ruta del repartidor.
 *
 * Es la pantalla que de verdad justifica una app movil: quien reparte esta en
 * la calle, con el telefono en una mano, y necesita ver la proxima direccion y
 * marcar la entrega sin sacar una computadora.
 *
 * Arranca filtrada por los envios propios. Un repartidor con quince paradas no
 * quiere ver las de los otros dos.
 *
 * Los botones salen de `TRANSICIONES_ENVIO`, el mismo mapa que valida el
 * servidor. Ofrecer uno que despues da 409 es hacerle perder el viaje a alguien.
 */
export default function Ruta() {
  const { perfil } = useSesion()

  const [envios, setEnvios] = useState<Envio[] | null>(null)
  const [soloMios, setSoloMios] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [marcando, setMarcando] = useState<{ envio: Envio; a: EstadoEnvio } | null>(null)
  const [comentario, setComentario] = useState('')
  const [trabajando, setTrabajando] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const mio = soloMios && perfil?.id ? `repartidor_id=${perfil.id}&` : ''
      const r = await api.pagina<Envio>(`/api/envios?${mio}por_pagina=50`)
      setEnvios(r.datos)
    } catch (e) {
      const fallo = e as ErrorApi
      setError(fallo.esDeRed ? 'Sin señal. Volvé a intentar cuando tengas datos.' : fallo.message)
      setEnvios([])
    }
  }, [soloMios, perfil?.id])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const marcar = async () => {
    if (!marcando) return
    setTrabajando(true)
    try {
      await api.actualizar(`/api/envios/${marcando.envio.id}`, {
        estado: marcando.a,
        comentario: comentario.trim() || undefined,
      })
      setAviso(`${marcando.envio.pedido_numero}: ${TEXTO[marcando.a].toLowerCase()}`)
      setMarcando(null)
      setComentario('')
      await cargar()
    } catch (e) {
      setAviso((e as ErrorApi).message)
    } finally {
      setTrabajando(false)
    }
  }

  if (envios === null) {
    return (
      <View style={[estilos.pantalla, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={C.laton} />
      </View>
    )
  }

  // El formulario de confirmacion reemplaza la lista: en un telefono, un modal
  // encima de una lista larga con el teclado abierto no deja ver nada.
  if (marcando) {
    return (
      <View style={[estilos.pantalla, { padding: E.e4, gap: E.e4 }]}>
        <Text style={estilos.titulo}>{ACCION[marcando.a]}</Text>
        <Text style={estilos.suave}>
          {marcando.envio.pedido_numero} · {marcando.envio.direccion ?? 'sin dirección'}
        </Text>

        <Text style={estilos.rotulo}>
          {marcando.a === 'fallido' ? 'Qué pasó' : 'Comentario (opcional)'}
        </Text>
        <TextInput
          style={[estilos.campo, { minHeight: 90, textAlignVertical: 'top' }]}
          multiline
          placeholder={
            marcando.a === 'fallido' ? 'No había nadie, dirección equivocada…' : ''
          }
          placeholderTextColor={C.suave}
          value={comentario}
          onChangeText={setComentario}
        />

        {marcando.a === 'fallido' && (
          <Text style={estilos.suave}>
            Un intento fallido no cierra el envío: se puede volver a salir a ruta.
          </Text>
        )}

        <Pressable
          style={[estilos.boton, trabajando && estilos.botonApagado]}
          onPress={() => void marcar()}
          disabled={trabajando}
        >
          <Text style={estilos.botonTexto}>{trabajando ? 'Guardando' : 'Confirmar'}</Text>
        </Pressable>

        <Pressable
          style={[estilos.boton, estilos.botonLinea]}
          onPress={() => setMarcando(null)}
        >
          <Text style={estilos.botonTexto}>Cancelar</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={estilos.pantalla}>
      <View style={{ padding: E.e4, gap: E.e3 }}>
        <View style={{ flexDirection: 'row', gap: E.e2 }}>
          <Pressable
            style={[estilos.boton, estilos.botonLinea, soloMios && { borderColor: C.laton }]}
            onPress={() => setSoloMios(true)}
          >
            <Text style={[estilos.botonTexto, soloMios && { color: C.laton }]}>Mis paradas</Text>
          </Pressable>
          <Pressable
            style={[estilos.boton, estilos.botonLinea, !soloMios && { borderColor: C.laton }]}
            onPress={() => setSoloMios(false)}
          >
            <Text style={[estilos.botonTexto, !soloMios && { color: C.laton }]}>Todas</Text>
          </Pressable>
        </View>

        {error && <Text style={[estilos.aviso, estilos.avisoError]}>{error}</Text>}
        {aviso && <Text style={estilos.aviso}>{aviso}</Text>}
      </View>

      <FlatList
        data={envios}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingHorizontal: E.e4, gap: E.e3, paddingBottom: E.e4 }}
        onRefresh={() => void cargar()}
        refreshing={false}
        ListEmptyComponent={
          <Text style={[estilos.suave, { textAlign: 'center', marginTop: E.e6 }]}>
            {soloMios ? 'No tenés paradas asignadas.' : 'No hay envíos.'}
          </Text>
        }
        renderItem={({ item }) => {
          const siguientes = TRANSICIONES_ENVIO[item.estado]
          return (
            <View
              style={[
                estilos.tarjeta,
                { borderLeftWidth: 3, borderLeftColor: COLOR[item.estado] },
                item.estado === 'entregado' && { opacity: 0.6 },
              ]}
            >
              <View style={estilos.fila}>
                <Text style={estilos.rotulo}>{item.pedido_numero}</Text>
                <Text style={estilos.marca}>{TEXTO[item.estado]}</Text>
              </View>

              <Text style={[estilos.texto, { fontSize: 17 }]}>
                {item.direccion ?? 'Sin dirección cargada'}
              </Text>

              {item.tracking && <Text style={estilos.suave}>Guía {item.tracking}</Text>}
              <Text style={estilos.suave}>Envío {bs(item.costo)}</Text>

              {siguientes.length > 0 && (
                <View style={{ gap: E.e2, marginTop: E.e2 }}>
                  {siguientes.map((a) => (
                    <Pressable
                      key={a}
                      style={[estilos.boton, a !== 'entregado' && estilos.botonLinea]}
                      onPress={() => {
                        setMarcando({ envio: item, a })
                        setComentario('')
                      }}
                    >
                      <Text style={estilos.botonTexto}>{ACCION[a]}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )
        }}
      />
    </View>
  )
}
