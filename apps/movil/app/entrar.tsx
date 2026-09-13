import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useSesion } from '@/sesion'
import { API, ErrorApi } from '@/api'
import { C, E, estilos } from '@/estilo'

/**
 * Entrar.
 *
 * Muestra a que servidor esta apuntando. En una app que se instala por APK y se
 * usa en tres sucursales, "no puedo entrar" casi siempre es "esta apuntando a
 * otro lado": tenerlo a la vista ahorra la mitad de esas consultas.
 */
export default function Entrar() {
  const { entrar } = useSesion()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enviar = async () => {
    setEntrando(true)
    setError(null)
    try {
      await entrar(email.trim(), password)
      router.replace('/(app)/venta')
    } catch (e) {
      const fallo = e as ErrorApi
      setError(
        fallo.esDeRed
          ? `No se pudo contactar a ${API}. Revisá la conexión o la dirección del servidor.`
          : fallo.message
      )
    } finally {
      setEntrando(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={estilos.pantalla}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={[estilos.contenido, { paddingTop: E.e6 }]}>
        <Text style={[estilos.titulo, { letterSpacing: 6 }]}>AURORA</Text>
        <Text style={estilos.rotulo}>Operaciones</Text>

        <View style={{ gap: E.e3, marginTop: E.e5 }}>
          <Text style={estilos.rotulo}>Correo</Text>
          <TextInput
            style={estilos.campo}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="vendedora@aurora.bo"
            placeholderTextColor={C.suave}
            value={email}
            onChangeText={setEmail}
          />

          <Text style={estilos.rotulo}>Contraseña</Text>
          <TextInput
            style={estilos.campo}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={C.suave}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void enviar()}
          />

          {error && <Text style={[estilos.aviso, estilos.avisoError]}>{error}</Text>}

          <Pressable
            style={[estilos.boton, entrando && estilos.botonApagado]}
            onPress={() => void enviar()}
            disabled={entrando}
          >
            <Text style={estilos.botonTexto}>{entrando ? 'Entrando' : 'Entrar'}</Text>
          </Pressable>
        </View>

        <Text style={[estilos.suave, { marginTop: E.e5 }]}>Servidor: {API}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
