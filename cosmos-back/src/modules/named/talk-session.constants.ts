/**
 * Datos de la capacitacion del turno, que hoy se registran en la propia
 * nombrada.
 *
 * Antes vivian en la coleccion `talks`, que se alimentaba desde un modulo
 * aparte: se creaba la charla por un lado, la nombrada por otro, y quien emitia
 * el formato tenia que acordarse de haber hecho las dos cosas. Ahora la charla
 * es un dato mas de la nombrada y sale en el formato con todo lo demas.
 *
 * Los identificadores son estables y sin acentos, como `formatType`: lo que se
 * imprime en la hoja CHARLA se resuelve al generar el formato, no se guarda.
 */

/** Tipo de actividad, tal como la clasifica la hoja de charla. */
export const TALK_SESSION_TYPES = [
  'INDUCCION',
  'CAPACITACION',
  'ENTRENAMIENTO',
  'SIMULACRO',
  'TOOLBOX',
  'OTROS',
] as const

export type TalkSessionType = (typeof TALK_SESSION_TYPES)[number]

/** Donde se dio la charla. */
export const TALK_SESSION_PLACES = [
  'EMBARCACION',
  'TERMINAL',
  'OFICINA',
  'OTROS',
] as const

export type TalkSessionPlace = (typeof TALK_SESSION_PLACES)[number]
