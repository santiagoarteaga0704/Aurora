import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * Errores de negocio con el codigo HTTP correcto y, cuando corresponde, el
 * detalle por campo que el formulario necesita para pintar el mensaje al lado
 * del input.
 *
 * Reemplaza a HttpException.php del backend anterior, con los mismos
 * constructores con nombre para que los controladores se lean igual.
 */
export class ExcepcionNegocio extends HttpException {
  constructor(
    estado: HttpStatus,
    mensaje: string,
    readonly errores?: Record<string, string>
  ) {
    super({ mensaje, errores }, estado)
  }

  static validacion(errores: Record<string, string>, mensaje = 'Revisa los datos enviados') {
    return new ExcepcionNegocio(HttpStatus.UNPROCESSABLE_ENTITY, mensaje, errores)
  }

  static noAutenticado(mensaje = 'No hay una sesion valida') {
    return new ExcepcionNegocio(HttpStatus.UNAUTHORIZED, mensaje)
  }

  static sinPermiso(mensaje = 'No tienes permiso para esta accion') {
    return new ExcepcionNegocio(HttpStatus.FORBIDDEN, mensaje)
  }

  static noEncontrado(mensaje = 'No se encontro el recurso') {
    return new ExcepcionNegocio(HttpStatus.NOT_FOUND, mensaje)
  }

  static conflicto(mensaje: string, errores?: Record<string, string>) {
    return new ExcepcionNegocio(HttpStatus.CONFLICT, mensaje, errores)
  }

  static demasiadasPeticiones(mensaje: string) {
    return new ExcepcionNegocio(HttpStatus.TOO_MANY_REQUESTS, mensaje)
  }
}
