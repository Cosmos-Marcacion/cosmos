/**
 * Extremos del recorrido de marcacion.
 *
 * El inicial es el punto de menor `order` y el final el de mayor. No se deduce
 * del numero de puntos (`order === points.length`) ni de un valor fijo
 * (`order === 8`): al borrar puntos el `order` deja huecos (hoy son 1 y 5) y
 * con esa cuenta no habia punto final, asi que toda marcacion fallaba.
 *
 * Con un solo punto, inicio y fin son el mismo.
 */
export function routeEnds<T extends { order?: number }>(
  points: readonly T[]
): { start?: T; end?: T } {
  let start: T | undefined
  let end: T | undefined
  for (const point of points) {
    const order = point.order ?? 0
    if (!start || order < (start.order ?? 0)) start = point
    if (!end || order > (end.order ?? 0)) end = point
  }
  return { start, end }
}
