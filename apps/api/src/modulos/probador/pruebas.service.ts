import { Injectable } from '@nestjs/common'
import type { DatosRegistrarPrueba } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'

/**
 * Cuanto tiempo puede pasar entre probarse algo y comprarlo para que la compra
 * se cuente como consecuencia de la prueba.
 *
 * Una semana: mas que eso y la clienta volvio por otra cosa —una promocion, que
 * cobro— y atribuirselo al probador seria inflar el numero que justamente se
 * quiere medir.
 */
const DIAS_ATRIBUCION = 7

@Injectable()
export class PruebasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra que alguien se probo una prenda.
   *
   * Acepta visitantes sin cuenta: `prueba_virtual.session_token` existe
   * justamente para eso, y es lo correcto —probarse algo es lo que pasa ANTES
   * de decidir registrarse, y exigir cuenta para probar espantaria a la mitad
   * de la gente que el probador deberia convencer—.
   */
  async registrar(
    datos: DatosRegistrarPrueba,
    usuario: UsuarioAutenticado | null,
    sesion: string | null
  ) {
    if (!usuario && !sesion) {
      throw ExcepcionNegocio.validacion(
        { sesion: 'Inicia sesion o manda la cabecera X-Carrito' },
        'Hace falta una sesion para registrar una prueba'
      )
    }

    const variante = await this.prisma.variante.findUnique({
      where: { id: datos.variante_id },
      select: { id: true, activo: true },
    })
    if (!variante || !variante.activo) {
      throw ExcepcionNegocio.noEncontrado('Esa prenda no existe')
    }

    const clienteId = usuario ? await this.clienteSiEs(usuario.id) : null

    const prueba = await this.prisma.prueba_virtual.create({
      data: {
        cliente_id: clienteId,
        // Con cuenta no se guarda el token: el cliente ya identifica la prueba,
        // y guardar las dos cosas duplicaria el conteo al atribuir la compra.
        session_token: clienteId === null ? sesion : null,
        variante_id: datos.variante_id,
        modo: datos.modo,
        talla_recomendada_id: datos.talla_recomendada_id ?? null,
        ajuste: datos.ajuste ?? null,
        duracion_seg: datos.duracion_seg ?? null,
      },
    })

    return { id: prueba.id.toString(), creado_en: prueba.creado_en.toISOString() }
  }

  /**
   * Marca como convertidas las pruebas que terminaron en esta compra.
   *
   * Sin esto, `efectividad_probador` corre bien y devuelve 0% siempre, que es
   * la peor clase de reporte: parece que el probador no sirve cuando en
   * realidad nadie estaba anotando el resultado.
   *
   * Se llama desde el alta del pedido y no puede tumbarla: si la atribucion
   * falla, se pierde una estadistica; si tumbara la venta, se pierde la venta.
   */
  async marcarConversion(
    clienteId: number | null,
    sesion: string | null,
    varianteIds: number[]
  ): Promise<number> {
    if (varianteIds.length === 0) return 0
    if (clienteId === null && sesion === null) return 0

    const desde = new Date()
    desde.setDate(desde.getDate() - DIAS_ATRIBUCION)

    const { count } = await this.prisma.prueba_virtual.updateMany({
      where: {
        variante_id: { in: varianteIds },
        convirtio_en_compra: false,
        creado_en: { gte: desde },
        ...(clienteId !== null ? { cliente_id: clienteId } : { session_token: sesion }),
      },
      data: { convirtio_en_compra: true },
    })

    return count
  }

  /** El id de cliente del usuario, o null si es personal de tienda. */
  private async clienteSiEs(usuarioId: number): Promise<number | null> {
    const cliente = await this.prisma.cliente.findUnique({
      where: { usuario_id: usuarioId },
      select: { usuario_id: true },
    })
    return cliente?.usuario_id ?? null
  }
}
