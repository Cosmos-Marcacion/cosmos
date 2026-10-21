import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validadores de texto del panel.
 *
 * Son los mismos patrones que aplica la API (`cosmos-back/src/common/validation/
 * text-rules.ts`). Si uno cambia, cambia el otro: un formulario que deja guardar
 * lo que el servidor rechaza solo le da al usuario un error despues de pulsar.
 */

export const PERSON_NAME_PATTERN = /^\p{L}[\p{L}\p{M} '.-]*$/u;
export const PERSON_NAME_MIN = 3;
export const PERSON_NAME_MAX = 80;

export const CATALOG_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} '.,()/°º#-]*$/u;
export const CATALOG_NAME_MAX = 100;

export const PASSWORD_PATTERN = /^(?=.*\p{L})(?=.*\d).+$/u;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

/** Requisitos de contrasena, para mostrarlos antes de guardar. */
export const PASSWORD_HINT = 'Mínimo 8 caracteres, con al menos una letra y un número.';

const text = (control: AbstractControl): string =>
  typeof control.value === 'string' ? control.value : control.value == null ? '' : String(control.value);

/**
 * Obligatorio despues de recortar. `Validators.required` da por bueno un campo
 * con tres espacios o un tabulador, y el boton de guardar se habilitaba.
 */
export const requiredTrimmed: ValidatorFn = (control) =>
  text(control).trim().length === 0 ? { required: true } : null;

/**
 * Correo con dominio completo. `Validators.email` da por bueno "ana@cosmos",
 * sin punto en el dominio, y el `IsEmail` de la API lo rechaza con un 400 al
 * guardar. Devuelve la misma clave `email` para reutilizar los mensajes.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

export const emailAddress: ValidatorFn = (control) => {
  const value = text(control).trim();
  if (!value) {
    return null;
  }
  return EMAIL_PATTERN.test(value) ? null : { email: true };
};

/** Nombre de persona: letras, espacios, apostrofo, guion y punto. */
export const personName: ValidatorFn = (control) => {
  const value = text(control).trim();
  if (!value) {
    return null;
  }
  if (value.length < PERSON_NAME_MIN) {
    return { minlength: { requiredLength: PERSON_NAME_MIN, actualLength: value.length } };
  }
  if (value.length > PERSON_NAME_MAX) {
    return { maxlength: { requiredLength: PERSON_NAME_MAX, actualLength: value.length } };
  }
  return PERSON_NAME_PATTERN.test(value) ? null : { personName: true };
};

/** Nombre de catalogo: letras, numeros, espacios y puntuacion comun. */
export const catalogName: ValidatorFn = (control) => {
  const value = text(control).trim();
  if (!value) {
    return null;
  }
  if (value.length > CATALOG_NAME_MAX) {
    return { maxlength: { requiredLength: CATALOG_NAME_MAX, actualLength: value.length } };
  }
  return CATALOG_NAME_PATTERN.test(value) ? null : { catalogName: true };
};

/** Contrasena: 8 a 72 caracteres, con al menos una letra y un numero. */
export const password: ValidatorFn = (control) => {
  const value = text(control);
  if (!value) {
    return null;
  }
  if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX || !PASSWORD_PATTERN.test(value)) {
    return { password: true };
  }
  return null;
};

/**
 * Entero dentro de un rango. Un `<input type="number">` con "-102e" entrega
 * `null` al formulario y el valor se perdia al guardar; por eso el campo va
 * como texto y aqui se exige un entero escrito entero, sin exponentes ni
 * decimales.
 */
export const integerInRange = (min: number, max: number): ValidatorFn => (control): ValidationErrors | null => {
  const value = text(control).trim();
  if (!value) {
    return null;
  }
  if (!/^-?\d+$/.test(value)) {
    return { integer: true };
  }
  const n = Number(value);
  if (n < min || n > max) {
    return { range: { min, max, actual: n } };
  }
  return null;
};
