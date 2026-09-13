import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type {
  AjusteReal,
  CompraResenable,
  DatosConsultaResenas,
  DatosEscribirResena,
  DatosModerarResena,
  Resena,
  ResumenResenas,
} from '@aurora/contratos'
import { PERMISOS, salto } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import { PermisosService } from '../../nucleo/autenticacion/permisos.service'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'

@Injectable()
export class ResenasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly bitacora: BitacoraService
  ) {}

  // ==========================================================================
  // Escribir
  // ==========================================================================

  /**
   * Registra una resenia.
   *
   * Tres cosas tienen que cumplirse y las tres se comprueban contra la base, no
   * contra lo que mande el cliente: que el pedido sea suyo, que este entregado,
   * y que ese pedido incluya ese producto. Sin la tercera, alguien con un pedido
   * entregado de medias podria calificar cualquier vestido del catalogo.
   *
   * La cuarta —una sola resenia por pedido y producto— la garantiza la
   * restriccion unica de la base, no este codigo: entre comprobar y escribir hay
   * una ventana en la que dos peticiones simultaneas pasarian las dos.
   */
  async escribir(
    datos: DatosEscribirResena,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Resena> {
    const clienteId = await this.clienteDe(usuario)

    const pedido = await this.prisma.pedido.findUnique({
      where: { id: BigInt(datos.pedido_id) },
      select: {
        id: true,
        numero: true,
        cliente_id: true,
        estado: true,
        pedido_detalle: {
          select: { variante: { select: { producto_id: true, talla_id: true } } },
        },
      },
    })

    // Mismo 404 para un pedido inexistente y para el de otra persona: decir
    // "no es tuyo" confirmaria que existe y de quien es.
    if (!pedido || pedido.cliente_id !== clienteId) {
      throw ExcepcionNegocio.noEncontrado('Ese pedido no existe')
    }

    if (pedido.estado !== 'entregado') {
      throw ExcepcionNegocio.conflicto(
        'Solo se puede opinar de una prenda que ya recibiste'
      )
    }

    const lineas = pedido.pedido_detalle.filter(
      (d) => d.variante.producto_id === datos.producto_id
    )
    if (lineas.length === 0) {
      throw ExcepcionNegocio.conflicto('Ese pedido no incluye esta prenda')
    }

    /**
     * La talla se toma del pedido, no de lo que mande el cliente.
     *
     * Es el dato que despues sirve para saber si la guia de tallas de una
     * categoria esta bien calibrada, y no valdria nada si cualquiera pudiera
     * declarar que compro una talla que no compro.
     */
    const tallaComprada = lineas[0].variante.talla_id

    /**
     * Una calificacion sola se publica; una con texto espera moderacion.
     *
     * Un numero del 1 al 5 no tiene nada que moderar y retenerlo solo demora el
     * unico dato que el catalogo necesita. El texto libre si: es lo que puede
     * traer un insulto o el telefono de alguien.
     */
    const aprobado = !datos.comentario || datos.comentario.trim() === ''

    let fila
    try {
      fila = await this.prisma.resena.create({
        data: {
          producto_id: datos.producto_id,
          cliente_id: clienteId,
          pedido_id: pedido.id,
          calificacion: datos.calificacion,
          comentario: datos.comentario?.trim() || null,
          talla_comprada_id: tallaComprada,
          ajuste_real: datos.ajuste_real ?? null,
          aprobado,
        },
        include: {
          producto: { select: { nombre: true } },
          cliente: { select: { usuario: { select: { nombre: true } } } },
          talla: { select: { nombre: true } },
        },
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw ExcepcionNegocio.conflicto('Ya opinaste sobre esta prenda en este pedido')
      }
      throw e
    }

    await this.recalcular(datos.producto_id)

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'resena',
      entidad: 'resena',
      entidadId: fila.id.toString(),
      descripcion: `Resenia de ${datos.calificacion} estrellas sobre "${fila.producto.nombre}" (pedido ${pedido.numero})`,
    })

    return this.aContrato(fila)
  }

  /**
   * Las compras sobre las que todavia se puede opinar.
   *
   * Se calcula en el servidor porque la regla es la misma que valida el alta.
   * Escrita dos veces, tarde o temprano dejarian de coincidir y la tienda
   * ofreceria opinar sobre algo que el servidor despues rechaza.
   */
  async pendientesDe(usuario: UsuarioAutenticado): Promise<CompraResenable[]> {
    const clienteId = await this.clienteDe(usuario)

    const entregados = await this.prisma.pedido.findMany({
      where: { cliente_id: clienteId, estado: 'entregado' },
      orderBy: { actualizado_en: 'desc' },
      take: 50,
      select: {
        id: true,
        numero: true,
        actualizado_en: true,
        pedido_detalle: {
          select: {
            variante: {
              select: {
                talla_id: true,
                talla: { select: { nombre: true } },
                producto: { select: { id: true, nombre: true, slug: true } },
              },
            },
          },
        },
        resena: { select: { producto_id: true } },
      },
    })

    const pendientes: CompraResenable[] = []

    for (const pedido of entregados) {
      const yaOpinadas = new Set(pedido.resena.map((r) => r.producto_id))
      const vistos = new Set<number>()

      for (const linea of pedido.pedido_detalle) {
        const producto = linea.variante.producto
        // Dos lineas del mismo producto en distinto color son una sola resenia:
        // la restriccion unica es por producto, no por variante.
        if (yaOpinadas.has(producto.id) || vistos.has(producto.id)) continue
        vistos.add(producto.id)

        pendientes.push({
          pedido_id: pedido.id.toString(),
          pedido_numero: pedido.numero,
          producto_id: producto.id,
          producto: producto.nombre,
          slug: producto.slug,
          talla_comprada_id: linea.variante.talla_id,
          talla_comprada: linea.variante.talla.nombre,
          entregado_en: pedido.actualizado_en.toISOString(),
        })
      }
    }

    return pendientes
  }

  // ==========================================================================
  // Leer
  // ==========================================================================

  /**
   * Resenias de un producto.
   *
   * Solo las aprobadas, salvo que quien consulte pueda moderar. Una resenia con
   * comentario retenida no se muestra ni siquiera a quien la escribio en esta
   * pantalla: aparece en su propio listado, donde se le explica que esta en
   * revision, y no mezclada entre las publicadas como si ya lo estuviera.
   */
  async listar(filtros: DatosConsultaResenas, usuario: UsuarioAutenticado | null) {
    const puedeModerar =
      usuario !== null && this.permisos.puede(usuario.permisos, PERMISOS.RESENA_MODERAR)

    if (filtros.pendientes && !puedeModerar) {
      throw ExcepcionNegocio.sinPermiso('No podes ver las resenias sin aprobar')
    }

    const where: Prisma.resenaWhereInput = {
      ...(filtros.producto_id ? { producto_id: filtros.producto_id } : {}),
      ...(filtros.pendientes ? { aprobado: false } : puedeModerar ? {} : { aprobado: true }),
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.resena.count({ where }),
      this.prisma.resena.findMany({
        where,
        orderBy: { creado_en: 'desc' },
        skip: salto(filtros),
        take: filtros.por_pagina,
        include: {
          producto: { select: { nombre: true } },
          cliente: { select: { usuario: { select: { nombre: true } } } },
          talla: { select: { nombre: true } },
        },
      }),
    ])

    return { total, items: filas.map((f) => this.aContrato(f)) }
  }

  /**
   * El resumen que va arriba de la lista en la ficha.
   *
   * Incluye el reparto por estrellas y lo que dice la gente del talle. El
   * promedio solo esconde lo que importa: cuatro estrellas de "casi todas
   * cinco con una de uno" no es lo mismo que cuatro de "todas cuatro", y sobre
   * el talle un promedio directamente no significa nada.
   */
  async resumen(productoId: number): Promise<ResumenResenas> {
    const filas = await this.prisma.resena.findMany({
      where: { producto_id: productoId, aprobado: true },
      select: { calificacion: true, ajuste_real: true },
    })

    const reparto: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
    const ajuste: Record<AjusteReal, number> = { pequena: 0, justa: 0, grande: 0 }
    let suma = 0

    for (const f of filas) {
      reparto[String(f.calificacion)] = (reparto[String(f.calificacion)] ?? 0) + 1
      suma += f.calificacion
      if (f.ajuste_real) ajuste[f.ajuste_real as AjusteReal] += 1
    }

    return {
      promedio: filas.length === 0 ? 0 : Math.round((suma / filas.length) * 100) / 100,
      total: filas.length,
      reparto,
      ajuste,
    }
  }

  // ==========================================================================
  // Moderar
  // ==========================================================================

  async moderar(
    id: bigint,
    datos: DatosModerarResena,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Resena> {
    const existente = await this.prisma.resena.findUnique({
      where: { id },
      select: { id: true, producto_id: true, aprobado: true },
    })
    if (!existente) throw ExcepcionNegocio.noEncontrado('Esa resenia no existe')

    if (datos.aprobada) {
      const fila = await this.prisma.resena.update({
        where: { id },
        data: { aprobado: true },
        include: {
          producto: { select: { nombre: true } },
          cliente: { select: { usuario: { select: { nombre: true } } } },
          talla: { select: { nombre: true } },
        },
      })

      await this.recalcular(existente.producto_id)
      await this.bitacora.registrar(ctx, {
        accion: 'aprobar',
        modulo: 'resena',
        entidad: 'resena',
        entidadId: id.toString(),
        descripcion: `Resenia aprobada sobre "${fila.producto.nombre}"`,
      })

      return this.aContrato(fila)
    }

    // Rechazar borra: guardar un comentario que nunca se va a publicar es
    // quedarse con texto de otra persona sin ningun uso.
    const fila = await this.prisma.resena.delete({
      where: { id },
      include: {
        producto: { select: { nombre: true } },
        cliente: { select: { usuario: { select: { nombre: true } } } },
        talla: { select: { nombre: true } },
      },
    })

    await this.recalcular(existente.producto_id)
    await this.bitacora.registrar(ctx, {
      accion: 'eliminar',
      modulo: 'resena',
      entidad: 'resena',
      entidadId: id.toString(),
      descripcion: `Resenia rechazada sobre "${fila.producto.nombre}"`,
    })

    return this.aContrato(fila)
  }

  // ==========================================================================

  /**
   * Deja `producto.calificacion` al dia.
   *
   * Es un campo derivado, y existe porque el catalogo ordena y filtra por el:
   * calcularlo en cada listado significaria un promedio sobre toda la tabla de
   * resenias por cada producto de cada pagina.
   *
   * Solo cuentan las aprobadas. Si contaran las retenidas, una resenia con
   * comentario movería la estrella de la ficha antes de que nadie la haya leido,
   * que es exactamente lo que la moderacion viene a evitar.
   */
  private async recalcular(productoId: number): Promise<void> {
    const agregado = await this.prisma.resena.aggregate({
      where: { producto_id: productoId, aprobado: true },
      _avg: { calificacion: true },
    })

    await this.prisma.producto.update({
      where: { id: productoId },
      data: {
        calificacion: new Prisma.Decimal(
          Math.round((agregado._avg.calificacion ?? 0) * 100) / 100
        ),
      },
    })
  }

  private async clienteDe(usuario: UsuarioAutenticado): Promise<number> {
    const cliente = await this.prisma.cliente.findUnique({
      where: { usuario_id: usuario.id },
      select: { usuario_id: true },
    })
    if (!cliente) {
      throw ExcepcionNegocio.sinPermiso(
        'Opinar es de la cuenta de cliente: el personal de tienda no compra aca'
      )
    }
    return cliente.usuario_id
  }

  private aContrato(f: {
    id: bigint
    producto_id: number
    producto: { nombre: string }
    cliente: { usuario: { nombre: string } }
    calificacion: number
    comentario: string | null
    talla: { nombre: string } | null
    ajuste_real: string | null
    aprobado: boolean
    creado_en: Date
  }): Resena {
    return {
      id: f.id.toString(),
      producto_id: f.producto_id,
      producto: f.producto.nombre,
      // Solo el nombre de pila: nadie acepto publicar su apellido al comprar.
      autora: f.cliente.usuario.nombre,
      calificacion: f.calificacion,
      comentario: f.comentario,
      talla_comprada: f.talla?.nombre ?? null,
      ajuste_real: f.ajuste_real as AjusteReal | null,
      aprobado: f.aprobado,
      creado_en: f.creado_en.toISOString(),
    }
  }
}
