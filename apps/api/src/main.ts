import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import type { NestExpressApplication } from '@nestjs/platform-express'
import compression from 'compression'
import helmet from 'helmet'
import { AppModule } from './app.module'

/**
 * Varias tablas usan BIGINT (bitacora, sesion, pedido_historial, los
 * movimientos). Prisma los entrega como BigInt de JavaScript, y JSON.stringify
 * revienta con "Do not know how to serialize a BigInt" en vez de devolver un
 * numero. Se le ensenia a serializarse como cadena: se pierde la aritmetica en
 * el cliente, que no la necesita para un identificador, y no se pierde precision.
 */
;(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString()
}

async function arrancar(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true })
  const config = app.get(ConfigService)
  const log = new Logger('Arranque')

  app.use(helmet())
  app.use(compression())

  // Azure App Service y cualquier proxy inverso ponen la IP real del cliente en
  // X-Forwarded-For. Sin esto, el limitador de tasa veria una sola IP (la del
  // proxy) y bloquearia a todos los usuarios juntos.
  app.set('trust proxy', 1)

  const origenes = (config.get<string>('CORS_ORIGENES') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  app.enableCors({
    origin: origenes.length > 0 ? origenes : true,
    credentials: true,
    // X-Dispositivo identifica el dispositivo para la cola offline e
    // Idempotency-Key evita que un reintento duplique una venta.
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Dispositivo', 'Idempotency-Key'],
  })

  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('AURORA - API')
      .setDescription(
        'Comercio electronico multisucursal de ropa femenina. Contrato REST que consumen el PWA y la aplicacion movil.'
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build()
  )
  SwaggerModule.setup('api/docs', app, documento)

  const puerto = Number(config.get('PORT') ?? 8000)
  await app.listen(puerto, '0.0.0.0')

  log.log(`API escuchando en http://localhost:${puerto}`)
  log.log(`Contrato REST en   http://localhost:${puerto}/api/docs`)
}

void arrancar()
