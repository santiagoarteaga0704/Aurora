import { Injectable } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import type {
  DatosActualizarUsuario,
  DatosAprobarMayorista,
  DatosConsultaUsuarios,
  DatosCrearUsuario,
  DatosPermisosDeRol,
  DatosRol,
  RolConPermisos,
  UsuarioAdmin,
} from '@aurora/contratos'
import { PERMISOS, ROLES, salto } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import { PermisosService } from '../../nucleo/autenticacion/permisos.service'
import { TokensService } from '../../nucleo/autenticacion/tokens.service'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'

@Injectable()
export class AdministracionService {
  private static readonly COSTO_BCRYPT = 12

  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly tokens: TokensService,
    private readonly bitacora: BitacoraService
  ) {}

  // ==========================================================================
  // Usuarios
  // ==========================================================================

  async usuarios(filtros: DatosConsultaUsuarios, usuario: UsuarioAutenticado) {
    const propia = this.permisos.restringeSucursal(usuario)

    const where = {
      rol_id: filtros.rol_id,
      sucursal_id: propia ?? filtros.sucursal_id,
      ...(filtros.solo_activos !== 'false' ? { activo: true } : {}),
      ...(filtros.q
        ? {
            OR: [
              { nombre: { contains: filtros.q, mode: 'insensitive' as const } },
              { apellido: { contains: filtros.q, mode: 'insensitive' as const } },
              { email: { contains: filtros.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.usuario.count({ where }),
      this.prisma.usuario.findMany({
        where,
        orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
        skip: salto(filtros),
        take: filtros.por_pagina,
        include: {
          rol: { select: { nombre: true } },
          sucursal: { select: { nombre: true } },
          cliente: { select: { tipo: true, mayorista_aprobado: true } },
        },
      }),
    ])

    return { total, items: filas.map((u) => this.formatear(u)) }
  }

  /**
   * Alta de personal.
   *
   * El rol cliente no se da de alta por aqui: un cliente se registra solo, y
   * crearlo a mano dejaria su fila en `cliente` sin existir, con lo que no
   * podria comprar.
   */
  async crearUsuario(
    datos: DatosCrearUsuario,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<UsuarioAdmin> {
    const rol = await this.prisma.rol.findUnique({
      where: { id: datos.rol_id },
      select: { id: true, nombre: true, activo: true },
    })
    if (!rol?.activo) {
      throw ExcepcionNegocio.validacion({ rol_id: 'Ese rol no existe o esta inactivo' })
    }
    if (rol.nombre === ROLES.CLIENTE) {
      throw ExcepcionNegocio.validacion({
        rol_id: 'Los clientes se registran desde la tienda, no se crean aqui',
      })
    }

    const yaExiste = await this.prisma.usuario.findUnique({
      where: { email: datos.email },
      select: { id: true },
    })
    if (yaExiste) {
      throw ExcepcionNegocio.validacion({ email: 'Ya hay una cuenta con este correo' })
    }

    // Todo el personal trabaja en una sucursal. Sin ella, el alcance por
    // sucursal no tendria a que limitarse y la persona veria todo.
    if (datos.sucursal_id === undefined) {
      throw ExcepcionNegocio.validacion({
        sucursal_id: 'El personal tiene que pertenecer a una sucursal',
      })
    }
    const sucursal = await this.prisma.sucursal.findUnique({
      where: { id: datos.sucursal_id },
      select: { id: true, activo: true },
    })
    if (!sucursal?.activo) {
      throw ExcepcionNegocio.validacion({ sucursal_id: 'Esa sucursal no existe o esta inactiva' })
    }

    // Un gerente solo da de alta gente en su propia sucursal.
    const propia = this.permisos.restringeSucursal(usuario)
    if (propia !== null && propia !== datos.sucursal_id) {
      throw ExcepcionNegocio.sinPermiso('Solo puedes dar de alta personal en tu sucursal')
    }

    const creado = await this.prisma.usuario.create({
      data: {
        rol_id: datos.rol_id,
        sucursal_id: datos.sucursal_id,
        nombre: datos.nombre,
        apellido: datos.apellido,
        email: datos.email,
        telefono: datos.telefono ?? null,
        ci: datos.ci ?? null,
        password_hash: await bcrypt.hash(datos.password, AdministracionService.COSTO_BCRYPT),
      },
      include: {
        rol: { select: { nombre: true } },
        sucursal: { select: { nombre: true } },
        cliente: { select: { tipo: true, mayorista_aprobado: true } },
      },
    })

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'usuario',
      entidad: 'usuario',
      entidadId: creado.id,
      descripcion: `Alta de ${datos.nombre} ${datos.apellido} como ${rol.nombre}`,
      datosNuevos: { email: datos.email, rol: rol.nombre, sucursal_id: datos.sucursal_id },
    })

    return this.formatear(creado)
  }

  async actualizarUsuario(
    id: number,
    datos: DatosActualizarUsuario,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<UsuarioAdmin> {
    const previo = await this.prisma.usuario.findUnique({
      where: { id },
      include: { rol: { select: { nombre: true } } },
    })
    if (!previo) throw ExcepcionNegocio.noEncontrado('Ese usuario no existe')

    const propia = this.permisos.restringeSucursal(usuario)
    if (propia !== null && previo.sucursal_id !== propia) {
      throw ExcepcionNegocio.sinPermiso('Ese usuario no es de tu sucursal')
    }

    // Nadie se desactiva ni se cambia el rol a si mismo: dejaria el sistema sin
    // administrador con un solo clic mal dado.
    if (id === usuario.id && (datos.activo === false || datos.rol_id !== undefined)) {
      throw ExcepcionNegocio.conflicto('No puedes cambiar tu propio rol ni desactivar tu cuenta')
    }

    if (datos.rol_id !== undefined) {
      const rol = await this.prisma.rol.findUnique({
        where: { id: datos.rol_id },
        select: { activo: true },
      })
      if (!rol?.activo) {
        throw ExcepcionNegocio.validacion({ rol_id: 'Ese rol no existe o esta inactivo' })
      }
    }

    const actualizado = await this.prisma.usuario.update({
      where: { id },
      data: {
        rol_id: datos.rol_id,
        sucursal_id: datos.sucursal_id,
        nombre: datos.nombre,
        apellido: datos.apellido,
        telefono: datos.telefono,
        ci: datos.ci,
        activo: datos.activo,
        ...(datos.password
          ? {
              password_hash: await bcrypt.hash(
                datos.password,
                AdministracionService.COSTO_BCRYPT
              ),
            }
          : {}),
      },
      include: {
        rol: { select: { nombre: true } },
        sucursal: { select: { nombre: true } },
        cliente: { select: { tipo: true, mayorista_aprobado: true } },
      },
    })

    // Cambiarle la contrasenia o desactivarlo tiene que echarlo de sus sesiones
    // abiertas; si no, el token que ya tenia sigue funcionando una hora mas.
    if (datos.password || datos.activo === false) {
      await this.tokens.revocarTodas(id)
    }

    await this.bitacora.registrar(ctx, {
      accion: 'actualizar',
      modulo: 'usuario',
      entidad: 'usuario',
      entidadId: id,
      descripcion: `Edicion de ${previo.nombre} ${previo.apellido}`,
      datosPrevios: { rol: previo.rol.nombre, activo: previo.activo },
      datosNuevos: {
        rol: actualizado.rol.nombre,
        activo: actualizado.activo,
        password: datos.password ? '***' : undefined,
      },
    })

    return this.formatear(actualizado)
  }

  /** Baja logica: el historial de ventas lo sigue referenciando. */
  async desactivarUsuario(
    id: number,
    usuario: UsuarioAutenticado,
    ctx: ContextoPeticion
  ): Promise<void> {
    await this.actualizarUsuario(id, { activo: false }, usuario, ctx)
  }

  // ==========================================================================
  // Clientes mayoristas
  // ==========================================================================

  /**
   * Habilita los precios de mayoreo de un cliente.
   *
   * Es el paso manual que el registro deja pendiente: alguien valida el NIT
   * antes de que la cuenta acceda a los precios de mayoreo. Sin esto, cualquiera
   * se registraria como mayorista y compraria al costo.
   */
  async aprobarMayorista(
    clienteId: number,
    datos: DatosAprobarMayorista,
    ctx: ContextoPeticion
  ): Promise<UsuarioAdmin> {
    const cliente = await this.prisma.cliente.findUnique({
      where: { usuario_id: clienteId },
      include: { usuario: { select: { nombre: true, apellido: true } } },
    })
    if (!cliente) throw ExcepcionNegocio.noEncontrado('Ese cliente no existe')

    if (cliente.tipo !== 'mayorista') {
      throw ExcepcionNegocio.conflicto(
        'Esa cuenta es minorista. Primero tiene que pedir el cambio a mayorista.'
      )
    }
    if (datos.aprobado && !cliente.nit) {
      throw ExcepcionNegocio.validacion({
        nit: 'No se puede aprobar un mayorista sin NIT registrado',
      })
    }

    await this.prisma.cliente.update({
      where: { usuario_id: clienteId },
      data: {
        mayorista_aprobado: datos.aprobado,
        descuento_extra: datos.descuento_extra,
        limite_credito: datos.limite_credito,
      },
    })

    await this.bitacora.registrar(ctx, {
      accion: datos.aprobado ? 'aprobar' : 'rechazar',
      modulo: 'usuario',
      entidad: 'cliente',
      entidadId: clienteId,
      descripcion: `Mayorista ${cliente.usuario.nombre} ${cliente.usuario.apellido} ${datos.aprobado ? 'aprobado' : 'desaprobado'}`,
      datosNuevos: { mayorista_aprobado: datos.aprobado, nit: cliente.nit },
    })

    const u = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: clienteId },
      include: {
        rol: { select: { nombre: true } },
        sucursal: { select: { nombre: true } },
        cliente: { select: { tipo: true, mayorista_aprobado: true } },
      },
    })
    return this.formatear(u)
  }

  // ==========================================================================
  // Roles y permisos
  // ==========================================================================

  async roles(): Promise<RolConPermisos[]> {
    const filas = await this.prisma.rol.findMany({
      orderBy: { id: 'asc' },
      include: {
        rol_permiso: { select: { permiso: { select: { codigo: true } } } },
        _count: { select: { usuario: true } },
      },
    })

    return filas.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      descripcion: r.descripcion,
      es_sistema: r.es_sistema,
      activo: r.activo,
      usuarios: r._count.usuario,
      permisos: r.rol_permiso.map((rp) => rp.permiso.codigo),
    }))
  }

  async permisosDisponibles() {
    const filas = await this.prisma.permiso.findMany({ orderBy: [{ modulo: 'asc' }, { codigo: 'asc' }] })

    // Agrupados por modulo, que es como los pinta la pantalla de roles.
    const porModulo = new Map<string, { codigo: string; descripcion: string | null }[]>()
    for (const p of filas) {
      const lista = porModulo.get(p.modulo) ?? []
      lista.push({ codigo: p.codigo, descripcion: p.descripcion })
      porModulo.set(p.modulo, lista)
    }

    return [...porModulo.entries()].map(([modulo, permisos]) => ({ modulo, permisos }))
  }

  async crearRol(datos: DatosRol, ctx: ContextoPeticion) {
    const ocupado = await this.prisma.rol.findUnique({
      where: { nombre: datos.nombre },
      select: { id: true },
    })
    if (ocupado) throw ExcepcionNegocio.validacion({ nombre: 'Ya existe un rol con ese nombre' })

    const rol = await this.prisma.rol.create({
      data: { nombre: datos.nombre, descripcion: datos.descripcion ?? null, es_sistema: false },
    })

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'rol',
      entidad: 'rol',
      entidadId: rol.id,
      descripcion: `Rol ${datos.nombre} creado`,
    })

    return rol
  }

  /**
   * Reemplaza los permisos de un rol por la lista enviada.
   *
   * Se invalida la cache de permisos al terminar: sin eso, el cambio tardaria
   * hasta un minuto en notarse y quien lo hizo creeria que no funciono.
   */
  async definirPermisos(
    rolId: number,
    datos: DatosPermisosDeRol,
    ctx: ContextoPeticion
  ): Promise<RolConPermisos> {
    const rol = await this.prisma.rol.findUnique({
      where: { id: rolId },
      select: { id: true, nombre: true, es_sistema: true },
    })
    if (!rol) throw ExcepcionNegocio.noEncontrado('Ese rol no existe')

    // El rol administrador no se toca: quitarle el comodin dejaria el sistema
    // sin nadie que pueda devolverselo.
    if (rol.nombre === ROLES.ADMINISTRADOR) {
      throw ExcepcionNegocio.conflicto(
        'Los permisos del rol administrador no se modifican: quedaria el sistema sin administracion'
      )
    }

    const permisos = await this.prisma.permiso.findMany({
      where: { codigo: { in: datos.permisos } },
      select: { id: true, codigo: true },
    })

    const desconocidos = datos.permisos.filter((c) => !permisos.some((p) => p.codigo === c))
    if (desconocidos.length > 0) {
      throw ExcepcionNegocio.validacion({
        permisos: `Estos permisos no existen: ${desconocidos.join(', ')}`,
      })
    }

    const previos = await this.permisos.deRol(rolId)

    await this.prisma.$transaction([
      this.prisma.rol_permiso.deleteMany({ where: { rol_id: rolId } }),
      this.prisma.rol_permiso.createMany({
        data: permisos.map((p) => ({ rol_id: rolId, permiso_id: p.id })),
      }),
    ])

    this.permisos.invalidar(rolId)

    await this.bitacora.registrar(ctx, {
      accion: 'actualizar',
      modulo: 'rol',
      entidad: 'rol',
      entidadId: rolId,
      descripcion: `Permisos del rol ${rol.nombre}: ${permisos.length} asignado(s)`,
      datosPrevios: { permisos: previos },
      datosNuevos: { permisos: permisos.map((p) => p.codigo) },
    })

    const todos = await this.roles()
    return todos.find((r) => r.id === rolId)!
  }

  // ==========================================================================
  // Internos
  // ==========================================================================

  private formatear(u: {
    id: number
    nombre: string
    apellido: string
    email: string
    telefono: string | null
    ci: string | null
    rol_id: number
    sucursal_id: number | null
    activo: boolean
    ultimo_acceso: Date | null
    creado_en: Date
    rol: { nombre: string }
    sucursal: { nombre: string } | null
    cliente: { tipo: string; mayorista_aprobado: boolean } | null
  }): UsuarioAdmin {
    return {
      id: u.id,
      nombre: u.nombre,
      apellido: u.apellido,
      email: u.email,
      telefono: u.telefono,
      ci: u.ci,
      rol: u.rol.nombre,
      rol_id: u.rol_id,
      sucursal: u.sucursal?.nombre ?? null,
      sucursal_id: u.sucursal_id,
      activo: u.activo,
      ultimo_acceso: u.ultimo_acceso?.toISOString() ?? null,
      creado_en: u.creado_en.toISOString(),
      tipo_cliente: (u.cliente?.tipo as UsuarioAdmin['tipo_cliente']) ?? null,
      mayorista_aprobado: u.cliente?.mayorista_aprobado ?? null,
    }
  }

  /** Permisos que exige cada operacion, para documentarlos en un solo lugar. */
  static readonly PERMISOS_USADOS = {
    ver: PERMISOS.USUARIO_VER,
    crear: PERMISOS.USUARIO_CREAR,
    editar: PERMISOS.USUARIO_EDITAR,
    eliminar: PERMISOS.USUARIO_ELIMINAR,
    roles: PERMISOS.ROL_GESTIONAR,
  } as const
}
