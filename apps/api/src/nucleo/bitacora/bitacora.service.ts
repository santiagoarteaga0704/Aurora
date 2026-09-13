import { Injectable, Logger } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import type { Request } from 'express'
import { PrismaService } from '../prisma/prisma.service'

/** Datos de la peticion que acompanian a todo registro de auditoria. */
export interface ContextoPeticion {
  usuarioId: number | null
  ip: string | null
  userAgent: string | null
}

export interface EntradaBitacora {
  accion: string
  modulo: string
  entidad?: string
  entidadId?: number | string | null
  descripcion?: string
  datosPrevios?: Record<string, unknown> | null
  datosNuevos?: Record<string, unknown> | null
}

/**
 * Bitacora de auditoria: quien hizo que, sobre que entidad y con que valores
 * antes y despues.
 *
 * Dos reglas que se mantienen del diseno original:
 *
 *  1. Nunca interrumpe la operacion de negocio. Si el registro falla, se anota
 *     en el log del servidor y la venta (o lo que sea) sigue su curso. Perder
 *     una linea de auditoria es malo; perder una venta es peor.
 *  2. Nunca guarda contrasenias ni tokens, aunque vengan dentro del objeto que
 *     se le pasa.
 */
@Injectable()
export class BitacoraService {
  private static readonly CAMPOS_OCULTOS = [
    'password',
    'password_actual',
    'password_nueva',
    'password_hash',
    'token',
    'refresh_token',
    'token_hash',
    'qr_payload',
  ]

  private readonly log = new Logger('Bitacora')

  constructor(private readonly prisma: PrismaService) {}

  async registrar(ctx: ContextoPeticion, entrada: EntradaBitacora): Promise<void> {
    try {
      await this.prisma.bitacora.create({
        data: {
          usuario_id: ctx.usuarioId,
          accion: entrada.accion,
          modulo: entrada.modulo,
          entidad: entrada.entidad ?? null,
          entidad_id: entrada.entidadId == null ? null : String(entrada.entidadId),
          descripcion: entrada.descripcion?.slice(0, 255) ?? null,
          datos_previos: this.enmascarar(entrada.datosPrevios),
          datos_nuevos: this.enmascarar(entrada.datosNuevos),
          ip: ctx.ip,
          user_agent: ctx.userAgent?.slice(0, 255) ?? null,
        },
      })
    } catch (e) {
      this.log.error(`No se pudo registrar "${entrada.accion}": ${(e as Error).message}`)
    }
  }

  /** Arma el contexto a partir de la peticion de Express. */
  static contextoDe(req: Request): ContextoPeticion {
    return {
      usuarioId: req.usuario?.id ?? null,
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    }
  }

  private enmascarar(
    datos: Record<string, unknown> | null | undefined
  ): Prisma.InputJsonValue | undefined {
    if (!datos) return undefined
    const copia: Record<string, unknown> = { ...datos }
    for (const campo of BitacoraService.CAMPOS_OCULTOS) {
      if (campo in copia) copia[campo] = '***'
    }
    return copia as Prisma.InputJsonValue
  }
}
