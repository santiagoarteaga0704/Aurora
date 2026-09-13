import { Injectable, Logger } from '@nestjs/common'
import type {
  DatosConsultaNotificaciones,
  Notificacion,
  TipoNotificacion,
} from '@aurora/contratos'
import { salto } from '@aurora/contratos'
import { PrismaService } from '../prisma/prisma.service'
import { ExcepcionNegocio } from '../errores/excepcion-negocio'
import type { UsuarioAutenticado } from '../autenticacion/tipos'

/** Lo que hace falta para crear un aviso. */
export interface Aviso {
  usuarioId: number
  tipo: TipoNotificacion
  titulo: string
  mensaje: string
  /** A donde lleva. Un aviso sin destino obliga a buscar a mano de que hablaba. */
  url?: string | null
}

/**
 * Avisos a los usuarios.
 *
 * Vive en `nucleo/` y no en `modulos/` porque casi todos los modulos necesitan
 * avisar algo, y si fuera un modulo de negocio habria que importarlo en cada
 * uno —ventas, posventa, inventario— creando un nudo de dependencias por algo
 * que no es negocio, es infraestructura. Es la misma razon por la que la
 * bitacora esta donde esta.
 */
@Injectable()
export class NotificacionesService {
  private readonly log = new Logger('Notificaciones')

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea un aviso.
   *
   * **Nunca lanza.** Se llama desde dentro de operaciones que ya salieron bien
   * —el pedido se despacho, el pago se confirmo— y fallar aca solo puede
   * significar una cosa: que una operacion terminada se reporte como fallida
   * porque no se pudo avisar de ella. Perder un aviso es molesto; deshacer una
   * venta cobrada por no poder avisarla es inaceptable.
   *
   * Los titulos y mensajes van recortados a lo que aguanta la columna: un
   * nombre de producto largo no puede tumbar el aviso.
   */
  async crear(aviso: Aviso): Promise<void> {
    try {
      await this.prisma.notificacion.create({
        data: {
          usuario_id: aviso.usuarioId,
          tipo: aviso.tipo,
          titulo: aviso.titulo.slice(0, 120),
          mensaje: aviso.mensaje.slice(0, 255),
          url: aviso.url?.slice(0, 255) ?? null,
        },
      })
    } catch (e) {
      this.log.warn(`No se pudo crear el aviso: ${(e as Error).message}`)
    }
  }

  /**
   * El mismo aviso a varias personas.
   *
   * Para los avisos de stock: no le interesan a un usuario concreto sino a
   * quien pueda reponer, que son varios.
   */
  async crearVarios(usuarioIds: number[], aviso: Omit<Aviso, 'usuarioId'>): Promise<void> {
    const unicos = [...new Set(usuarioIds)]
    if (unicos.length === 0) return

    try {
      await this.prisma.notificacion.createMany({
        data: unicos.map((usuarioId) => ({
          usuario_id: usuarioId,
          tipo: aviso.tipo,
          titulo: aviso.titulo.slice(0, 120),
          mensaje: aviso.mensaje.slice(0, 255),
          url: aviso.url?.slice(0, 255) ?? null,
        })),
      })
    } catch (e) {
      this.log.warn(`No se pudieron crear los avisos: ${(e as Error).message}`)
    }
  }

  /**
   * Quienes deberian enterarse de algo que pasa en una sucursal.
   *
   * Se resuelve por permiso y no por rol: el dia que alguien cree un rol nuevo
   * que pueda reponer, se entera sin que haya que tocar este codigo.
   */
  async quienPuede(permiso: string, sucursalId: number | null): Promise<number[]> {
    const usuarios = await this.prisma.usuario.findMany({
      where: {
        activo: true,
        ...(sucursalId === null ? {} : { OR: [{ sucursal_id: sucursalId }, { sucursal_id: null }] }),
        rol: {
          rol_permiso: {
            some: { permiso: { codigo: { in: [permiso, '*'] } } },
          },
        },
      },
      select: { id: true },
    })

    return usuarios.map((u) => u.id)
  }

  // ==========================================================================
  // Lectura
  // ==========================================================================

  async listar(filtros: DatosConsultaNotificaciones, usuario: UsuarioAutenticado) {
    const where = {
      usuario_id: usuario.id,
      ...(filtros.sin_leer ? { leida: false } : {}),
      ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.notificacion.count({ where }),
      this.prisma.notificacion.findMany({
        where,
        orderBy: { creado_en: 'desc' },
        skip: salto(filtros),
        take: filtros.por_pagina,
      }),
    ])

    return {
      total,
      items: filas.map(
        (n): Notificacion => ({
          id: n.id.toString(),
          titulo: n.titulo,
          mensaje: n.mensaje,
          tipo: n.tipo as TipoNotificacion,
          url: n.url,
          leida: n.leida,
          creado_en: n.creado_en.toISOString(),
        })
      ),
    }
  }

  /** Lo unico que la campanita necesita saber para pintar el punto. */
  async sinLeer(usuario: UsuarioAutenticado): Promise<{ sin_leer: number }> {
    const sin_leer = await this.prisma.notificacion.count({
      where: { usuario_id: usuario.id, leida: false },
    })
    return { sin_leer }
  }

  async marcarLeida(id: bigint, usuario: UsuarioAutenticado): Promise<{ sin_leer: number }> {
    // `updateMany` con el usuario en el `where` en vez de `update` por id: asi
    // marcar el aviso de otra persona no hace nada, en lugar de hacerlo.
    const { count } = await this.prisma.notificacion.updateMany({
      where: { id, usuario_id: usuario.id },
      data: { leida: true },
    })

    if (count === 0) throw ExcepcionNegocio.noEncontrado('Ese aviso no existe')

    return this.sinLeer(usuario)
  }

  async marcarTodas(usuario: UsuarioAutenticado): Promise<{ sin_leer: number }> {
    await this.prisma.notificacion.updateMany({
      where: { usuario_id: usuario.id, leida: false },
      data: { leida: true },
    })
    return { sin_leer: 0 }
  }
}
