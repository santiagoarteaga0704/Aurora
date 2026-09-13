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

  /**
   * El mensaje que se le muestra a una persona.
   *
   * `HttpException.message` no sirve para esto: cuando la respuesta es un
   * objeto —que es siempre aqui, porque lleva el detalle por campo— Nest deja
   * en `message` el nombre de la clase. Un registro de sincronizacion que dice
   * "Excepcion Negocio" en vez de "no alcanza el stock disponible" no le
   * explica nada a quien esta en el mostrador tratando de entender que venta se
   * perdio.
   */
  get mensaje(): string {
    const cuerpo = this.getResponse()
    if (typeof cuerpo === 'string') return cuerpo
    const m = (cuerpo as { mensaje?: unknown })?.mensaje
    return typeof m === 'string' ? m : this.message
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
