import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { Trim } from './trim';

class Ejemplo {
  @Trim()
  @IsString()
  @IsNotEmpty()
  name: string;

  @Trim()
  @IsOptional()
  @IsString()
  nota?: string;

  @Trim()
  @IsOptional()
  cantidad?: number;
}

/**
 * `@IsNotEmpty()` da por bueno `'   '`: la cadena existe y no es `''`. Sin
 * recorte previo, la API acepta un puerto llamado con tres espacios, lo guarda,
 * y aparece como una fila en blanco en pantalla y en el documento emitido.
 */
describe('Trim', () => {
  const transformar = (datos: Record<string, unknown>) =>
    plainToInstance(Ejemplo, datos, { enableImplicitConversion: true });

  it('recorta los espacios de los extremos', () => {
    expect(transformar({ name: '  Matarani  ' }).name).toBe('Matarani');
  });

  it('no toca los espacios interiores', () => {
    expect(transformar({ name: '  Puerto  del  Callao ' }).name).toBe('Puerto  del  Callao');
  });

  it('un campo de solo espacios queda vacio y falla la validacion', () => {
    const instancia = transformar({ name: '   ' });

    expect(instancia.name).toBe('');
    expect(validateSync(instancia)).not.toHaveLength(0);
  });

  it('un campo con contenido pasa la validacion', () => {
    expect(validateSync(transformar({ name: 'Callao' }))).toHaveLength(0);
  });

  it('deja pasar los valores que no son texto sin tocarlos', () => {
    // Aplicado sobre un numero o un nulo, `trim` no existe: el transformador
    // tiene que devolver el valor tal cual en vez de romper la peticion.
    expect(transformar({ name: 'x', cantidad: 42 }).cantidad).toBe(42);
    expect(transformar({ name: 'x', nota: undefined }).nota).toBeUndefined();
  });

  it('un campo ausente no adquiere valor', () => {
    // `plainToInstance` declara la propiedad aunque no venga en el cuerpo; lo
    // que importa es que `@Trim` no la convierta en cadena vacia, porque eso
    // haria fallar un `@IsOptional()` que deberia pasar.
    expect(transformar({ name: 'x' }).nota).toBeUndefined();
  });
});
