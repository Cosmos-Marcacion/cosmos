import { Transform } from 'class-transformer';

/**
 * Recorta los espacios de un campo de texto antes de validarlo.
 *
 * `@IsNotEmpty()` comprueba que la cadena no sea `''`, y `'   '` no lo es. Sin
 * este recorte la API acepta un puerto llamado con tres espacios: pasa la
 * validacion, se guarda, y aparece como una fila en blanco en la pantalla y en
 * el documento que se emita a partir de ella.
 *
 * El orden importa: `@Transform` corre antes que los validadores, asi que
 * combinado con `@IsNotEmpty()` el campo en blanco se rechaza con un 400.
 */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value
  );
