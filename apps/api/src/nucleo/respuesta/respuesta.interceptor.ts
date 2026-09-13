import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import type { Response } from 'express'
import { map, Observable } from 'rxjs'
import { esSobre } from './sobre'

/**
 * Envuelve lo que devuelve cada controlador en la forma unica de respuesta:
 *
 *   { ok: true, mensaje?, datos, meta? }
 *
 * El controlador devuelve los datos pelados y no se ocupa del sobre; si
 * necesita mensaje, paginacion o un 201, usa los ayudantes de sobre.ts.
 */
@Injectable()
export class RespuestaInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = ctx.switchToHttp().getResponse<Response>()

    return next.handle().pipe(
      map((valor) => {
        if (esSobre(valor)) {
          if (valor.estado) res.status(valor.estado)
          return {
            ok: true,
            ...(valor.mensaje ? { mensaje: valor.mensaje } : {}),
            datos: valor.datos,
            ...(valor.meta ? { meta: valor.meta } : {}),
          }
        }
        return { ok: true, datos: valor ?? null }
      })
    )
  }
}
