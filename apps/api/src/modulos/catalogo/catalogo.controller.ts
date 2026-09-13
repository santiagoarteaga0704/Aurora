import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import {
  actualizarProductoSchema,
  actualizarVarianteSchema,
  busquedaCatalogoSchema,
  crearProductoSchema,
  crearVarianteSchema,
  escalasPrecioSchema,
  imagenSchema,
  PERMISOS,
} from '@aurora/contratos'
import type {
  DatosActualizarProducto,
  DatosActualizarVariante,
  DatosBusquedaCatalogo,
  DatosCrearProducto,
  DatosCrearVariante,
  DatosEscalasPrecio,
  DatosImagen,
} from '@aurora/contratos'
import { zod } from '../../nucleo/validacion/zod-validacion.pipe'
import { conMensaje, creado, pagina } from '../../nucleo/respuesta/sobre'
import { BitacoraService } from '../../nucleo/bitacora/bitacora.service'
import { Opcional, Publico, RequierePermiso, UsuarioSiHay } from '../../nucleo/autenticacion/decoradores'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'
import { CatalogoService } from './catalogo.service'

/**
 * Catalogo: lo que ve la clienta en la tienda y lo que administra el personal.
 *
 * La busqueda y la ficha son @Opcional a proposito: funcionan sin sesion, pero
 * si hay sesion de un mayorista aprobado devuelven sus precios. Es el mismo
 * endpoint para las dos audiencias, y el servidor decide que precio corresponde.
 */
@ApiTags('catalogo')
@Controller('api/catalogo')
export class CatalogoController {
  constructor(private readonly catalogo: CatalogoService) {}

  // --- Maestros (los necesita el menu y los filtros de la tienda) -----------

  @Get('categorias')
  @Publico()
  @ApiOperation({ summary: 'Categorias en arbol' })
  categorias() {
    return this.catalogo.categorias()
  }

  @Get('marcas')
  @Publico()
  @ApiOperation({ summary: 'Marcas activas' })
  marcas() {
    return this.catalogo.marcas()
  }

  @Get('tallas')
  @Publico()
  @ApiOperation({ summary: 'Tallas disponibles' })
  tallas() {
    return this.catalogo.tallas()
  }

  @Get('colores')
  @Publico()
  @ApiOperation({ summary: 'Colores disponibles' })
  colores() {
    return this.catalogo.colores()
  }

  @Get('guia-tallas/:categoriaId')
  @Publico()
  @ApiOperation({ summary: 'Medidas que cubre cada talla en una categoria' })
  guiaDeTallas(@Param('categoriaId', ParseIntPipe) categoriaId: number) {
    return this.catalogo.guiaDeTallas(categoriaId)
  }

  // --- Busqueda y ficha -----------------------------------------------------

  @Get('productos')
  @Opcional()
  @ApiOperation({ summary: 'Busqueda del catalogo con filtros combinables' })
  async buscar(
    @Query(zod(busquedaCatalogoSchema)) filtros: DatosBusquedaCatalogo,
    @UsuarioSiHay() usuario: UsuarioAutenticado | null
  ) {
    const { items, total } = await this.catalogo.buscar(filtros, usuario)
    return pagina(items, total, filtros)
  }

  @Get('productos/:slug')
  @Opcional()
  @ApiOperation({ summary: 'Ficha de un producto con sus variantes y escalas' })
  ficha(@Param('slug') slug: string, @UsuarioSiHay() usuario: UsuarioAutenticado | null) {
    return this.catalogo.ficha(slug, usuario)
  }

  // --- Administracion del catalogo ------------------------------------------

  @Post('productos')
  @RequierePermiso(PERMISOS.PRODUCTO_CREAR)
  @ApiOperation({ summary: 'Alta de un producto con sus variantes' })
  async crear(@Body(zod(crearProductoSchema)) datos: DatosCrearProducto, @Req() req: Request) {
    const producto = await this.catalogo.crearProducto(datos, BitacoraService.contextoDe(req))
    return creado(producto, 'Producto creado')
  }

  @Put('productos/:id')
  @RequierePermiso(PERMISOS.PRODUCTO_EDITAR)
  @ApiOperation({ summary: 'Edicion de un producto' })
  async actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body(zod(actualizarProductoSchema)) datos: DatosActualizarProducto,
    @Req() req: Request
  ) {
    const producto = await this.catalogo.actualizarProducto(
      id,
      datos,
      BitacoraService.contextoDe(req)
    )
    return conMensaje(producto, 'Producto actualizado')
  }

  @Delete('productos/:id')
  @RequierePermiso(PERMISOS.PRODUCTO_ELIMINAR)
  @ApiOperation({ summary: 'Baja logica de un producto y sus variantes' })
  async darDeBaja(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    await this.catalogo.darDeBaja(id, BitacoraService.contextoDe(req))
    return conMensaje(null, 'Producto dado de baja')
  }

  @Post('productos/:id/variantes')
  @RequierePermiso(PERMISOS.PRODUCTO_EDITAR)
  @ApiOperation({ summary: 'Agrega una variante (talla y color) a un producto' })
  async agregarVariante(
    @Param('id', ParseIntPipe) id: number,
    @Body(zod(crearVarianteSchema)) datos: DatosCrearVariante,
    @Req() req: Request
  ) {
    const producto = await this.catalogo.agregarVariante(id, datos, BitacoraService.contextoDe(req))
    return creado(producto, 'Variante agregada')
  }

  @Put('variantes/:id')
  @RequierePermiso(PERMISOS.PRODUCTO_EDITAR)
  @ApiOperation({ summary: 'Edicion de una variante' })
  async actualizarVariante(
    @Param('id', ParseIntPipe) id: number,
    @Body(zod(actualizarVarianteSchema)) datos: DatosActualizarVariante,
    @Req() req: Request
  ) {
    const producto = await this.catalogo.actualizarVariante(
      id,
      datos,
      BitacoraService.contextoDe(req)
    )
    return conMensaje(producto, 'Variante actualizada')
  }

  @Put('variantes/:id/escalas')
  @RequierePermiso(PERMISOS.PRODUCTO_EDITAR)
  @ApiOperation({ summary: 'Define las escalas de precio por volumen de una variante' })
  async definirEscalas(
    @Param('id', ParseIntPipe) id: number,
    @Body(zod(escalasPrecioSchema)) datos: DatosEscalasPrecio,
    @Req() req: Request
  ) {
    const escalas = await this.catalogo.definirEscalas(id, datos, BitacoraService.contextoDe(req))
    return conMensaje(escalas, 'Escalas actualizadas')
  }

  @Post('productos/:id/imagenes')
  @RequierePermiso(PERMISOS.PRODUCTO_EDITAR)
  @ApiOperation({ summary: 'Agrega una imagen al producto' })
  async agregarImagen(
    @Param('id', ParseIntPipe) id: number,
    @Body(zod(imagenSchema)) datos: DatosImagen,
    @Req() req: Request
  ) {
    const producto = await this.catalogo.agregarImagen(id, datos, BitacoraService.contextoDe(req))
    return creado(producto, 'Imagen agregada')
  }

  @Delete('imagenes/:id')
  @RequierePermiso(PERMISOS.PRODUCTO_EDITAR)
  @ApiOperation({ summary: 'Quita una imagen del producto' })
  async quitarImagen(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    await this.catalogo.quitarImagen(id, BitacoraService.contextoDe(req))
    return conMensaje(null, 'Imagen quitada')
  }
}
