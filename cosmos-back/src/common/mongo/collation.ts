import { mongo } from 'mongoose'

/**
 * Collation para ordenar y comparar texto en espanol.
 *
 * Sin esto Mongo ordena por bytes, que es el orden de los puntos de codigo
 * Unicode y no el del alfabeto: la "N" cae detras de la "Z", y "Avila" detras
 * de "Zamora" porque la "A" acentuada esta en otro bloque. En un listado de
 * personal peruano eso no es un detalle: los apellidos con tilde y con ene son
 * la mitad de la pagina, y quien busca "Nunez" no lo encuentra donde mira.
 *
 * `strength: 1` compara solo la letra base, asi que ademas iguala mayusculas y
 * tildes: "avila", "Avila" y "AVILA" caen juntos en vez de partir la lista en
 * tres bloques segun como se escribiera cada ficha.
 *
 * Aviso para quien anada un indice a un campo que se ordene con esto: el
 * indice tiene que declararse con la misma collation o Mongo no lo usa y
 * ordena en memoria sin decirlo.
 */
export const ORDEN_ALFABETICO: mongo.CollationOptions = {
  locale: 'es',
  strength: 1,
}
