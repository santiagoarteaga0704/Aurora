import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PermisosService } from './permisos.service'
import { TokensService } from './tokens.service'
import type { UsuarioAutenticado } from './tipos'

/**
 * Convierte un token de acceso en el usuario con el que trabajan los
 * controladores.
 *
 * Se vuelve a leer el usuario de la base en cada peticion a proposito: si a
 * alguien se le dio de baja o se le cambio el rol, el cambio tiene efecto en la
 * siguiente peticion y no cuando caduque su token. Lo que si se cachea son los
 * permisos del rol, que es la consulta que se repetiria.
 */
@Injectable()
export class ContextoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly permisos: PermisosService
  ) {}

  async desdeToken(token: string | null): Promise<UsuarioAutenticado | null> {
    if (!token) return null

    const carga = await this.tokens.verificarAcceso(token)
    if (!carga) return null

    const fila = await this.prisma.usuario.findUnique({
      where: { id: carga.sub },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        rol_id: true,
        sucursal_id: true,
        activo: true,
        rol: { select: { nombre: true } },
      },
    })

    if (!fila || !fila.activo) return null

    return {
      id: fila.id,
      nombre: fila.nombre,
      apellido: fila.apellido,
      email: fila.email,
      rol: fila.rol.nombre,
      rol_id: fila.rol_id,
      sucursal_id: fila.sucursal_id,
      activo: fila.activo,
      permisos: await this.permisos.deRol(fila.rol_id),
    }
  }

  /** Lee el token del encabezado Authorization: Bearer <token>. */
  static bearerDe(cabecera: string | undefined): string | null {
    if (!cabecera) return null
    const [esquema, valor] = cabecera.split(' ')
    return esquema?.toLowerCase() === 'bearer' && valor ? valor : null
  }
}
