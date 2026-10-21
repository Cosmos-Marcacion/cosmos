import { NumberSeries } from '../../../common/numbering/document-number.service'

/**
 * De donde saca su numero un documento.
 *
 * - `own`: consume su propia serie. Es el caso normal.
 * - `inherit`: usa el numero que ya tiene otro documento de la misma nombrada,
 *   sin consumir uno propio. Es lo que en la plantilla actual hacia la formula
 *   `Z63 = T6`, el pie del permiso de trabajo repitiendo el N.o de su cabecera,
 *   y sirve igual para dos documentos que deban compartir correlativo.
 * - `namedCode`: el codigo de nombrada de Visma. Es lo que imprime hoy el
 *   `N° ATS`, y se conserva como opcion para poder emitir como siempre.
 * - `none`: el documento no lleva numero.
 */
export type NumberingSource =
  | { kind: 'none' }
  | { kind: 'own'; series: NumberSeries }
  | { kind: 'inherit'; from: string }
  | { kind: 'namedCode' }

export const NUMBERING_KINDS = ['none', 'own', 'inherit', 'namedCode'] as const

/** Numero resuelto de un documento, listo para imprimir. */
export interface DocumentNumbers {
  /** Por `documentId`. Los documentos sin numero no aparecen. */
  byDocument: Map<string, string>
}

export interface NumberingError {
  documentId: string
  message: string
}

/**
 * Comprueba que las dependencias entre numeraciones se pueden resolver.
 *
 * Tres cosas pueden estar mal y las tres dejan un formato que no se puede
 * emitir, asi que se detectan al publicar la definicion y no al descargar:
 *
 * 1. Heredar de un documento que no existe.
 * 2. Heredar de un documento que a su vez no tiene numero.
 * 3. Un ciclo. `A hereda de B` y `B hereda de A` no tiene solucion, y sin esta
 *    comprobacion la resolucion entraria en un bucle infinito.
 */
export function validateNumbering(
  documents: { id: string; numbering?: NumberingSource }[]
): NumberingError[] {
  const errors: NumberingError[] = []
  const byId = new Map<string, NumberingSource>()
  for (const doc of documents) {
    byId.set(doc.id, doc.numbering ?? { kind: 'none' })
  }

  for (const doc of documents) {
    const numbering = byId.get(doc.id) as NumberingSource
    if (numbering.kind !== 'inherit') {
      continue
    }

    // Se sigue la cadena de herencia. Si vuelve a pasar por un documento ya
    // visitado, hay ciclo; si llega a uno que no existe o que no numera, la
    // herencia no tiene de donde tomar el valor.
    const seen = new Set<string>([doc.id])
    let cursor: NumberingSource = numbering
    while (cursor.kind === 'inherit') {
      const target = cursor.from
      if (!byId.has(target)) {
        errors.push({
          documentId: doc.id,
          message: `hereda la numeracion de "${target}", que no existe en este formato`,
        })
        break
      }
      if (seen.has(target)) {
        errors.push({
          documentId: doc.id,
          message: `la herencia de numeracion forma un ciclo en "${target}"`,
        })
        break
      }
      seen.add(target)
      cursor = byId.get(target) as NumberingSource
      if (cursor.kind === 'none') {
        errors.push({
          documentId: doc.id,
          message: `hereda la numeracion de "${target}", que no lleva numero`,
        })
        break
      }
    }
  }

  return errors
}

/**
 * Orden en que hay que resolver los documentos para que cada herencia encuentre
 * ya calculado aquel del que cuelga.
 *
 * Es un orden topologico sobre las aristas de herencia. Se asume que
 * `validateNumbering` no ha devuelto errores; con un ciclo, los documentos
 * implicados se devuelven al final y su herencia quedara vacia en vez de colgar
 * el proceso.
 */
export function numberingOrder(
  documents: { id: string; numbering?: NumberingSource }[]
): string[] {
  const byId = new Map<string, NumberingSource>()
  for (const doc of documents) {
    byId.set(doc.id, doc.numbering ?? { kind: 'none' })
  }

  const ordered: string[] = []
  const placed = new Set<string>()
  const visiting = new Set<string>()

  const visit = (id: string) => {
    if (placed.has(id) || visiting.has(id) || !byId.has(id)) {
      return
    }
    visiting.add(id)
    const numbering = byId.get(id) as NumberingSource
    if (numbering.kind === 'inherit') {
      visit(numbering.from)
    }
    visiting.delete(id)
    placed.add(id)
    ordered.push(id)
  }

  for (const doc of documents) {
    visit(doc.id)
  }
  // Los documentos atrapados en un ciclo no llegan a `placed`; van al final.
  for (const doc of documents) {
    if (!placed.has(doc.id)) {
      ordered.push(doc.id)
    }
  }
  return ordered
}
