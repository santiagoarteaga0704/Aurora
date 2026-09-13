import { Injectable } from '@nestjs/common'
import type { DatosActualizarDireccion, DatosDireccion, Direccion } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'

/**
 * Direcciones de entrega del cliente.
 *
 * Todas las operaciones van contra el cliente de la sesion; no hay forma de
 * pedir la direccion de otro. Una direccion es el dato mas sensible que guarda
 * la tienda: dice donde vive una persona.
 */
@Injectable()
export class ClientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitacora: BitacoraService
  ) {}

  async misDirecciones(usuario: UsuarioAutenticado): Promise<Direccion[]> {
    const clienteId = await this.clienteDe(usuario)

    const filas = await this.prisma.direccion_cliente.findMany({
      where: { cliente_id: clienteId, activo: true },
      orderBy: [{ es_principal: 'desc' }, { id: 'asc' }],
      include: {
        ciudad: { select: { nombre: true, departamento: { select: { nombre: true } } } },
      },
    })

    return filas.map((d) => ({
      id: d.id,
      alias: d.alias,
      ciudad: d.ciudad.nombre,
      ciudad_id: d.ciudad_id,
      departamento: d.ciudad.departamento.nombre,
      direccion: d.direccion,
      referencia: d.referencia,
      destinatario: d.destinatario,
      telefono: d.telefono,
      es_principal: d.es_principal,
    }))
  }

  async agregar(
    datos: DatosDireccion,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Direccion[]> {
    const clienteId = await this.clienteDe(usuario)
    await this.verificarCiudad(datos.ciudad_id)

    const cuantas = await this.prisma.direccion_cliente.count({
      where: { cliente_id: clienteId, activo: true },
    })

    await this.prisma.$transaction(async (tx) => {
      // La primera direccion es la principal aunque no lo pidan: si ninguna lo
      // fuera, el checkout no tendria cual proponer.
      const principal = datos.es_principal || cuantas === 0

      if (principal) {
        await tx.direccion_cliente.updateMany({
          where: { cliente_id: clienteId },
          data: { es_principal: false },
        })
      }

      await tx.direccion_cliente.create({
        data: {
          cliente_id: clienteId,
          alias: datos.alias,
          ciudad_id: datos.ciudad_id,
          direccion: datos.direccion,
          referencia: datos.referencia ?? null,
          latitud: datos.latitud,
          longitud: datos.longitud,
          destinatario: datos.destinatario ?? null,
          telefono: datos.telefono ?? null,
          es_principal: principal,
        },
      })
    })

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'cliente',
      entidad: 'direccion_cliente',
      entidadId: clienteId,
      descripcion: `Direccion "${datos.alias}" agregada`,
    })

    return this.misDirecciones(usuario)
  }

  async actualizar(
    id: number,
    datos: DatosActualizarDireccion,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Direccion[]> {
    const clienteId = await this.clienteDe(usuario)
    const direccion = await this.mia(id, clienteId)

    if (datos.ciudad_id !== undefined) await this.verificarCiudad(datos.ciudad_id)

    await this.prisma.$transaction(async (tx) => {
      if (datos.es_principal) {
        await tx.direccion_cliente.updateMany({
          where: { cliente_id: clienteId },
          data: { es_principal: false },
        })
      }
      await tx.direccion_cliente.update({ where: { id: direccion.id }, data: datos })
    })

    await this.bitacora.registrar(ctx, {
      accion: 'actualizar',
      modulo: 'cliente',
      entidad: 'direccion_cliente',
      entidadId: id,
      descripcion: `Direccion "${direccion.alias}" editada`,
    })

    return this.misDirecciones(usuario)
  }

  /**
   * Baja logica. No se borra porque los pedidos ya enviados apuntan a ella: sin
   * la fila, el historial de un envio se quedaria sin destino.
   */
  async quitar(
    id: number,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Direccion[]> {
    const clienteId = await this.clienteDe(usuario)
    const direccion = await this.mia(id, clienteId)

    await this.prisma.direccion_cliente.update({
      where: { id: direccion.id },
      data: { activo: false, es_principal: false },
    })

    // Si se quito la principal, otra toma su lugar para que el checkout siga
    // teniendo una propuesta.
    if (direccion.es_principal) {
      const otra = await this.prisma.direccion_cliente.findFirst({
        where: { cliente_id: clienteId, activo: true },
        orderBy: { id: 'asc' },
        select: { id: true },
      })
      if (otra) {
        await this.prisma.direccion_cliente.update({
          where: { id: otra.id },
          data: { es_principal: true },
        })
      }
    }

    await this.bitacora.registrar(ctx, {
      accion: 'eliminar',
      modulo: 'cliente',
      entidad: 'direccion_cliente',
      entidadId: id,
      descripcion: `Direccion "${direccion.alias}" quitada`,
    })

    return this.misDirecciones(usuario)
  }

  private async clienteDe(usuario: UsuarioAutenticado): Promise<number> {
    const cliente = await this.prisma.cliente.findUnique({
      where: { usuario_id: usuario.id },
      select: { usuario_id: true },
    })
    if (!cliente) {
      throw ExcepcionNegocio.sinPermiso(
        'Esta seccion es de la cuenta de cliente; el personal no tiene direcciones de entrega'
      )
    }
    return cliente.usuario_id
  }

  private async mia(id: number, clienteId: number) {
    const d = await this.prisma.direccion_cliente.findUnique({ where: { id } })
    // Mismo 404 para una direccion inexistente y para la de otra persona: decir
    // "no es tuya" confirmaria que existe.
    if (!d || d.cliente_id !== clienteId || !d.activo) {
      throw ExcepcionNegocio.noEncontrado('Esa direccion no existe')
    }
    return d
  }

  private async verificarCiudad(ciudadId: number): Promise<void> {
    const c = await this.prisma.ciudad.findUnique({
      where: { id: ciudadId },
      select: { activo: true },
    })
    if (!c?.activo) {
      throw ExcepcionNegocio.validacion({ ciudad_id: 'Esa ciudad no existe o no tiene cobertura' })
    }
  }
}
