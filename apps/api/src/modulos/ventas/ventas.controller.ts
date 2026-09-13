import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import {
  agregarAlCarritoSchema,
  cambiarCantidadSchema,
  cambiarEstadoSchema,
  cancelarPedidoSchema,
  consultaPedidosSchema,
  crearPedidoSchema,
  PERMISOS,
  registrarPagoSchema,
  resolverPagoSchema,
} from '@aurora/contratos'
import type {
  DatosAgregarAlCarrito,
  DatosCambiarEstado,
  DatosConsultaPedidos,
  DatosCrearPedido,
  DatosRegistrarPago,
  DatosResolverPago,
} from '@aurora/contratos'
import { zod } from '../../nucleo/validacion/zod-validacion.pipe'
import { conMensaje, creado, pagina } from '../../nucleo/respuesta/sobre'
import { BitacoraService } from '../../nucleo/bitacora/bitacora.service'
import {
  CarritoSesion,
  ClaveIdempotencia,
  Opcional,
  Publico,
  RequierePermiso,
  UsuarioActual,
  UsuarioSiHay,
} from '../../nucleo/autenticacion/decoradores'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'
import { CarritoService } from './carrito.service'
import { PedidosService } from './pedidos.service'
import { PagosService } from './pagos.service'

function aBigInt(valor: string): bigint {
  if (!/^\d+$/.test(valor)) {
    throw ExcepcionNegocio.validacion({ id: 'El identificador no es valido' })
  }
  return BigInt(valor)
}

/**
 * Carrito.
 *
 * Todos los endpoints son @Opcional: el carrito funciona sin sesion. El token
 * del carrito anonimo viaja en la cabecera X-Carrito y lo devuelve la respuesta,
 * para que el PWA lo guarde y lo siga usando.
 */
@ApiTags('carrito')
@Controller('api/carrito')
export class CarritoController {
  constructor(private readonly carrito: CarritoService) {}

  @Get()
  @Opcional()
  @ApiOperation({ summary: 'Carrito actual, creandolo si no existe' })
  ver(@UsuarioSiHay() usuario: UsuarioAutenticado | null, @CarritoSesion() token: string | null) {
    return this.carrito.ver(usuario, token)
  }

  @Post('items')
  @Opcional()
  @HttpCode(200)
  @ApiOperation({ summary: 'Agrega un articulo o suma a la cantidad que ya habia' })
  agregar(
    @Body(zod(agregarAlCarritoSchema)) datos: DatosAgregarAlCarrito,
    @UsuarioSiHay() usuario: UsuarioAutenticado | null,
    @CarritoSesion() token: string | null
  ) {
    return this.carrito.agregar(datos, usuario, token)
  }

  @Put('items/:varianteId')
  @Opcional()
  @ApiOperation({ summary: 'Fija la cantidad de un articulo; cero lo quita' })
  cambiarCantidad(
    @Param('varianteId', ParseIntPipe) varianteId: number,
    @Body(zod(cambiarCantidadSchema)) datos: { cantidad: number },
    @UsuarioSiHay() usuario: UsuarioAutenticado | null,
    @CarritoSesion() token: string | null
  ) {
    return this.carrito.cambiarCantidad(varianteId, datos.cantidad, usuario, token)
  }

  @Delete('items/:varianteId')
  @Opcional()
  @ApiOperation({ summary: 'Quita un articulo del carrito' })
  quitar(
    @Param('varianteId', ParseIntPipe) varianteId: number,
    @UsuarioSiHay() usuario: UsuarioAutenticado | null,
    @CarritoSesion() token: string | null
  ) {
    return this.carrito.quitar(varianteId, usuario, token)
  }

  @Delete()
  @Opcional()
  @ApiOperation({ summary: 'Vacia el carrito' })
  async vaciar(
    @UsuarioSiHay() usuario: UsuarioAutenticado | null,
    @CarritoSesion() token: string | null
  ) {
    return conMensaje(await this.carrito.vaciar(usuario, token), 'Carrito vaciado')
  }
}

@ApiTags('pedidos')
@Controller('api/pedidos')
export class PedidosController {
  constructor(
    private readonly pedidos: PedidosService,
    private readonly pagos: PagosService
  ) {}

