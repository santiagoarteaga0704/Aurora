import {
  Body,
  Controller,
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
  actualizarProveedorSchema,
  consultaComprasSchema,
  crearCompraSchema,
  PERMISOS,
  proveedorSchema,
  recibirCompraSchema,
} from '@aurora/contratos'
import type {
  DatosActualizarProveedor,
  DatosConsultaCompras,
  DatosCrearCompra,
  DatosProveedor,
  DatosRecibirCompra,
} from '@aurora/contratos'
import { z } from 'zod'
import { zod } from '../../nucleo/validacion/zod-validacion.pipe'
import { conMensaje, creado, pagina } from '../../nucleo/respuesta/sobre'
import { BitacoraService } from '../../nucleo/bitacora/bitacora.service'
import { RequierePermiso, UsuarioActual } from '../../nucleo/autenticacion/decoradores'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'
import { ComprasService } from './compras.service'

const anularSchema = z.object({
  motivo: z.string().trim().min(3, 'Indica por que se anula').max(255),
})

function aBigInt(valor: string): bigint {
  if (!/^\d+$/.test(valor)) {
    throw ExcepcionNegocio.validacion({ id: 'El identificador no es valido' })
  }
  return BigInt(valor)
}

@ApiTags('proveedores')
@Controller('api/proveedores')
export class ProveedoresController {
  constructor(private readonly compras: ComprasService) {}

  @Get()
  @RequierePermiso(PERMISOS.COMPRA_VER)
  @ApiOperation({ summary: 'Proveedores activos' })
  listar(@Query('todos') todos?: string) {
    return this.compras.proveedores(todos !== 'true')
  }

  @Post()
  @RequierePermiso(PERMISOS.COMPRA_GESTIONAR)
  @ApiOperation({ summary: 'Alta de proveedor' })
  async crear(@Body(zod(proveedorSchema)) datos: DatosProveedor, @Req() req: Request) {
    return creado(
      await this.compras.crearProveedor(datos, BitacoraService.contextoDe(req)),
      'Proveedor creado'
    )
  }

  @Put(':id')
  @RequierePermiso(PERMISOS.COMPRA_GESTIONAR)
  @ApiOperation({ summary: 'Edicion de proveedor' })
  async actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body(zod(actualizarProveedorSchema)) datos: DatosActualizarProveedor,
    @Req() req: Request
  ) {
    return conMensaje(
      await this.compras.actualizarProveedor(id, datos, BitacoraService.contextoDe(req)),
      'Proveedor actualizado'
    )
  }
}

@ApiTags('compras')
@Controller('api/compras')
export class ComprasController {
  constructor(private readonly compras: ComprasService) {}

  @Get()
  @RequierePermiso(PERMISOS.COMPRA_VER)
  @ApiOperation({ summary: 'Compras de la sucursal' })
  async listar(
    @Query(zod(consultaComprasSchema)) filtros: DatosConsultaCompras,
    @UsuarioActual() usuario: UsuarioAutenticado
  ) {
    const { items, total } = await this.compras.listar(filtros, usuario)
    return pagina(items, total, filtros)
  }

  @Get(':id')
  @RequierePermiso(PERMISOS.COMPRA_VER)
  @ApiOperation({ summary: 'Detalle de una compra' })
  detalle(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.compras.detalle(aBigInt(id), usuario)
  }

  @Post()
  @RequierePermiso(PERMISOS.COMPRA_GESTIONAR)
  @ApiOperation({ summary: 'Registra una compra en borrador' })
  async crear(
    @Body(zod(crearCompraSchema)) datos: DatosCrearCompra,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const compra = await this.compras.crear(datos, usuario, BitacoraService.contextoDe(req))
    return creado(compra, `Compra ${compra.numero} registrada`)
  }

  @Post(':id/confirmar')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.COMPRA_GESTIONAR)
  @ApiOperation({ summary: 'Confirma la compra ante el proveedor' })
  async confirmar(
    @Param('id') id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const compra = await this.compras.confirmar(
      aBigInt(id),
      usuario,
      BitacoraService.contextoDe(req)
    )
    return conMensaje(compra, `Compra ${compra.numero} confirmada`)
  }

  @Post(':id/recibir')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.COMPRA_GESTIONAR)
  @ApiOperation({ summary: 'Recepcion: sube el stock del almacen' })
  async recibir(
    @Param('id') id: string,
    @Body(zod(recibirCompraSchema)) datos: DatosRecibirCompra,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const compra = await this.compras.recibir(
      aBigInt(id),
      datos,
      usuario,
      BitacoraService.contextoDe(req)
    )
    return conMensaje(compra, `Compra ${compra.numero} recibida`)
  }

  @Post(':id/anular')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.COMPRA_GESTIONAR)
  @ApiOperation({ summary: 'Anula una compra todavia no recibida' })
  async anular(
    @Param('id') id: string,
    @Body(zod(anularSchema)) datos: { motivo: string },
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() req: Request
  ) {
    const compra = await this.compras.anular(
      aBigInt(id),
      datos.motivo,
      usuario,
      BitacoraService.contextoDe(req)
    )
    return conMensaje(compra, `Compra ${compra.numero} anulada`)
  }
}
