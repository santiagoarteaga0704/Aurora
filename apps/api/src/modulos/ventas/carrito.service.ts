import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import type { Carrito, DatosAgregarAlCarrito, ItemCarrito } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { PreciosService } from '../catalogo/precios.service'
import { aNumero } from '../../nucleo/util/decimal'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'

/**
 * Carrito de compras.
 *
 * Funciona con y sin sesion. El visitante anonimo recibe un `session_token` que
 * el PWA guarda, y al iniciar sesion su carrito se fusiona con el de su cuenta
 * en lugar de perderse: abandonar el carrito al registrarse es una de las
 * formas mas tontas de perder una venta.
 *
 * Los precios NO se confian a lo guardado: se recalculan en cada lectura contra
 * PreciosService. Un carrito que estuvo tres dias abierto mostraria precios
 * viejos, y peor, el checkout podria cobrarlos.
 */
@Injectable()
export class CarritoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly precios: PreciosService
  ) {}

  /**
   * Devuelve el carrito del usuario o del token anonimo, creandolo si hace
   * falta. Si llegan los dos, el anonimo se vuelca en el de la cuenta.
   */
  async obtenerOCrear(
    usuario: UsuarioAutenticado | null,
    sessionToken: string | null
  ): Promise<{ id: bigint; session_token: string; cliente_id: number | null }> {
    const clienteId = await this.clienteDe(usuario)

    if (clienteId === null) {
      const token = sessionToken ?? randomUUID()
      const existente = await this.prisma.carrito.findUnique({ where: { session_token: token } })
      if (existente) return existente

      return this.prisma.carrito.create({
        data: { session_token: token, cliente_id: null },
      })
    }

    let deCuenta = await this.prisma.carrito.findFirst({ where: { cliente_id: clienteId } })
    if (!deCuenta) {
      deCuenta = await this.prisma.carrito.create({
        data: { session_token: randomUUID(), cliente_id: clienteId },
      })
    }

    if (sessionToken) {
      await this.fusionar(sessionToken, deCuenta.id, clienteId)
    }

    return deCuenta
  }

  /**
   * Vuelca un carrito anonimo en el de la cuenta y lo borra.
   *
   * Si un articulo esta en los dos, se queda la cantidad mayor en vez de
   * sumarlas: quien puso 2 en el celular y 2 en la computadora quiere 2, no 4.
   */
  private async fusionar(sessionToken: string, destinoId: bigint, clienteId: number) {
    const anonimo = await this.prisma.carrito.findUnique({
      where: { session_token: sessionToken },
      include: { carrito_item: true },
    })

    if (!anonimo || anonimo.id === destinoId || anonimo.cliente_id === clienteId) return

    // Solo se fusiona un carrito que no era de nadie. Uno que ya pertenece a
    // otra cuenta no se toca: seria llevarse el carrito ajeno con solo conocer
    // su token.
    if (anonimo.cliente_id !== null) return

    await this.prisma.$transaction(async (tx) => {
      for (const item of anonimo.carrito_item) {
        const enDestino = await tx.carrito_item.findUnique({
          where: {
            carrito_id_variante_id: { carrito_id: destinoId, variante_id: item.variante_id },
          },
        })

        if (enDestino) {
          if (item.cantidad > enDestino.cantidad) {
            await tx.carrito_item.update({
              where: { id: enDestino.id },
              data: { cantidad: item.cantidad },
            })
          }
        } else {
          await tx.carrito_item.create({
            data: {
              carrito_id: destinoId,
              variante_id: item.variante_id,
              cantidad: item.cantidad,
              precio_unitario: item.precio_unitario,
            },
          })
        }
      }

      await tx.carrito.delete({ where: { id: anonimo.id } })
    })
  }

  // ==========================================================================
  // Lectura
  // ==========================================================================

  async ver(usuario: UsuarioAutenticado | null, sessionToken: string | null): Promise<Carrito> {
    const carrito = await this.obtenerOCrear(usuario, sessionToken)
    return this.armar(carrito.id, carrito.session_token, carrito.cliente_id)
  }

  private async armar(
    carritoId: bigint,
    sessionToken: string,
    clienteId: number | null
  ): Promise<Carrito> {
    const items = await this.prisma.carrito_item.findMany({
      where: { carrito_id: carritoId },
      orderBy: { agregado_en: 'asc' },
      include: {
        variante: {
          select: {
            id: true,
            sku: true,
            talla: { select: { nombre: true } },
            color: { select: { nombre: true } },
            inventario: { select: { stock: true, stock_reservado: true } },
            producto: {
              select: {
                nombre: true,
                slug: true,
                producto_imagen: {
                  where: { es_principal: true },
                  take: 1,
                  select: { url: true },
                },
              },
            },
          },
        },
      },
    })

    if (items.length === 0) {
      return {
        session_token: sessionToken,
        items: [],
        unidades: 0,
        subtotal: 0,
        modalidad: await this.precios.modalidadDe(clienteId),
      }
    }

    const modalidad = await this.precios.modalidadDe(clienteId)
    const precios = await this.precios.resolver(
      items.map((i) => ({ variante_id: i.variante_id, cantidad: i.cantidad })),
      modalidad
    )

    const lineas: ItemCarrito[] = items.map((item, n) => {
      const precio = precios[n].precio_unitario
      const disponible = item.variante.inventario.reduce(
        (s, i) => s + i.stock - i.stock_reservado,
        0
      )

      return {
        variante_id: item.variante_id,
        sku: item.variante.sku,
        producto: item.variante.producto.nombre,
        slug: item.variante.producto.slug,
        talla: item.variante.talla.nombre,
        color: item.variante.color.nombre,
        imagen: item.variante.producto.producto_imagen[0]?.url ?? null,
        cantidad: item.cantidad,
        precio_unitario: precio,
        subtotal: PreciosService.centavos(precio * item.cantidad),
        disponible,
        sin_stock: disponible < item.cantidad,
      }
    })

    // El precio guardado se refresca para que un listado administrativo del
    // carrito no muestre cifras que ya no rigen.
    await Promise.all(
      items.map((item, n) =>
        aNumero(item.precio_unitario) === precios[n].precio_unitario
          ? Promise.resolve()
          : this.prisma.carrito_item.update({
              where: { id: item.id },
              data: { precio_unitario: precios[n].precio_unitario },
            })
      )
    )

    return {
      session_token: sessionToken,
      items: lineas,
      unidades: lineas.reduce((s, l) => s + l.cantidad, 0),
      subtotal: PreciosService.centavos(lineas.reduce((s, l) => s + l.subtotal, 0)),
      modalidad,
    }
  }

  // ==========================================================================
  // Escritura
  // ==========================================================================

  async agregar(
    datos: DatosAgregarAlCarrito,
    usuario: UsuarioAutenticado | null,
    sessionToken: string | null
  ): Promise<Carrito> {
    const carrito = await this.obtenerOCrear(usuario, sessionToken)
    const modalidad = await this.precios.modalidadDe(carrito.cliente_id)

    // Resolver el precio valida de paso que la variante exista y este a la
    // venta, asi que no hace falta comprobarlo aparte.
    const [precio] = await this.precios.resolver(
      [{ variante_id: datos.variante_id, cantidad: datos.cantidad }],
      modalidad
    )

    const existente = await this.prisma.carrito_item.findUnique({
      where: {
        carrito_id_variante_id: { carrito_id: carrito.id, variante_id: datos.variante_id },
      },
    })

    if (existente) {
      // Agregar dos veces el mismo articulo suma, no reemplaza: es lo que espera
      // quien vuelve al producto y pulsa "agregar" otra vez.
      await this.prisma.carrito_item.update({
        where: { id: existente.id },
        data: { cantidad: Math.min(existente.cantidad + datos.cantidad, 999) },
      })
    } else {
      await this.prisma.carrito_item.create({
        data: {
          carrito_id: carrito.id,
          variante_id: datos.variante_id,
          cantidad: datos.cantidad,
          precio_unitario: precio.precio_unitario,
        },
      })
    }

    await this.tocar(carrito.id)
    return this.armar(carrito.id, carrito.session_token, carrito.cliente_id)
  }

  async cambiarCantidad(
    varianteId: number,
    cantidad: number,
    usuario: UsuarioAutenticado | null,
    sessionToken: string | null
  ): Promise<Carrito> {
    const carrito = await this.obtenerOCrear(usuario, sessionToken)

    const item = await this.prisma.carrito_item.findUnique({
      where: { carrito_id_variante_id: { carrito_id: carrito.id, variante_id: varianteId } },
    })
    if (!item) throw ExcepcionNegocio.noEncontrado('Ese articulo no esta en el carrito')

    if (cantidad === 0) {
      await this.prisma.carrito_item.delete({ where: { id: item.id } })
    } else {
      await this.prisma.carrito_item.update({ where: { id: item.id }, data: { cantidad } })
    }

    await this.tocar(carrito.id)
    return this.armar(carrito.id, carrito.session_token, carrito.cliente_id)
  }

  async quitar(
    varianteId: number,
    usuario: UsuarioAutenticado | null,
    sessionToken: string | null
  ): Promise<Carrito> {
    return this.cambiarCantidad(varianteId, 0, usuario, sessionToken)
  }

  async vaciar(
    usuario: UsuarioAutenticado | null,
    sessionToken: string | null
  ): Promise<Carrito> {
    const carrito = await this.obtenerOCrear(usuario, sessionToken)
    await this.prisma.carrito_item.deleteMany({ where: { carrito_id: carrito.id } })
    await this.tocar(carrito.id)
    return this.armar(carrito.id, carrito.session_token, carrito.cliente_id)
  }

  /** Lo llama el checkout una vez que el pedido quedo registrado. */
  async vaciarPorId(carritoId: bigint): Promise<void> {
    await this.prisma.carrito_item.deleteMany({ where: { carrito_id: carritoId } })
  }

  // ==========================================================================
  // Internos
  // ==========================================================================

  /** Solo un cliente tiene carrito; el personal vende desde el punto de venta. */
  private async clienteDe(usuario: UsuarioAutenticado | null): Promise<number | null> {
    if (!usuario) return null
    const cliente = await this.prisma.cliente.findUnique({
      where: { usuario_id: usuario.id },
      select: { usuario_id: true },
    })
    return cliente?.usuario_id ?? null
  }

  private tocar(carritoId: bigint) {
    return this.prisma.carrito.update({
      where: { id: carritoId },
      data: { actualizado_en: new Date() },
    })
  }
}
