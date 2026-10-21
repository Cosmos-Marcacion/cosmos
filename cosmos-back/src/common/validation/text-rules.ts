/**
 * Reglas de texto que comparten los formularios de la plataforma.
 *
 * Estan aqui y no repetidas en cada DTO porque el panel aplica las mismas: si
 * una cambia en un lado y no en el otro, el usuario ve un formulario que deja
 * guardar y una API que responde 400, o al reves.
 */

/**
 * Nombre de persona: letras de cualquier idioma (tildes, n con tilde, dieresis),
 * espacios, apostrofo, guion y punto. Empieza por letra. Sin digitos, emojis ni
 * simbolos: un nombre asi no se puede buscar ni auditar.
 */
export const PERSON_NAME_PATTERN = /^\p{L}[\p{L}\p{M} '.-]*$/u
export const PERSON_NAME_MIN = 3
export const PERSON_NAME_MAX = 80
export const PERSON_NAME_MESSAGE =
  'El nombre solo admite letras, espacios, apóstrofo, guion y punto, y debe empezar por una letra.'

/**
 * Nombre o apellidos de la ficha de un empleado. No se escriben a mano: llegan
 * del maestro de Cosmos o de Visma, y alli los hay con coma ("PEREZ, JUAN").
 * Por eso admite la coma y no exige minimo. Los signos con los que se arma
 * codigo (< > ( ) ; = comillas) quedan fuera.
 */
export const EMPLOYEE_NAME_PATTERN = /^\p{L}[\p{L}\p{M} '.,-]*$/u
export const EMPLOYEE_NAME_MAX = 120
export const EMPLOYEE_NAME_MESSAGE =
  'El nombre solo admite letras, espacios, apóstrofo, coma, guion y punto, y debe empezar por una letra.'

/** DNI, carne de extranjeria o pasaporte: letras, digitos y guion. */
export const DOCUMENT_PATTERN = /^[A-Za-z0-9-]{1,20}$/
export const DOCUMENT_MESSAGE =
  'El documento solo admite letras, números y guion, hasta 20 caracteres.'

/** Codigo que viene de otro sistema (id de Visma, legajo). */
export const EXTERNAL_CODE_PATTERN = /^[A-Za-z0-9_-]{1,40}$/

/**
 * Direccion de un fichero ya subido: vacia, https o una ruta del propio sitio
 * (la app manda `/images/user.png` cuando la persona no tiene foto).
 */
export const STORED_URL_PATTERN = /^(https:\/\/[^\s"'<>]+|\/(?!\/)[^\s"'<>]*)?$/

/**
 * Nombre de un registro de catalogo (puerto, punto de marcacion): letras,
 * digitos, espacios y la puntuacion de uso normal. Sin emojis ni simbolos.
 */
export const CATALOG_NAME_PATTERN =
  /^[\p{L}\p{N}][\p{L}\p{M}\p{N} '.,()/°º#-]*$/u
export const CATALOG_NAME_MAX = 100
export const CATALOG_NAME_MESSAGE =
  'El nombre solo admite letras, números, espacios y los signos . , - / ( ) #, y debe empezar por una letra o un número.'

/**
 * Contrasena: 8 o mas caracteres con al menos una letra y un numero. El tope de
 * 72 es el de bcrypt, que ignora en silencio lo que pase de ahi.
 */
export const PASSWORD_PATTERN = /^(?=.*\p{L})(?=.*\d).+$/u
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72
export const PASSWORD_MESSAGE =
  'La contraseña debe tener al menos 8 caracteres, con al menos una letra y un número.'
