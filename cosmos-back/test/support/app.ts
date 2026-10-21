import { INestApplication, ModuleMetadata } from '@nestjs/common';
import { Test, TestingModule, TestingModuleBuilder } from '@nestjs/testing';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import type { Connection } from 'mongoose';
import { registrarConexion } from './mongo';
import { buildValidationPipe, GLOBAL_PREFIX, GLOBAL_PREFIX_EXCLUDE } from '../../src/common/http/validation';
import { JSON_BODY_LIMIT } from '../../src/common/http/body-limit';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Levanta una aplicacion Nest de verdad contra el Mongo en memoria.
 *
 * No importa `AppModule` entero a proposito. `AppModule` arrastra face-api y
 * `@tensorflow/tfjs-node`, que cargan binarios nativos y tardan mas en
 * inicializarse que todo el resto de la suite junta. Cada test declara los
 * modulos que necesita.
 *
 * Lo que si se replica exactamente es la corteza HTTP de `main.ts`: el mismo
 * `ValidationPipe`, el mismo prefijo, el mismo limite de cuerpo. Sin eso, un
 * test de integracion pasaria con payloads que la API real rechaza con 400, y
 * el gate no estaria midiendo la aplicacion que se despliega.
 */
export interface TestApp {
  app: INestApplication;
  module: TestingModule;
  /** Servidor http listo para `request(server)` de supertest. */
  server: unknown;
}

export async function createTestApp(
  metadata: ModuleMetadata,
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b
): Promise<TestApp> {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error(
      'No hay MONGO_URI: llama a withMongo() en el describe antes de createTestApp().'
    );
  }

  const builder = Test.createTestingModule({
    ...metadata,
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      MongooseModule.forRoot(uri),
      ...(metadata.imports ?? []),
    ],
  });

  const module = await configure(builder).compile();
  const app = module.createNestApplication<NestExpressApplication>();

  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: JSON_BODY_LIMIT, extended: true });
  app.useGlobalPipes(buildValidationPipe());
  app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: GLOBAL_PREFIX_EXCLUDE });

  await app.init();

  // Sin esto, el vaciado entre tests iria contra la conexion global de mongoose,
  // que Nest no usa, y los documentos se acumularian de un caso al siguiente.
  registrarConexion(module.get<Connection>(getConnectionToken()));

  return { app, module, server: app.getHttpServer() };
}

/** Ruta completa de un endpoint, con el prefijo global ya puesto. */
export function api(path: string): string {
  return `/${GLOBAL_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
}
