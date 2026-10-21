/**
 * Comparacion de rostros para la marcacion y el registro.
 *
 * Un rostro es un descriptor de 128 valores y dos rostros se comparan por su
 * distancia euclidea: cuanto mas cerca, mas parecidos. Va aparte del servicio
 * para poder probarlo sin base de datos.
 *
 * El 16/10/2026 la marcacion de salida de un trabajador mostro los datos de
 * otro. Su ficha llevaba un rostro copiado en otras 13, asi que su cara real no
 * estaba en el sistema, y el reconocimiento se quedaba con la mas parecida de
 * las demas mientras pasara el umbral. De ahi las dos reglas de este fichero:
 *
 * - **Margen**: solo se reconoce a alguien si queda claramente por delante del
 *   segundo candidato. Un empate, o casi, es "no te reconozco": elegir a uno de
 *   los dos es lo que muestra a otra persona en pantalla.
 * - **Rostro ajeno**: no se registra en una ficha la cara que ya tiene otra.
 *   Asi no vuelve a haber un rostro copiado en varias personas.
 */

/** Distancia por debajo de la cual dos rostros se consideran la misma persona. */
export const FACE_MATCH_THRESHOLD = 0.45;

/**
 * Ventaja minima del mejor candidato sobre el segundo.
 *
 * Entre capturas de una misma persona la distancia suele quedar bastante por
 * debajo del umbral y entre personas distintas bastante por encima; dos
 * candidatos a menos de esto el uno del otro no permiten decidir.
 */
export const FACE_MATCH_MARGIN = 0.05;

export interface FaceCandidate {
  id: string;
  descriptor: number[];
}

export type FaceMatch =
  | { status: 'match'; id: string; distance: number }
  | { status: 'unknown'; distance: number | null }
  | { status: 'ambiguous'; ids: [string, string]; distance: number };

export function isFaceDescriptor(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 128 &&
    value.every((v) => typeof v === 'number' && Number.isFinite(v))
  );
}

export function faceDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * A quien pertenece un rostro, si se puede decir sin dudas.
 *
 * El segundo candidato se busca entre **otras fichas**: si la misma persona
 * tuviera varios descriptores, quedar cerca de si misma no es una duda.
 */
export function matchFace(query: number[], candidates: FaceCandidate[]): FaceMatch {
  const best = new Map<string, number>();
  for (const candidate of candidates) {
    const distance = faceDistance(query, candidate.descriptor);
    const previous = best.get(candidate.id);
    if (previous === undefined || distance < previous) {
      best.set(candidate.id, distance);
    }
  }
  const ranked = [...best.entries()].sort((a, b) => a[1] - b[1]);
  if (ranked.length === 0) {
    return { status: 'unknown', distance: null };
  }
  const [first, second] = ranked;
  if (first[1] >= FACE_MATCH_THRESHOLD) {
    return { status: 'unknown', distance: first[1] };
  }
  if (second && second[1] - first[1] < FACE_MATCH_MARGIN) {
    return { status: 'ambiguous', ids: [first[0], second[0]], distance: first[1] };
  }
  return { status: 'match', id: first[0], distance: first[1] };
}

/**
 * Por debajo de esto, dos rostros son casi seguro la misma cara.
 *
 * Es mas estricto que el umbral de reconocimiento a proposito. Dos personas
 * parecidas pueden quedar a 0,40: hay cinco parejas asi en la base. Bloquear
 * el registro de una de ellas la dejaria sin rostro propio, y una persona sin
 * rostro registrado es justo la que el reconocimiento confunde con su parecido.
 * Con las dos registradas, el margen de `matchFace` las distingue.
 */
export const FACE_SAME_PERSON_DISTANCE = 0.3;

/**
 * La otra ficha que ya tiene esta misma cara, o `null`.
 *
 * Es el error que dejo un rostro copiado en 15 fichas: registrar delante de la
 * camara a la persona equivocada, o la misma para varias fichas.
 */
export function findConflictingFace(
  descriptor: number[],
  candidates: FaceCandidate[],
  ownId: string
): { id: string; distance: number } | null {
  let closest: { id: string; distance: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.id === ownId) {
      continue;
    }
    const distance = faceDistance(descriptor, candidate.descriptor);
    if (distance < FACE_SAME_PERSON_DISTANCE &&
      (!closest || distance < closest.distance)) {
      closest = { id: candidate.id, distance };
    }
  }
  return closest;
}
