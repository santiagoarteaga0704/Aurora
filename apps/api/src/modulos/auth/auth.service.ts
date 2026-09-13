import { Injectable } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import type {
  DatosCambiarPassword,
  DatosLogin,
  DatosRegistro,
  ParTokens,
  PerfilCompleto,
} from '@aurora/contratos'
import { ROLES } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import { PermisosService } from '../../nucleo/autenticacion/permisos.service'
import { TokensService } from '../../nucleo/autenticacion/tokens.service'

/** Datos del dispositivo que acompanian al inicio de sesion. */
export interface ContextoSesion extends ContextoPeticion {
  dispositivoUuid: string | null
}

@Injectable()
export class AuthService {
  /**
   * Tras 5 intentos fallidos la cuenta queda bloqueada 15 minutos. Esto frena la
   * fuerza bruta contra una cuenta concreta; el limitador de tasa por IP frena la
   * fuerza bruta contra muchas cuentas a la vez. Hacen falta los dos.
   */
  private static readonly MAX_INTENTOS = 5
  private static readonly MINUTOS_BLOQUEO = 15

  /**
   * Costo de bcrypt. 12 son unos 255 ms en esta maquina: suficiente para que
   * probar contrasenias al por mayor sea caro, y poco para que el login no se
   * sienta lento. Es el mismo costo que usaba el backend anterior, asi que los
   * hashes ya sembrados siguen sirviendo.
   */
  private static readonly COSTO_BCRYPT = 12

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly permisos: PermisosService,
    private readonly bitacora: BitacoraService
  ) {}

  // --------------------------------------------------------------------------
  // Registro de un cliente desde la tienda
  // --------------------------------------------------------------------------
  async registro(datos: DatosRegistro, ctx: ContextoSesion): Promise<ParTokens> {
    const yaExiste = await this.prisma.usuario.findUnique({
      where: { email: datos.email },
      select: { id: true },
    })
    if (yaExiste) {
      throw ExcepcionNegocio.validacion({ email: 'Ya hay una cuenta con este correo' })
    }

    const rolCliente = await this.prisma.rol.findFirst({
      where: { nombre: ROLES.CLIENTE },
      select: { id: true },
    })
    if (!rolCliente) {
      throw new ExcepcionNegocio(
        500,
        'El rol cliente no existe. Hay que cargar database/seed.postgres.sql'
      )
    }

    const passwordHash = await bcrypt.hash(datos.password, AuthService.COSTO_BCRYPT)

    // Usuario y cliente se crean juntos o no se crean: un usuario con rol
    // cliente pero sin fila en `cliente` no podria comprar y seria invisible
    // para el area comercial.
    const usuarioId = await this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          rol_id: rolCliente.id,
          nombre: datos.nombre,
          apellido: datos.apellido,
          email: datos.email,
          telefono: datos.telefono ?? null,
          password_hash: passwordHash,
        },
        select: { id: true },
      })

      await tx.cliente.create({
        data: {
          usuario_id: usuario.id,
          tipo: datos.tipo,
          nit: datos.nit ?? null,
          razon_social: datos.razon_social ?? null,
          // Un mayorista queda pendiente de validacion manual del NIT antes de
          // acceder a los precios de mayoreo.
          mayorista_aprobado: false,
        },
      })

      return usuario.id
    })

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'auth',
      entidad: 'usuario',
      entidadId: usuarioId,
      descripcion: `Registro de cliente ${datos.email}`,
    })

    return this.emitirTokens(usuarioId, ctx)
  }

  // --------------------------------------------------------------------------
  // Inicio de sesion
  // --------------------------------------------------------------------------
  async login(datos: DatosLogin, ctx: ContextoSesion): Promise<ParTokens> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: datos.email },
      select: {
        id: true,
        password_hash: true,
        activo: true,
        intentos_fallidos: true,
        bloqueado_hasta: true,
      },
    })

    // Mismo mensaje para correo inexistente y contrasenia incorrecta: si
    // dijeramos que el correo no existe, estariamos regalando la lista de
    // clientes a cualquiera que pruebe correos.
    const credencialesInvalidas = () => new ExcepcionNegocio(401, 'Correo o contrasenia incorrectos')

    if (!usuario) throw credencialesInvalidas()

    if (usuario.bloqueado_hasta && usuario.bloqueado_hasta > new Date()) {
      const minutos = Math.ceil((usuario.bloqueado_hasta.getTime() - Date.now()) / 60000)
      throw ExcepcionNegocio.demasiadasPeticiones(
        `Cuenta bloqueada por intentos fallidos. Intenta en ${minutos} minuto(s).`
      )
    }

    const coincide = await bcrypt.compare(datos.password, usuario.password_hash)
    if (!coincide) {
      await this.registrarIntentoFallido(usuario.id, usuario.intentos_fallidos)
      await this.bitacora.registrar(ctx, {
        accion: 'login_fallido',
        modulo: 'auth',
        entidad: 'usuario',
        entidadId: usuario.id,
        descripcion: datos.email,
      })
      throw credencialesInvalidas()
    }

    if (!usuario.activo) {
      throw ExcepcionNegocio.sinPermiso('Tu cuenta esta desactivada. Contacta con administracion.')
    }

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { intentos_fallidos: 0, bloqueado_hasta: null, ultimo_acceso: new Date() },
    })

    await this.bitacora.registrar(
      { ...ctx, usuarioId: usuario.id },
      {
        accion: 'login',
        modulo: 'auth',
        entidad: 'usuario',
        entidadId: usuario.id,
        descripcion: 'Inicio de sesion',
      }
    )

    return this.emitirTokens(usuario.id, ctx)
  }

  // --------------------------------------------------------------------------
  // Renovacion del token de acceso
  // --------------------------------------------------------------------------
  async refrescar(refreshToken: string, ctx: ContextoSesion): Promise<ParTokens> {
    const sesion = await this.tokens.sesionPorRefresh(refreshToken)
    if (!sesion) {
      throw ExcepcionNegocio.noAutenticado('La sesion expiro. Vuelve a iniciar sesion.')
    }

    // Rotacion: el refresh usado se revoca y se emite uno nuevo. Si a alguien le
    // robaron el refresh, deja de servir en cuanto la victima lo use.
    await this.tokens.revocarRefresh(refreshToken)

    return this.emitirTokens(sesion.usuario_id, ctx, sesion.dispositivo_id)
  }

  async logout(refreshToken: string | undefined, ctx: ContextoPeticion): Promise<void> {
    if (refreshToken) {
      await this.tokens.revocarRefresh(refreshToken)
    }
    await this.bitacora.registrar(ctx, {
      accion: 'logout',
      modulo: 'auth',
      entidad: 'usuario',
      entidadId: ctx.usuarioId,
      descripcion: 'Cierre de sesion',
    })
  }

  // --------------------------------------------------------------------------
  // Perfil
  // --------------------------------------------------------------------------
  async perfil(usuarioId: number): Promise<PerfilCompleto> {
    const u = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        telefono: true,
        avatar_url: true,
        sucursal_id: true,
        rol_id: true,
        rol: { select: { nombre: true } },
        sucursal: { select: { nombre: true } },
        cliente: { select: { tipo: true, mayorista_aprobado: true, puntos: true } },
      },
    })
    if (!u) throw ExcepcionNegocio.noEncontrado('El usuario no existe')

    return {
      id: u.id,
      nombre: u.nombre,
      apellido: u.apellido,
      email: u.email,
      telefono: u.telefono,
      avatar_url: u.avatar_url,
      rol: u.rol.nombre,
      rol_id: u.rol_id,
      sucursal_id: u.sucursal_id,
      sucursal: u.sucursal?.nombre ?? null,
      tipo_cliente: u.cliente?.tipo ?? null,
      mayorista_aprobado: u.cliente?.mayorista_aprobado ?? null,
      puntos: u.cliente?.puntos ?? null,
      permisos: await this.permisos.deRol(u.rol_id),
    }
  }

  // --------------------------------------------------------------------------
  // Cambio de contrasenia
  // --------------------------------------------------------------------------
  async cambiarPassword(
    usuarioId: number,
    datos: DatosCambiarPassword,
    ctx: ContextoPeticion
  ): Promise<void> {
    const u = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { password_hash: true },
    })
    if (!u) throw ExcepcionNegocio.noEncontrado('El usuario no existe')

    if (!(await bcrypt.compare(datos.password_actual, u.password_hash))) {
      throw ExcepcionNegocio.validacion({
        password_actual: 'La contrasenia actual no coincide',
      })
    }

    const hash = await bcrypt.hash(datos.password_nueva, AuthService.COSTO_BCRYPT)

    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { password_hash: hash },
    })

    // Cambiar la contrasenia cierra las demas sesiones: si el motivo del cambio
    // es que alguien entro a la cuenta, dejarle su sesion abierta no arregla nada.
    await this.tokens.revocarTodas(usuarioId)

    await this.bitacora.registrar(ctx, {
      accion: 'actualizar',
      modulo: 'auth',
      entidad: 'usuario',
      entidadId: usuarioId,
      descripcion: 'Cambio de contrasenia',
    })
  }

  // --------------------------------------------------------------------------
  // Internos
  // --------------------------------------------------------------------------
  private async registrarIntentoFallido(
    usuarioId: number,
    intentosActuales: number
  ): Promise<void> {
    const intentos = intentosActuales + 1
    const sePasa = intentos >= AuthService.MAX_INTENTOS

    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: sePasa
        ? {
            intentos_fallidos: 0,
            bloqueado_hasta: new Date(Date.now() + AuthService.MINUTOS_BLOQUEO * 60_000),
          }
        : { intentos_fallidos: intentos },
    })
  }

  private async emitirTokens(
    usuarioId: number,
    ctx: ContextoSesion,
    dispositivoId: number | null = null
  ): Promise<ParTokens> {
    const u = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        sucursal_id: true,
        rol_id: true,
        rol: { select: { nombre: true } },
      },
    })
    if (!u) throw ExcepcionNegocio.noEncontrado('El usuario no existe')

    const idDispositivo =
      dispositivoId ??
      (await this.resolverDispositivo(ctx.dispositivoUuid, usuarioId, ctx.userAgent))

    const [token, refresh, permisos] = await Promise.all([
      this.tokens.firmarAcceso({ id: u.id, rol: u.rol.nombre, sucursal_id: u.sucursal_id }),
      this.tokens.crearRefresh(usuarioId, {
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        dispositivoId: idDispositivo,
      }),
      this.permisos.deRol(u.rol_id),
    ])

    return {
      token,
      expira_en: this.tokens.duracionAccesoSegundos,
      refresh_token: refresh.token,
      usuario: {
        id: u.id,
        nombre: u.nombre,
        apellido: u.apellido,
        email: u.email,
        rol: u.rol.nombre,
        sucursal_id: u.sucursal_id,
        permisos,
      },
    }
  }

  /**
   * Registra o reutiliza el dispositivo que manda la cabecera X-Dispositivo.
   *
   * Importa para la sincronizacion sin conexion: cada operacion encolada se ata
   * a un dispositivo, de modo que al volver la red se sabe de donde viene cada
   * venta y los conflictos se resuelven contra el origen correcto.
   */
  private async resolverDispositivo(
    uuid: string | null,
    usuarioId: number,
    userAgent: string | null
  ): Promise<number | null> {
    if (!uuid) return null

    const existente = await this.prisma.dispositivo.findUnique({
      where: { uuid },
      select: { id: true },
    })

    if (existente) {
      await this.prisma.dispositivo.update({
        where: { id: existente.id },
        data: { usuario_id: usuarioId },
      })
      return existente.id
    }

    const agente = (userAgent ?? '').toLowerCase()
    const plataforma = agente.includes('android')
      ? 'android'
      : agente.includes('iphone') || agente.includes('ipad')
        ? 'ios'
        : 'web'

    const creado = await this.prisma.dispositivo.create({
      data: {
        usuario_id: usuarioId,
        uuid,
        plataforma,
        modelo: userAgent?.slice(0, 80) ?? null,
      },
      select: { id: true },
    })
    return creado.id
  }
}
