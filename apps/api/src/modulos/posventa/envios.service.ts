import { Injectable } from '@nestjs/common'
import type {
  DatosActualizarEnvio,
  DatosConsultaEnvios,
  DatosCrearEnvio,
  Envio,
  EstadoEnvio,
} from '@aurora/contratos'
import { ROLES, salto, TRANSICIONES_ENVIO } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import { PermisosService } from '../../nucleo/autenticacion/permisos.service'
import { aNumero } from '../../nucleo/util/decimal'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'

/**
 * Envios a domicilio.
 *
 * Un pedido tiene a lo sumo un envio (`envio.pedido_id` es unico). Entregar el
 * envio marca el pedido como entregado: son el mismo hecho contado desde dos
 * lados, y dejar que se declaren por separado es como terminan los pedidos
 * entregados que en el sistema siguen en ruta.
 */
@Injectable()
export class EnviosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly bitacora: BitacoraService
  ) {}

  async crear(
    datos: DatosCrearEnvio,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Envio> {
    const pedidoId = BigInt(datos.pedido_id)

    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: {
        id: true,
        numero: true,
        estado: true,
        tipo_entrega: true,
        sucursal_id: true,
        direccion_id: true,
        costo_envio: true,
        envio: { select: { id: true } },
      },
    })
    if (!pedido) throw ExcepcionNegocio.noEncontrado('Ese pedido no existe')

    this.verificarSucursal(usuario, pedido.sucursal_id)

    if (pedido.tipo_entrega !== 'domicilio') {
      throw ExcepcionNegocio.conflicto(
        'Ese pedido no es a domicilio; se retira en la tienda y no lleva envio'
      )
    }
    if (pedido.envio) {
      throw ExcepcionNegocio.conflicto('Ese pedido ya tiene un envio registrado')
    }
    if (['pendiente', 'cancelado', 'devuelto'].includes(pedido.estado)) {
      throw ExcepcionNegocio.conflicto(
        `No se despacha un pedido ${pedido.estado}. Tiene que estar al menos pagado.`
      )
    }

    if (datos.repartidor_id !== undefined) {
      await this.verificarRepartidor(datos.repartidor_id)
    }

    const envio = await this.prisma.envio.create({
      data: {
        pedido_id: pedidoId,
        direccion_id: pedido.direccion_id,
        repartidor_id: datos.repartidor_id ?? null,
        empresa: datos.empresa ?? null,
        tracking: datos.tracking ?? null,
        // Sin costo declarado se toma el que ya se le cobro al cliente.
        costo: datos.costo > 0 ? datos.costo : aNumero(pedido.costo_envio),
        fecha_estimada: datos.fecha_estimada ?? null,
        estado: 'preparando',
      },
      select: { id: true },
    })

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'venta',
      entidad: 'envio',
      entidadId: envio.id.toString(),
      descripcion: `Envio creado para el pedido ${pedido.numero}`,
    })

    return this.detalle(envio.id, usuario)
  }

  /**
   * Avanza el envio. Al marcarlo entregado, el pedido pasa a entregado en la
   * misma transaccion.
   */
  async actualizar(
    id: bigint,
    datos: DatosActualizarEnvio,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Envio> {
    const envio = await this.prisma.envio.findUnique({
      where: { id },
      include: { pedido: { select: { id: true, numero: true, estado: true, sucursal_id: true } } },
    })
    if (!envio) throw ExcepcionNegocio.noEncontrado('Ese envio no existe')

    this.verificarSucursal(usuario, envio.pedido.sucursal_id)

    // Un repartidor solo toca los envios que tiene asignados.
    if (usuario.rol === ROLES.REPARTIDOR && envio.repartidor_id !== usuario.id) {
      throw ExcepcionNegocio.sinPermiso('Ese envio no esta asignado a vos')
    }

    const posibles = TRANSICIONES_ENVIO[envio.estado as EstadoEnvio]
    if (!posibles.includes(datos.estado)) {
      throw ExcepcionNegocio.conflicto(
        `Un envio ${envio.estado} no puede pasar a ${datos.estado}`,
        {
          estado:
            posibles.length > 0
              ? `Transiciones validas: ${posibles.join(', ')}`
              : 'Es un estado final',
        }
      )
    }

    if (datos.repartidor_id !== undefined) {
      await this.verificarRepartidor(datos.repartidor_id)
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.envio.update({
        where: { id },
        data: {
          estado: datos.estado,
          repartidor_id: datos.repartidor_id ?? envio.repartidor_id,
          tracking: datos.tracking ?? envio.tracking,
          evidencia_url: datos.evidencia_url ?? envio.evidencia_url,
          entregado_en: datos.estado === 'entregado' ? new Date() : envio.entregado_en,
        },
      })

      if (datos.estado === 'entregado' && envio.pedido.estado !== 'entregado') {
        await tx.pedido.update({ where: { id: envio.pedido_id }, data: { estado: 'entregado' } })
        await tx.pedido_historial.create({
          data: {
            pedido_id: envio.pedido_id,
            estado: 'entregado',
            usuario_id: usuario.id,
            comentario: datos.comentario ?? 'Entregado por el repartidor',
          },
        })
      }
    })

    await this.bitacora.registrar(ctx, {
      accion: 'actualizar',
      modulo: 'venta',
      entidad: 'envio',
      entidadId: id.toString(),
      descripcion: `Envio del pedido ${envio.pedido.numero}: ${envio.estado} -> ${datos.estado}`,
      datosPrevios: { estado: envio.estado },
      datosNuevos: { estado: datos.estado, comentario: datos.comentario ?? null },
    })

    return this.detalle(id, usuario)
  }

  async listar(filtros: DatosConsultaEnvios, usuario: UsuarioAutenticado) {
    const propia = this.permisos.restringeSucursal(usuario)

    const where = {
      estado: filtros.estado,
      // Un repartidor ve su hoja de ruta, no la de toda la sucursal.
      repartidor_id:
        usuario.rol === ROLES.REPARTIDOR ? usuario.id : filtros.repartidor_id,
      ...(propia !== null || filtros.sucursal_id !== undefined
        ? { pedido: { sucursal_id: propia ?? filtros.sucursal_id } }
        : {}),
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.envio.count({ where }),
      this.prisma.envio.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: salto(filtros),
        take: filtros.por_pagina,
        include: {
          pedido: { select: { numero: true } },
          usuario: { select: { nombre: true, apellido: true } },
          direccion_cliente: { select: { direccion: true } },
        },
      }),
    ])

    return {
      total,
      items: filas.map((e) => ({
        id: e.id.toString(),
        pedido_numero: e.pedido.numero,
        estado: e.estado,
        repartidor: e.usuario ? `${e.usuario.nombre} ${e.usuario.apellido}` : null,
        direccion: e.direccion_cliente?.direccion ?? null,
        tracking: e.tracking,
        costo: aNumero(e.costo),
        fecha_estimada: e.fecha_estimada?.toISOString().slice(0, 10) ?? null,
      })),
    }
  }

  async detalle(id: bigint, usuario: UsuarioAutenticado): Promise<Envio> {
    const e = await this.prisma.envio.findUnique({
      where: { id },
      include: {
        pedido: { select: { numero: true, sucursal_id: true } },
        usuario: { select: { nombre: true, apellido: true } },
        direccion_cliente: { select: { direccion: true, referencia: true } },
      },
    })
    if (!e) throw ExcepcionNegocio.noEncontrado('Ese envio no existe')

    this.verificarSucursal(usuario, e.pedido.sucursal_id)

    return {
      id: e.id.toString(),
      pedido_id: e.pedido_id.toString(),
      pedido_numero: e.pedido.numero,
      estado: e.estado,
      repartidor: e.usuario ? `${e.usuario.nombre} ${e.usuario.apellido}` : null,
      empresa: e.empresa,
      tracking: e.tracking,
      costo: aNumero(e.costo),
      direccion: e.direccion_cliente
        ? [e.direccion_cliente.direccion, e.direccion_cliente.referencia]
            .filter(Boolean)
            .join(' - ')
        : null,
      fecha_estimada: e.fecha_estimada?.toISOString().slice(0, 10) ?? null,
      entregado_en: e.entregado_en?.toISOString() ?? null,
      evidencia_url: e.evidencia_url,
    }
  }

  private async verificarRepartidor(usuarioId: number): Promise<void> {
    const u = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { activo: true, rol: { select: { nombre: true } } },
    })
    if (!u?.activo) {
      throw ExcepcionNegocio.validacion({ repartidor_id: 'Ese usuario no existe o esta inactivo' })
    }
    if (u.rol.nombre !== ROLES.REPARTIDOR) {
      throw ExcepcionNegocio.validacion({
        repartidor_id: `${u.rol.nombre} no es un rol de reparto`,
      })
    }
  }

  private verificarSucursal(usuario: UsuarioAutenticado, sucursalId: number): void {
    const propia = this.permisos.restringeSucursal(usuario)
    if (propia !== null && propia !== sucursalId) {
      throw ExcepcionNegocio.sinPermiso('Ese envio no es de tu sucursal')
    }
  }
}
