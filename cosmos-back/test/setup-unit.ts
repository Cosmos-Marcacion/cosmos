import { Logger } from '@nestjs/common';

/**
 * Preparacion comun de la suite unitaria.
 *
 * Silencia el logger de Nest. La corrida escupia 400 KB de log —definiciones de
 * formato recalculandose, avisos de borradores atrasados— y eso no es ruido
 * inocente: entierra el mensaje del test que si fallo. Un test que necesite
 * comprobar que se registro algo espia `Logger.prototype.warn` explicitamente.
 */
beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'verbose').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

/**
 * Fija el reloj y la zona horaria.
 *
 * El backend emite documentos fechados en America/Lima. Sin fijar la zona, la
 * misma suite pasa en la maquina del desarrollador y falla en el runner de CI,
 * que corre en UTC, y el fallo aparece meses despues sin relacion con el cambio
 * que lo destapo.
 */
process.env.TZ = 'America/Lima';

// Valores que el codigo espera del entorno. Nunca secretos reales: si un test
// necesita un secreto de verdad, el test esta mal planteado.
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.NODE_ENV = 'test';
