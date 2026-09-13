import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { medidasSchema, registrarPruebaSchema } from '@aurora/contratos'
import type { DatosMedidas, DatosRegistrarPrueba } from '@aurora/contratos'
import { zod } from '../../nucleo/validacion/zod-validacion.pipe'
import { conMensaje } from '../../nucleo/respuesta/sobre'
import {
  CarritoSesion,
  Opcional,
  Publico,
  UsuarioActual,
  UsuarioSiHay,
} from '../../nucleo/autenticacion/decoradores'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'
import { MedidasService } from './medidas.service'
import { TallasService } from './tallas.service'
import { PruebasService } from './pruebas.service'
import { RaService } from './ra.service'

/**
 * Probador virtual.
 *
 * No lleva @RequierePermiso: es la cuenta de la clienta administrando lo suyo.
 * Ningun endpoint recibe un id de cliente —se resuelve siempre de la sesion—,
 * asi que no hay forma de pedir las medidas de otra persona.
 */
@ApiTags('probador')
@Controller('api/probador')
export class ProbadorController {
  constructor(
    private readonly medidas: MedidasService,
    private readonly tallas: TallasService,
    private readonly pruebas: PruebasService,
    private readonly ra: RaService
  ) {}

  @Get('mis-medidas')
  @ApiOperation({ summary: 'Medidas guardadas del cliente' })
  mias(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.medidas.mias(usuario)
  }

  @Put('mis-medidas')
  @ApiOperation({ summary: 'Guardar o actualizar las medidas' })
  async guardar(
    @Body(zod(medidasSchema)) datos: DatosMedidas,
    @UsuarioActual() usuario: UsuarioAutenticado
  ) {
    const guardadas = await this.medidas.guardar(datos, usuario)
    return conMensaje(
      guardadas,
      guardadas.estimadas.length > 0
        ? 'Medidas guardadas. Algunas se estimaron a partir de tu altura y peso'
        : 'Medidas guardadas'
    )
  }

  @Get('mi-avatar')
  @ApiOperation({ summary: 'Proporciones del avatar del cliente' })
  avatar(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.medidas.avatar(usuario)
  }

  /**
   * Que talla le corresponde en una categoria.
   *
   * `producto_id` es opcional y cambia la respuesta: con el, se informa ademas
   * si esa talla esta disponible en ese producto. Recomendar una M que no hay
   * manda a la clienta a buscar algo que no va a encontrar.
   */
  @Get('mi-talla/:categoriaId')
  @ApiOperation({ summary: 'Talla recomendada segun las medidas del cliente' })
  async miTalla(
    @Param('categoriaId', ParseIntPipe) categoriaId: number,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Query('producto_id') productoId?: string
  ) {
    const clienteId = await this.medidas.exigirCliente(usuario)
    const producto = productoId && /^\d+$/.test(productoId) ? Number(productoId) : undefined
    return this.tallas.recomendar(clienteId, categoriaId, producto)
  }

  /**
   * Lo que hace falta para dibujar la prenda sobre la camara.
   *
   * Publico, igual que la ficha de producto: probarse algo es lo que pasa antes
   * de decidir registrarse, no despues.
   */
  @Get('prendas/:varianteId')
  @Publico()
  @ApiOperation({ summary: 'Anclaje y textura de una prenda para realidad aumentada' })
  prenda(@Param('varianteId', ParseIntPipe) varianteId: number) {
    return this.ra.prenda(varianteId)
  }

  /**
   * Registra una prueba. Abierto a visitantes sin cuenta a proposito: probarse
   * algo es lo que pasa antes de decidir registrarse.
   */
  @Post('pruebas')
  @Opcional()
  @HttpCode(201)
  @ApiOperation({ summary: 'Registrar una prueba virtual' })
  registrar(
    @Body(zod(registrarPruebaSchema)) datos: DatosRegistrarPrueba,
    @UsuarioSiHay() usuario: UsuarioAutenticado | null,
    @CarritoSesion() sesion: string | null
  ) {
    return this.pruebas.registrar(datos, usuario, sesion)
  }
}
