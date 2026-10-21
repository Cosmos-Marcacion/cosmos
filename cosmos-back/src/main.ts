import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { JSON_BODY_LIMIT } from './common/http/body-limit';
import { isTrustedOrigin } from './common/http/cors-origin';
import {
  buildValidationPipe,
  GLOBAL_PREFIX,
  GLOBAL_PREFIX_EXCLUDE,
} from './common/http/validation';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { existsSync } from 'fs';
import * as dns from 'dns';

async function bootstrap() {
  if (process.env.DNSNODE_DNS_SERVERS) {
    const servers = process.env.DNSNODE_DNS_SERVERS.split(',').map((s) => s.trim());
    try {
      dns.setServers(servers);
    } catch (e) {
      console.error(`❌ Failed to set custom DNS servers:`, e.message);
    }
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // El maestro de formatos envia la definicion entera al guardar un borrador, y
  // un tipo de formato completo pasa de 110 KB: con el limite por defecto de
  // Express, 100 KB, la peticion se rechazaba con `PayloadTooLargeError`.
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: JSON_BODY_LIMIT, extended: true });

  app.useGlobalPipes(buildValidationPipe());

  app.enableCors({
    origin: (origin, callback) => {
      if (isTrustedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.setGlobalPrefix(GLOBAL_PREFIX, {
    exclude: GLOBAL_PREFIX_EXCLUDE,
  });

  const config = new DocumentBuilder()
    .setTitle('Cosmos API')
    .setDescription('API for Cosmos')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Verificar que el directorio de modelos existe
  const modelsPath = join(process.cwd(), 'public', 'models');
  const manifestPath = join(modelsPath, 'ssd_mobilenetv1_model-weights_manifest.json');

  if (!existsSync(modelsPath)) {
    console.error('❌ ERROR: El directorio de modelos no existe!');
  }

  if (!existsSync(manifestPath)) {
    console.error('❌ ERROR: El archivo de manifiesto no existe!');
  }

  // Azure Container Apps manda SIGTERM al retirar una replica o una revision.
  // Sin esto Node muere en el acto y corta las peticiones en curso.
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
