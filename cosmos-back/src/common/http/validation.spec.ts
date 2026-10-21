import { ValidationPipe } from '@nestjs/common';
import { IsString } from 'class-validator';
import { buildValidationPipe, GLOBAL_PREFIX, GLOBAL_PREFIX_EXCLUDE } from './validation';

class Cuerpo {
  @IsString()
  name: string;
}

const metadata = { type: 'body' as const, metatype: Cuerpo };

/**
 * Estas reglas las aplica el pipe global a **todas** las peticiones de la API.
 * Estaban escritas a mano dentro de `bootstrap()`, donde ningun test podia
 * verlas; cualquier cambio en ellas altera el contrato de todos los endpoints a
 * la vez, asi que aqui quedan fijadas.
 */
describe('buildValidationPipe', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = buildValidationPipe();
  });

  it('acepta un cuerpo valido', async () => {
    await expect(pipe.transform({ name: 'Callao' }, metadata)).resolves.toMatchObject({
      name: 'Callao',
    });
  });

  it('rechaza un cuerpo con un campo no declarado', async () => {
    // `forbidNonWhitelisted`: es lo que impide que alguien inyecte campos que
    // el DTO no contempla y que acabarian en el documento guardado.
    await expect(pipe.transform({ name: 'Callao', isAdmin: true }, metadata)).rejects.toThrow();
  });

  it('un numero se convierte a texto en vez de rechazarse', async () => {
    // `enableImplicitConversion: true` convierte antes de validar, asi que
    // `@IsString()` ve ya una cadena. Es comodo para los parametros de ruta,
    // que siempre llegan como texto, y a cambio afloja la validacion de tipos
    // del cuerpo: un DTO que necesite rechazar un numero tiene que decirlo con
    // un validador de formato, no confiando en `@IsString()`.
    await expect(pipe.transform({ name: 42 }, metadata)).resolves.toMatchObject({
      name: '42',
    });
  });

  it('con conversion implicita, @IsString() por si solo no rechaza nada', async () => {
    // HALLAZGO (QA_PLAN.md): `enableImplicitConversion` convierte *antes* de
    // validar, asi que hasta un objeto llega a `@IsString()` como
    // "[object Object]" y pasa. La consecuencia practica es que un DTO que solo
    // declare `@IsString()` no esta validando el tipo: para rechazar de verdad
    // hace falta un validador de formato (`@Length`, `@Matches`, `@IsEmail`).
    const objeto = await pipe.transform({ name: { a: 1 } }, metadata);
    expect(objeto.name).toBe('[object Object]');

    // Un array si se rechaza, asi que la validacion no es del todo inerte;
    // simplemente no es la que se lee en el DTO.
    await expect(pipe.transform({ name: [1, 2] }, metadata)).rejects.toThrow();
  });

  it('devuelve una instancia de la clase, no un objeto plano', async () => {
    // `transform: true`: sin esto, los decoradores de transformacion (`@Trim`)
    // y los tipos del DTO no llegan al controlador.
    const resultado = await pipe.transform({ name: 'Callao' }, metadata);

    expect(resultado).toBeInstanceOf(Cuerpo);
  });

  it('el error no devuelve el objeto entero al cliente', async () => {
    // `validationError.target: false`. Devolverlo filtraria de vuelta todo lo
    // que se envio, incluida cualquier credencial que viniera en el cuerpo.
    const error = await pipe
      .transform({ name: 'ok', password: 'Secreta123' }, metadata)
      .catch((e) => e);

    const cuerpo = JSON.stringify(error.getResponse());
    expect(cuerpo).not.toContain('target');
    expect(cuerpo).not.toContain('Secreta123');
  });
});

describe('prefijo global', () => {
  it('la API cuelga de api/v1', () => {
    expect(GLOBAL_PREFIX).toBe('api/v1');
  });

  it('la raiz y la salud del servicio quedan fuera del prefijo', () => {
    // El chequeo de salud lo consulta el orquestador, que no conoce versiones
    // de la API: moverlo bajo el prefijo lo dejaria dando 404.
    expect(GLOBAL_PREFIX_EXCLUDE).toEqual(['/', '/health', '/health/ready']);
  });
});