  @Post()
  @ApiOperation({ summary: 'Registra un pedido: checkout online o venta de mostrador' })
  async crear(
    @Body(zod(crearPedidoSchema)) datos: DatosCrearPedido,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @CarritoSesion() carrito: string | null,
    @ClaveIdempotencia() clave: string | null,
    @Req() req: Request
  ) {
    const pedido = await this.pedidos.crear(
      datos,
      usuario,
      carrito,
      clave,
      BitacoraService.contextoDe(req)
    )
    return creado(pedido, `Pedido ${pedido.numero} registrado`)
  }

  @Get()
  @ApiOperation({ summary: 'Pedidos: los propios para un cliente, los de la sucursal para el personal' })
  async listar(
    @Query(zod(consultaPedidosSchema)) filtros: DatosConsultaPedidos,
    @UsuarioActual() usuario: UsuarioAutenticado
  ) {
    const { items, total } = await this.pedidos.listar(filtros, usuario)
    return pagina(items, total, filtros)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un pedido' })
  detalle(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.pedidos.detalle(aBigInt(id), usuario)
  }

  @Get(':id/historial')
  @ApiOperation({ summary: 'Linea de tiempo del pedido' })
  historial(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.pedidos.historial(aBigInt(id), usuario)
  }

  @Post(':id/estado')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.VENTA_DESPACHAR, PERMISOS.VENTA_VER)
  @ApiOperation({ summary: 'Avanza el pedido en su ciclo de vida' })
  async cambiarEstado(
    @Param('id') id: string,
    @Body(zod(cambiarEstadoSchema)) datos: DatosCambiarEstado,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const pedido = await this.pedidos.cambiarEstado(
      aBigInt(id),
      datos.estado,
      datos.comentario,
      usuario,
      BitacoraService.contextoDe(req)
    )
    return conMensaje(pedido, `Pedido ${pedido.numero}: ${pedido.estado}`)
  }

  /** Sin @RequierePermiso: el propio cliente puede cancelar lo suyo. */
  @Post(':id/cancelar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancela el pedido y devuelve el inventario' })
  async cancelar(
    @Param('id') id: string,
    @Body(zod(cancelarPedidoSchema)) datos: { motivo: string },
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const pedido = await this.pedidos.cancelar(
      aBigInt(id),
      datos.motivo,
      usuario,
      BitacoraService.contextoDe(req)
    )
    return conMensaje(pedido, `Pedido ${pedido.numero} cancelado`)
  }

  // --- Pagos del pedido -----------------------------------------------------

  @Get(':id/pagos')
  @ApiOperation({ summary: 'Pagos registrados en el pedido' })
  pagosDelPedido(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.pagos.delPedido(aBigInt(id), usuario)
  }

  @Post(':id/pagos')
  @ApiOperation({ summary: 'Registra un pago del pedido' })
  async registrarPago(
    @Param('id') id: string,
    @Body(zod(registrarPagoSchema)) datos: DatosRegistrarPago,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @ClaveIdempotencia() clave: string | null,
    @Req() req: Request
  ) {
    const pago = await this.pagos.registrar(
      aBigInt(id),
      datos,
      usuario,
      clave,
      BitacoraService.contextoDe(req)
    )
    return creado(
      pago,
      pago.estado === 'confirmado'
        ? 'Pago registrado y confirmado'
        : 'Pago registrado, queda pendiente de confirmacion'
    )
  }
}

@ApiTags('pagos')
@Controller('api/pagos')
export class PagosController {
  constructor(private readonly pagos: PagosService) {}

  @Get('metodos')
  @Publico()
  @ApiOperation({ summary: 'Metodos de pago disponibles, opcionalmente por canal' })
  metodos(@Query('canal') canal?: string) {
    return this.pagos.metodos(canal === 'online' || canal === 'tienda' ? canal : undefined)
  }

  @Get('pendientes')
  @RequierePermiso(PERMISOS.PAGO_CONFIRMAR)
  @ApiOperation({ summary: 'Pagos esperando confirmacion' })
  pendientes(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.pagos.pendientes(usuario)
  }

  @Post(':id/resolver')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.PAGO_CONFIRMAR)
  @ApiOperation({ summary: 'Confirma o rechaza un pago pendiente' })
  async resolver(
    @Param('id') id: string,
    @Body(zod(resolverPagoSchema)) datos: DatosResolverPago,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const pago = await this.pagos.resolver(
      aBigInt(id),
      datos,
      usuario,
      BitacoraService.contextoDe(req)
    )
    return conMensaje(pago, datos.aprobado ? 'Pago confirmado' : 'Pago rechazado')
  }
}
