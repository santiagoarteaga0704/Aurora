import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ProveedorSesion } from '@/sesion'
import { C } from '@/estilo'

/**
 * Raiz de la aplicacion.
 *
 * La sesion envuelve todo porque cada pantalla necesita saber quien entro y que
 * puede hacer. El resto —la cola, la camara— vive en la pantalla que lo usa.
 */
export default function Raiz() {
  return (
    <SafeAreaProvider>
      <ProveedorSesion>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: C.panel },
            headerTintColor: C.texto,
            headerTitleStyle: { fontWeight: '600' },
            contentStyle: { backgroundColor: C.fondo },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="entrar" options={{ title: 'Entrar' }} />
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
        </Stack>
      </ProveedorSesion>
    </SafeAreaProvider>
  )
}
