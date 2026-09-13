import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common'
import { ZodError, ZodSchema } from 'zod'
import { ExcepcionNegocio } from '../errores/excepcion-negocio'

/**
 * Valida el cuerpo (o la query) contra un esquema de @aurora/contratos y
 * devuelve el valor ya tipado y normalizado.
 *
 * Sustituye al Validator.php hecho a mano, con dos ventajas: el esquema es el
 * mismo que usa el front para validar el formulario antes de enviar, y el tipo
 * de TypeScript sale del esquema, asi que el controlador no puede leer un campo
 * que no se valido.
 *
 * Los errores se devuelven como { campo: mensaje }, igual que antes, porque asi
 * los pintan los formularios.
 */
@Injectable()
export class ZodValidacionPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly esquema: ZodSchema<T>) {}

  transform(valor: unknown, _meta: ArgumentMetadata): T {
    try {
      return this.esquema.parse(valor)
    } catch (e) {
      if (e instanceof ZodError) {
        const errores: Record<string, string> = {}
        for (const problema of e.errors) {
          const campo = problema.path.join('.') || 'general'
          // si un campo acumula varios problemas, gana el primero: es el que el
          // usuario tiene que corregir antes de que los demas tengan sentido
          errores[campo] ??= problema.message
        }
        throw ExcepcionNegocio.validacion(errores)
      }
      throw e
    }
  }
}

/** Azucar para leer como `@Body(zod(loginSchema))`. */
export const zod = <T>(esquema: ZodSchema<T>) => new ZodValidacionPipe(esquema)
