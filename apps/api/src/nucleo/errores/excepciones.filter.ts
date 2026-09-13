import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Response } from 'express'
import type { RespuestaError } from '@aurora/contratos'

/**
 * Traduce cualquier error a la forma de error unica de la API:
 *
 *   { ok: false, mensaje: string, errores?: { campo: mensaje } }
 *
 * Asi el PWA y la app movil tienen un solo camino para mostrar errores, en vez
 * de adivinar la forma segun el endpoint.
 */
@Catch()
export class ExcepcionesFilter implements ExceptionFilter {
  private readonly log = new Logger('Error')

  catch(error: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>()
    const { estado, cuerpo } = this.traducir(error)

    if (estado >= 500) {
      this.log.error(error instanceof Error ? error.stack : String(error))
    }

    res.status(estado).json(cuerpo)
  }

  private traducir(error: unknown): { estado: number; cuerpo: RespuestaError } {
    if (error instanceof HttpException) {
      const respuesta = error.getResponse()

      // ExcepcionNegocio ya manda { mensaje, errores }
      if (typeof respuesta === 'object' && respuesta !== null && 'mensaje' in respuesta) {
        const r = respuesta as { mensaje: string; errores?: Record<string, string> }
        return {
          estado: error.getStatus(),
          cuerpo: { ok: false, mensaje: r.mensaje, ...(r.errores ? { errores: r.errores } : {}) },
        }
      }

      // Excepciones propias de Nest (404 de ruta, 429 del limitador, etc.)
      const mensaje =
        typeof respuesta === 'string'
          ? respuesta
          : ((respuesta as { message?: string | string[] }).message ?? error.message)

      return {
        estado: error.getStatus(),
        cuerpo: {
          ok: false,
          mensaje: Array.isArray(mensaje) ? mensaje.join('. ') : mensaje,
        },
      }
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return this.traducirPrisma(error)
    }

    return {
      estado: HttpStatus.INTERNAL_SERVER_ERROR,
      cuerpo: { ok: false, mensaje: 'Error interno del servidor' },
    }
  }

  /**
   * Los errores de Postgres no deben llegar crudos al cliente: filtran nombres
   * de tablas y columnas. Se traducen los que tienen una lectura de negocio.
   */
  private traducirPrisma(error: Prisma.PrismaClientKnownRequestError): {
    estado: number
    cuerpo: RespuestaError
  } {
    const campos = (error.meta?.target as string[] | undefined) ?? []

    switch (error.code) {
      case 'P2002': {
        const campo = campos[campos.length - 1] ?? 'registro'
        return {
          estado: HttpStatus.CONFLICT,
          cuerpo: {
            ok: false,
            mensaje: 'Ese valor ya esta registrado',
            errores: { [campo]: 'Ya existe un registro con este valor' },
          },
        }
      }
      case 'P2003':
      case 'P2025':
        return {
          estado: HttpStatus.UNPROCESSABLE_ENTITY,
          cuerpo: { ok: false, mensaje: 'El registro referenciado no existe' },
        }
      case 'P2000':
        return {
          estado: HttpStatus.UNPROCESSABLE_ENTITY,
          cuerpo: { ok: false, mensaje: 'Un valor enviado excede el largo permitido' },
        }
      default:
        this.log.error(`Prisma ${error.code}: ${error.message}`)
        return {
          estado: HttpStatus.INTERNAL_SERVER_ERROR,
          cuerpo: { ok: false, mensaje: 'Error al acceder a los datos' },
        }
    }
  }
}
