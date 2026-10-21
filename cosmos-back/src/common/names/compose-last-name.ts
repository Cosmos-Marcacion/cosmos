/**
 * Apellidos de una persona a partir de los campos del sistema de nombradas.
 *
 * La documentacion de la API dice que `last_name` trae solo el paterno y
 * `mother_last_name` el materno, pero en produccion `last_name` ya llega con
 * los dos ("TORRES ROMERO" + "ROMERO"). Concatenar sin mirar imprimia
 * "TORRES ROMERO ROMERO". Solo se omite el materno cuando `last_name` ya
 * termina en el; no se eliminan palabras repetidas en general. Lo confirma la
 * misma nombrada: el jefe de cubierta, que viene de Visma, es "SALDARRIAGA
 * CRUZ", y en el personal salia "SALDARRIAGA CRUZ CRUZ".
 */
export function composeLastName(
  lastName?: string | null,
  motherLastName?: string | null
): string {
  const last = collapse(lastName)
  const mother = collapse(motherLastName)
  if (!mother) {
    return last
  }
  if (!last) {
    return mother
  }
  const lastKey = ` ${normalize(last)}`
  const motherKey = ` ${normalize(mother)}`
  // Si `last_name` es igual al materno ("ROMERO" + "ROMERO") no hay nada que
  // deducir: es el caso documentado y se concatena.
  if (lastKey.endsWith(motherKey) && lastKey !== motherKey) {
    return last
  }
  return `${last} ${mother}`
}

/** Apellidos seguidos de nombres, con espacios colapsados. */
export function composeFullName(
  lastName?: string | null,
  motherLastName?: string | null,
  firstName?: string | null
): string {
  return `${composeLastName(lastName, motherLastName)} ${collapse(firstName)}`.trim()
}

function collapse(value?: string | null): string {
  return (value ?? '').trim().replace(/\s+/g, ' ')
}

/** Solo para comparar: mayusculas y sin tildes. El resultado conserva el original. */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}
