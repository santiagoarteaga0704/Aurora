import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'

import { PrismaModule } from './nucleo/prisma/prisma.module'
import { BitacoraModule } from './nucleo/bitacora/bitacora.module'
import { AutenticacionModule } from './nucleo/autenticacion/autenticacion.module'
import { AutenticacionGuard } from './nucleo/autenticacion/autenticacion.guard'
import { PermisosGuard } from './nucleo/autenticacion/permisos.guard'
import { ExcepcionesFilter } from './nucleo/errores/excepciones.filter'
import { RespuestaInterceptor } from './nucleo/respuesta/respuesta.interceptor'

import { AuthModule } from './modulos/auth/auth.module'
import { SaludModule } from './modulos/salud/salud.module'

/**
 * Raiz de la API.
 *
 * Las tres piezas transversales se registran aqui una sola vez, en este orden:
 *
 *   1. Limitador de tasa  - antes de tocar la base de datos.
 *   2. Autenticacion      - resuelve la sesion y la deja en la peticion.
 *   3. Permisos           - necesita la sesion ya resuelta, asi que va despues.
 *
 * Los modulos de negocio se van sumando a `imports` a medida que se implementan:
 *   catalogo, inventario, compras, ventas, pagos, caja, envios, devoluciones,
 *   promociones, probador, ia, reportes y sync.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // Techo general por IP. Los endpoints sensibles lo bajan con @Throttle.
    ThrottlerModule.forRoot([{ name: 'default', limit: 120, ttl: 60_000 }]),

    PrismaModule,
    BitacoraModule,
    AutenticacionModule,

    SaludModule,
    AuthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AutenticacionGuard },
    { provide: APP_GUARD, useClass: PermisosGuard },
    { provide: APP_INTERCEPTOR, useClass: RespuestaInterceptor },
    { provide: APP_FILTER, useClass: ExcepcionesFilter },
  ],
})
export class AppModule {}
