import { useEffect } from 'react'
import { Text } from 'react-native'
import type { ColorValue } from 'react-native'
import { router, Tabs } from 'expo-router'
import { useSesion } from '@/sesion'
import { C, E } from '@/estilo'

/**
 * Las tres pantallas de la app.
 *
 * La app movil es para el PERSONAL, no una segunda tienda: el PWA ya es
 * instalable y rehacer la vidriera en React Native seria hacer dos veces lo
 * mismo. Lo que si tiene sentido en un telefono es lo que se hace de pie:
 * cobrar leyendo un codigo de barras, mirar si queda stock, y repartir.
 *
 * Las pestanias se muestran segun el permiso. Un repartidor no tiene por que
 * ver el punto de venta, y una vendedora no reparte.
 */
export default function LayoutApp() {
  const { perfil, cargando, puede } = useSesion()

  useEffect(() => {
    if (!cargando && !perfil) router.replace('/entrar')
  }, [perfil, cargando])

  // `color` viene como ColorValue y no como string: puede ser null cuando el
  // tema no define uno. Se tipa como lo entrega la libreria.
  const icono = (simbolo: string) => ({ color }: { color: ColorValue }) => (
    <Text style={{ color, fontSize: 18 }}>{simbolo}</Text>
  )

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.panel },
        headerTintColor: C.texto,
        tabBarStyle: {
          backgroundColor: C.panel,
          borderTopColor: C.borde,
          height: 62,
          paddingBottom: E.e2,
          paddingTop: E.e2,
        },
        tabBarActiveTintColor: C.laton,
        tabBarInactiveTintColor: C.suave,
        sceneStyle: { backgroundColor: C.fondo },
      }}
    >
      <Tabs.Screen
        name="venta"
        options={{
          title: 'Vender',
          href: puede('venta.crear') ? '/(app)/venta' : null,
          tabBarIcon: icono('▣'),
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: 'Stock',
          href: puede('inventario.ver') ? '/(app)/stock' : null,
          tabBarIcon: icono('▤'),
        }}
      />
      <Tabs.Screen
        name="ruta"
        options={{
          title: 'Ruta',
          href: puede('venta.despachar') ? '/(app)/ruta' : null,
          tabBarIcon: icono('▲'),
        }}
      />
    </Tabs>
  )
}
