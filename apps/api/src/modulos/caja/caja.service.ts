import { Injectable } from '@nestjs/common'
import type {
  Caja,
  DatosAbrirCaja,
  DatosCerrarCaja,
  DatosConsultaCajas,
  DatosMovimientoCaja,
} from '@aurora/contratos'
import { salto } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import { PermisosService } from '../../nucleo/autenticacion/permisos.service'
import { PreciosService } from '../catalogo/precios.service'
import type { Tx } from '../inventario/stock.service'
import { aNumero } from '../../nucleo/util/decimal'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'

/**
 * Caja: el turno de cobro de una vendedora.
 *
 * Los cobros en efectivo de mostrador entran solos como movimiento de caja
 * cuando se confirma el pago. Eso es lo que hace que el arqueo signifique algo:
 * si la cajera tuviera que anotar cada venta a mano, la diferencia al cierre
 * mediria su memoria y no el dinero.
 */
@Injectable()
export class CajaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly bitacora: BitacoraService
  ) {}

  // ==========================================================================
  // Apertura
  // ==========================================================================

  async abrir(
    datos: DatosAbrirCaja,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Caja> {
    this.verificarSucursal(usuario, datos.sucursal_id)

    // Una persona no puede tener dos cajas abiertas: los cobros no sabrian a
    // cual entrar, y el arqueo dejaria de cerrar.
    const yaAbierta = await this.prisma.caja.findFirst({
      where: { usuario_id: usuario.id, estado: 'abierta' },
      select: { id: true, sucursal: { select: { nombre: true } } },
    })
    if (yaAbierta) {
      throw ExcepcionNegocio.conflicto(
        `Ya tienes una caja abierta en ${yaAbierta.sucursal.nombre}. Cierrala antes de abrir otra.`
      )
    }

    const sucursal = await this.prisma.sucursal.findUnique({
      where: { id: datos.sucursal_id },
      select: { activo: true },
    })
    if (!sucursal?.activo) {
      throw ExcepcionNegocio.validacion({ sucursal_id: 'Esa sucursal no existe o esta inactiva' })
    }

    const caja = await this.prisma.caja.create({
      data: {
        sucursal_id: datos.sucursal_id,
        usuario_id: usuario.id,
        monto_apertura: datos.monto_apertura,
        estado: 'abierta',
      },
      select: { id: true },
    })

    await this.bitacora.registrar(ctx, {
      accion: 'abrir',
      modulo: 'caja',
      entidad: 'caja',
      entidadId: caja.id.toString(),
      descripcion: `Caja abierta con ${datos.monto_apertura} BOB`,
    })

    return this.detalle(caja.id, usuario)
  }

  // ==========================================================================
  // Movimientos
  // ==========================================================================

  async registrarMovimiento(
    cajaId: bigint,
    datos: DatosMovimientoCaja,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Caja> {
    const caja = await this.buscarAbierta(cajaId, usuario)

    if (datos.tipo === 'egreso') {
      // Sacar mas de lo que hay dejaria la caja en negativo, que no es un estado
      // posible de un cajon con billetes.
      const saldo = await this.saldo(cajaId, aNumero(caja.monto_apertura))
      if (datos.monto > saldo) {
        throw ExcepcionNegocio.validacion({
          monto: `En la caja hay ${saldo} BOB y se intenta sacar ${datos.monto}`,
        })
      }
    }

    await this.prisma.movimiento_caja.create({
      data: {
        caja_id: cajaId,
        tipo: datos.tipo,
        monto: datos.monto,
        concepto: datos.concepto,
      },
    })

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'caja',
      entidad: 'movimiento_caja',
      entidadId: cajaId.toString(),
      descripcion: `${datos.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} de ${datos.monto} BOB: ${datos.concepto}`,
    })

    return this.detalle(cajaId, usuario)
  }

  /**
   * Registra en la caja abierta el cobro en efectivo de una venta de mostrador.
   *
   * Lo llama el modulo de pagos dentro de su propia transaccion. Si no hay caja
   * abierta no falla: el pago es valido igual y la venta no se puede caer porque
   * alguien olvido abrir su turno. Queda en la bitacora para que se note.
   */
  async registrarCobro(
    tx: Tx,
    datos: {
      sucursalId: number
      usuarioId: number
      monto: number
      concepto: string
      pagoId: bigint
    }
  ): Promise<boolean> {
    const caja = await tx.caja.findFirst({
      where: { usuario_id: datos.usuarioId, sucursal_id: datos.sucursalId, estado: 'abierta' },
      select: { id: true },
    })
    if (!caja) return false

    await tx.movimiento_caja.create({
      data: {
        caja_id: caja.id,
        tipo: 'ingreso',
        monto: datos.monto,
        concepto: datos.concepto.slice(0, 150),
        pago_id: datos.pagoId,
      },
    })
    return true
  }

  // ==========================================================================
  // Cierre
  // ==========================================================================

  /**
   * Arqueo y cierre.
   *
   * El monto esperado sale de sumar los movimientos, no de un acumulado que se
   * fuera actualizando: un contador paralelo se desfasa en cuanto algo se
   * registra por otro camino. La diferencia se guarda aunque sea cero.
   */
  async cerrar(
    cajaId: bigint,
    datos: DatosCerrarCaja,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<Caja> {
    const caja = await this.buscarAbierta(cajaId, usuario)

    const esperado = await this.saldo(cajaId, aNumero(caja.monto_apertura))
    const diferencia = PreciosService.centavos(datos.monto_contado - esperado)

    await this.prisma.caja.update({
      where: { id: cajaId },
      data: {
        estado: 'cerrada',
        monto_cierre: datos.monto_contado,
        monto_esperado: esperado,
        diferencia,
        cerrada_en: new Date(),
      },
    })

    await this.bitacora.registrar(ctx, {
      accion: 'cerrar',
      modulo: 'caja',
      entidad: 'caja',
      entidadId: cajaId.toString(),
      descripcion:
        diferencia === 0
          ? `Caja cerrada cuadrada en ${esperado} BOB`
          : `Caja cerrada con ${diferencia > 0 ? 'sobrante' : 'faltante'} de ${Math.abs(diferencia)} BOB`,
      datosNuevos: {
        esperado,
        contado: datos.monto_contado,
        diferencia,
        observacion: datos.observacion ?? null,
      },
    })

    return this.detalle(cajaId, usuario)
  }

  // ==========================================================================
  // Consultas
  // ==========================================================================

  /** La caja abierta del usuario, si tiene alguna. */
  async miCaja(usuario: UsuarioAutenticado): Promise<Caja | null> {
    const caja = await this.prisma.caja.findFirst({
      where: { usuario_id: usuario.id, estado: 'abierta' },
      select: { id: true },
    })
    return caja ? this.detalle(caja.id, usuario) : null
  }

  async listar(filtros: DatosConsultaCajas, usuario: UsuarioAutenticado) {
    const propia = this.permisos.restringeSucursal(usuario)

    const where = {
      sucursal_id: propia ?? filtros.sucursal_id,
      estado: filtros.estado,
      usuario_id: filtros.usuario_id,
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.caja.count({ where }),
      this.prisma.caja.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: salto(filtros),
        take: filtros.por_pagina,
        include: {
          sucursal: { select: { nombre: true } },
          usuario: { select: { nombre: true, apellido: true } },
          movimiento_caja: { select: { tipo: true, monto: true } },
        },
      }),
    ])

    return {
      total,
      items: filas.map((c) => {
        const { ingresos, egresos } = this.sumar(c.movimiento_caja)
        return {
          id: c.id.toString(),
          sucursal: c.sucursal.nombre,
          usuario: `${c.usuario.nombre} ${c.usuario.apellido}`,
          estado: c.estado,
          monto_apertura: aNumero(c.monto_apertura),
          ingresos,
          egresos,
          monto_cierre: c.monto_cierre === null ? null : aNumero(c.monto_cierre),
          diferencia: c.diferencia === null ? null : aNumero(c.diferencia),
          abierta_en: c.abierta_en.toISOString(),
          cerrada_en: c.cerrada_en?.toISOString() ?? null,
        }
      }),
    }
  }

  async detalle(cajaId: bigint, usuario: UsuarioAutenticado): Promise<Caja> {
    const c = await this.prisma.caja.findUnique({
      where: { id: cajaId },
      include: {
        sucursal: { select: { nombre: true } },
        usuario: { select: { nombre: true, apellido: true } },
        movimiento_caja: { orderBy: { id: 'asc' } },
      },
    })
    if (!c) throw ExcepcionNegocio.noEncontrado('Esa caja no existe')

    this.verificarSucursal(usuario, c.sucursal_id)

    const { ingresos, egresos } = this.sumar(c.movimiento_caja)
    const apertura = aNumero(c.monto_apertura)

    return {
      id: c.id.toString(),
      sucursal: c.sucursal.nombre,
      sucursal_id: c.sucursal_id,
      usuario: `${c.usuario.nombre} ${c.usuario.apellido}`,
      estado: c.estado,
      monto_apertura: apertura,
      ingresos,
      egresos,
      monto_esperado:
        c.monto_esperado === null
          ? PreciosService.centavos(apertura + ingresos - egresos)
          : aNumero(c.monto_esperado),
      monto_cierre: c.monto_cierre === null ? null : aNumero(c.monto_cierre),
      diferencia: c.diferencia === null ? null : aNumero(c.diferencia),
      abierta_en: c.abierta_en.toISOString(),
      cerrada_en: c.cerrada_en?.toISOString() ?? null,
      movimientos: c.movimiento_caja.map((m) => ({
        id: m.id.toString(),
        tipo: m.tipo,
        monto: aNumero(m.monto),
        concepto: m.concepto,
        pago_id: m.pago_id?.toString() ?? null,
        creado_en: m.creado_en.toISOString(),
      })),
    }
  }

  // ==========================================================================
  // Internos
  // ==========================================================================

  private sumar(movimientos: readonly { tipo: string; monto: unknown }[]) {
    let ingresos = 0
    let egresos = 0
    for (const m of movimientos) {
      if (m.tipo === 'ingreso') ingresos += aNumero(m.monto as never)
      else egresos += aNumero(m.monto as never)
    }
    return {
      ingresos: PreciosService.centavos(ingresos),
      egresos: PreciosService.centavos(egresos),
    }
  }

  private async saldo(cajaId: bigint, apertura: number): Promise<number> {
    const movimientos = await this.prisma.movimiento_caja.findMany({
      where: { caja_id: cajaId },
      select: { tipo: true, monto: true },
    })
    const { ingresos, egresos } = this.sumar(movimientos)
    return PreciosService.centavos(apertura + ingresos - egresos)
  }

  /**
   * La caja es de quien la abrio. Ni siquiera un gerente registra movimientos en
   * la caja de otra persona: si lo hiciera, la diferencia del arqueo dejaria de
   * ser responsabilidad de nadie.
   */
  private async buscarAbierta(cajaId: bigint, usuario: UsuarioAutenticado) {
    const caja = await this.prisma.caja.findUnique({ where: { id: cajaId } })
    if (!caja) throw ExcepcionNegocio.noEncontrado('Esa caja no existe')

    this.verificarSucursal(usuario, caja.sucursal_id)

    if (caja.usuario_id !== usuario.id) {
      throw ExcepcionNegocio.sinPermiso('Esa caja es de otra persona')
    }
    if (caja.estado !== 'abierta') {
      throw ExcepcionNegocio.conflicto('Esa caja ya esta cerrada')
    }

    return caja
  }

  private verificarSucursal(usuario: UsuarioAutenticado, sucursalId: number): void {
    const propia = this.permisos.restringeSucursal(usuario)
    if (propia !== null && propia !== sucursalId) {
      throw ExcepcionNegocio.sinPermiso('Esa caja no es de tu sucursal')
    }
  }
}
