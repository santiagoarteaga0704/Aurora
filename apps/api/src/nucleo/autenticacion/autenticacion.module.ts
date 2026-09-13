import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { ContextoService } from './contexto.service'
import { PermisosService } from './permisos.service'
import { TokensService } from './tokens.service'

/**
 * Piezas de autenticacion y autorizacion, disponibles en todo el proyecto.
 *
 * Las guardias no se registran aqui sino en AppModule con APP_GUARD, porque el
 * orden importa: primero se resuelve la sesion, despues se revisan los permisos.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secreto = config.get<string>('JWT_SECRET')
        if (!secreto || secreto.length < 32) {
          throw new Error(
            'JWT_SECRET falta o es demasiado corto. Generar con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
          )
        }
        return {
          secret: secreto,
          signOptions: { algorithm: 'HS256' },
          verifyOptions: { algorithms: ['HS256'] },
        }
      },
    }),
  ],
  providers: [TokensService, PermisosService, ContextoService],
  exports: [TokensService, PermisosService, ContextoService],
})
export class AutenticacionModule {}
