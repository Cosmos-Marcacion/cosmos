/**
 * Escritura sobre el texto preimpreso de la plantilla.
 *
 * La hoja CHARLA no tiene celdas para el tipo de capacitacion, el lugar ni el
 * programa anual. Trae una sola celda combinada por fila con todas las opciones
 * escritas dentro y un "Marcar (X)" al lado, porque el formato del cliente esta
 * pensado para rellenarse a mano:
 *
 *     A7  "Marcar (X)"
 *     A8  "        Induccion            Capacitacion        ...        Otros:______"
 *
 * En vez de rehacer esa maquetacion -- es un documento controlado, y cambiarla
 * no depende de nosotros -- se escribe *encima*: se sustituyen espacios por la
 * marca sin anadir ni quitar caracteres. El texto conserva su longitud, asi que
 * cada opcion sigue cayendo en la misma posicion impresa y la hoja sale igual
 * que la que firma el cliente, solo que ya marcada.
 *
 * Todas las funciones devuelven el texto intacto cuando no encuentran donde
 * escribir. Si el dia de manana el cliente cambia una etiqueta, el formato sale
 * sin marcar en vez de salir descuadrado.
 */

/** Sustituye `replacement` sobre `text` a partir de `start`, sin alargarlo. */
export function overlay(text: string, start: number, replacement: string): string {
  if (start < 0 || start >= text.length) {
    return text
  }
  return text.slice(0, start) + replacement + text.slice(start + replacement.length)
}

/**
 * Marca una de las opciones de una lista preimpresa.
 *
 * La marca se coloca en los espacios que preceden a la etiqueta, dejando uno de
 * separacion. Si ahi no hay hueco -- porque la etiqueta va pegada a la anterior
 * -- se deja sin marcar antes que pisar texto.
 */
export function markOption(text: string, label: string, mark = 'X'): string {
  const start = text.indexOf(label)
  if (start < 0) {
    return text
  }
  const at = start - 1 - mark.length
  if (at < 0) {
    return text
  }
  if (text.slice(at, at + mark.length).trim() !== '') {
    return text
  }
  return overlay(text, at, mark)
}

/**
 * Rellena el hueco de subrayados de una etiqueta (`"N° Horas: ___________"`).
 *
 * El valor va centrado en el hueco y lo que sobra sigue siendo subrayado, que
 * es como queda un formato rellenado a mano.
 */
export function fillBlank(text: string, value: string): string {
  const match = /_{2,}/.exec(text)
  if (!match) {
    return text
  }
  const width = match[0].length
  const written = (value ?? '').trim().slice(0, width)
  if (!written) {
    return text
  }
  const left = Math.floor((width - written.length) / 2)
  const filled = '_'.repeat(left) + written + '_'.repeat(width - left - written.length)
  return overlay(text, match.index, filled)
}

/**
 * Escribe un valor en los espacios que siguen a una etiqueta
 * (`"Nombre:                    Fecha:"`).
 *
 * Si esos espacios llegan al final del texto no hay nada que pisar a la derecha
 * y el valor se anade; en cualquier otro caso se recorta a lo que quepa, para
 * no desplazar la etiqueta siguiente.
 */
export function fillAfter(text: string, label: string, value: string): string {
  const index = text.indexOf(label)
  if (index < 0) {
    return text
  }
  const written = (value ?? '').trim()
  if (!written) {
    return text
  }

  const from = index + label.length
  const run = /^ +/.exec(text.slice(from))?.[0] ?? ''
  const atEnd = from + run.length >= text.length
  const chunk = ` ${written}`

  if (atEnd) {
    return text.slice(0, from) + chunk
  }
  if (chunk.length > run.length) {
    return overlay(text, from, chunk.slice(0, run.length))
  }
  return overlay(text, from, chunk)
}
