import { Logger } from '@nestjs/common';

process.env.TZ = 'America/Lima';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret';

// Sin esto, `AppModule` intentaria conectarse al Mongo de desarrollo. La URI
// real la planta `withMongo()` cuando arranca el servidor en memoria.
delete process.env.MONGO_URI;

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'verbose').mockImplementation(() => undefined);
});

/**
 * Una promesa rechazada sin capturar dentro de un test de integracion no rompe
 * la suite por si sola: Jest la reporta y sigue. Ese es exactamente el fallo
 * que despues aparece en produccion, asi que aqui se convierte en error.
 */
process.on('unhandledRejection', (reason) => {
  throw reason instanceof Error ? reason : new Error(String(reason));
});
