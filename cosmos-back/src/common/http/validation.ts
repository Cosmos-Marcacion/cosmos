import { ValidationPipe } from '@nestjs/common';

/**
 * La configuracion de validacion de la API, en un solo sitio.
 *
 * Estaba escrita a mano dentro de `bootstrap()`. Mientras siguiera ahi, un test
 * de integracion solo podia copiarla, y una copia se desincroniza: el dia que
 * alguien active o quite `forbidNonWhitelisted` en produccion, los tests
 * seguirian afirmando sobre las reglas viejas y darian verde igual.
 */
export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    validationError: {
      target: false,
      value: true,
    },
  });
}

/** Prefijo global de la API y rutas que quedan fuera de el. */
export const GLOBAL_PREFIX = 'api/v1';
export const GLOBAL_PREFIX_EXCLUDE = ['/', '/health', '/health/ready'];
