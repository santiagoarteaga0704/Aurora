import { randomBytes, createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import type { CargaAcceso } from './tipos'

/**
 * Emision y validacion de tokens.
 *
 * Esquema (el mismo del diseno original):
 *
 *   acceso  - JWT HS256 de 1 hora. Se valida sin ir a la base, asi que es
 *             barato; por eso dura poco.
 *   refresh - cadena opaca de 32 bytes, 30 dias. En la tabla `sesion` se guarda
 *             solo su SHA-256: si alguien lee la tabla no puede reusar ningun
 *             token. Es rotatorio: al usarlo se revoca y se emite otro, de modo
 *             que un refresh robado deja de servir en cuanto la victima entra.
 *
 * El refresh largo es lo que permite que un dispositivo que estuvo horas sin
 * red reabra sesion sin pedir la contrasenia otra vez.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  get duracionAccesoSegundos(): number {
    return Number(this.config.get('JWT_ACCESO_SEGUNDOS') ?? 3600)
  }

  private get duracionRefreshDias(): number {
    return Number(this.config.get('JWT_REFRESH_DIAS') ?? 30)
  }

  async firmarAcceso(usuario: {
    id: number
    rol: string
    sucursal_id: number | null
  }): Promise<string> {
    const carga: CargaAcceso = {
      sub: usuario.id,
      tipo: 'acceso',
      rol: usuario.rol,
      sucursal_id: usuario.sucursal_id,
    }
    return this.jwt.signAsync(carga, { expiresIn: this.duracionAccesoSegundos })
  }

  /**
   * Devuelve la carga del token o null. La verificacion fija el algoritmo en
   * HS256: sin eso, un token con "alg":"none" podria pasar sin firma.
   */
  async verificarAcceso(token: string): Promise<CargaAcceso | null> {
    try {
      const carga = await this.jwt.verifyAsync<CargaAcceso>(token, { algorithms: ['HS256'] })
      return carga.tipo === 'acceso' ? carga : null
    } catch {
      return null
    }
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  async crearRefresh(
    usuarioId: number,
    contexto: { ip: string | null; userAgent: string | null; dispositivoId: number | null }
  ): Promise<{ token: string; expira: Date }> {
    const token = randomBytes(32).toString('hex')
    const expira = new Date(Date.now() + this.duracionRefreshDias * 24 * 60 * 60 * 1000)

    await this.prisma.sesion.create({
      data: {
        usuario_id: usuarioId,
        dispositivo_id: contexto.dispositivoId,
        token_hash: this.hash(token),
        ip: contexto.ip,
        user_agent: contexto.userAgent,
        expira_en: expira,
      },
    })

    return { token, expira }
  }

  async sesionPorRefresh(token: string) {
    return this.prisma.sesion.findFirst({
      where: {
        token_hash: this.hash(token),
        revocado: false,
        expira_en: { gt: new Date() },
      },
    })
  }

  async revocarRefresh(token: string): Promise<void> {
    await this.prisma.sesion.updateMany({
      where: { token_hash: this.hash(token) },
      data: { revocado: true },
    })
  }

  /** Cierra todas las sesiones de un usuario (cambio de contrasenia, baja). */
  async revocarTodas(usuarioId: number): Promise<void> {
    await this.prisma.sesion.updateMany({
      where: { usuario_id: usuarioId, revocado: false },
      data: { revocado: true },
    })
  }
}
