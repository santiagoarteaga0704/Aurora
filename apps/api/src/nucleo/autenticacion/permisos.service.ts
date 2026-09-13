import { Injectable } from '@nestjs/common'
import { PERMISOS } from '@aurora/contratos'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Resuelve los permisos de un rol.
 *
 * Los permisos viven en la base (tabla rol_permiso), no en el codigo: un
 * administrador crea un rol nuevo y le asigna permisos sin que nadie recompile.
 * Eso significa una consulta por peticion, asi que se cachean por rol en
 * memoria del proceso, con caducidad corta.
 *
 * La cache se invalida explicitamente cuando el modulo de roles cambia una
 * asignacion, para que el cambio se note sin esperar la caducidad.
 */
@Injectable()
export class PermisosService {
  private static readonly VIDA_CACHE_MS = 60_000

  private readonly cache = new Map<number, { permisos: string[]; vence: number }>()

  constructor(private readonly prisma: PrismaService) {}

  async deRol(rolId: number): Promise<string[]> {
    const enCache = this.cache.get(rolId)
    if (enCache && enCache.vence > Date.now()) {
      return enCache.permisos
    }

    const filas = await this.prisma.rol_permiso.findMany({
      where: { rol_id: rolId },
      select: { permiso: { select: { codigo: true } } },
    })
    const permisos = filas.map((f) => f.permiso.codigo)

    this.cache.set(rolId, { permisos, vence: Date.now() + PermisosService.VIDA_CACHE_MS })
    return permisos
  }

  /** Llamar al cambiar los permisos de un rol. Sin argumento, limpia todo. */
  invalidar(rolId?: number): void {
    if (rolId === undefined) this.cache.clear()
    else this.cache.delete(rolId)
  }

  puede(permisos: readonly string[], requerido: string): boolean {
    return permisos.includes(PERMISOS.COMODIN) || permisos.includes(requerido)
  }

  /**
   * Sucursal a la que esta restringido el usuario, o null si ve todas.
   *
   * Un gerente o un vendedor solo pueden operar sobre su propia sucursal; el
   * administrador y quien tenga 'sucursal.ver_todas' no tienen esa limitacion.
   * Los modulos de inventario, ventas y reportes usan esto para filtrar.
   */
  restringeSucursal(usuario: { permisos: string[]; sucursal_id: number | null }): number | null {
    if (
      this.puede(usuario.permisos, PERMISOS.COMODIN) ||
      this.puede(usuario.permisos, PERMISOS.SUCURSAL_VER_TODAS)
    ) {
      return null
    }
    return usuario.sucursal_id
  }
}
