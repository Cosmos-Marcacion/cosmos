/**
 * Tamano maximo del cuerpo de una peticion JSON.
 *
 * Express corta en 100 KB por defecto, y el maestro de formatos envia la
 * definicion entera al guardar un borrador: el permiso de trabajo tiene 323
 * casillas y el ATS 242, asi que un tipo de formato completo pasa de 110 KB y
 * la peticion se rechazaba con `PayloadTooLargeError`.
 *
 * El limite no se elige a ojo: `body-limit.spec.ts` lo compara con lo que
 * ocupan de verdad las definiciones de fabrica y falla si se queda corto. Asi,
 * si algun dia las plantillas crecen, se entera la prueba y no el usuario a
 * mitad de una edicion.
 */
export const JSON_BODY_LIMIT = '10mb'

/** El mismo limite en bytes, para poder compararlo. */
export const JSON_BODY_LIMIT_BYTES = 10 * 1024 * 1024
