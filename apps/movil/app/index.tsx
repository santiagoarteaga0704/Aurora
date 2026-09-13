import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { router } from 'expo-router'
import { useSesion } from '@/sesion'
import { C, estilos } from '@/estilo'

/**
 * Puerta de entrada.
 *
 * Decide a donde va quien abre la app. Es una pantalla propia y no logica
 * dentro del layout porque `expo-router` navega recien cuando hay un arbol
 * montado: redirigir desde el layout deja la navegacion a medio armar.
 */
export default function Inicio() {
  const { perfil, cargando } = useSesion()

  useEffect(() => {
    if (cargando) return
    router.replace(perfil ? '/(app)/venta' : '/entrar')
  }, [perfil, cargando])

  return (
    <View style={[estilos.pantalla, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={C.laton} size="large" />
    </View>
  )
}
