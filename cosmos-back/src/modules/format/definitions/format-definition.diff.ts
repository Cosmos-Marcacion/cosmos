import {
  BlockCell,
  BlockRow,
  CellContent,
  DocumentDefinition,
  FormatDefinition,
  SectionDefinition,
} from '../v2/document-model'

/**
 * Que cambio entre dos definiciones de un formato.
 *
 * El historial ya guardaba una copia entera de cada publicacion, pero solo
 * servia para revertir: la pantalla podia decir "v4, 12/03, lo publico fulano"
 * y nada mas. Saber **que** cambio obligaba a cargar las dos versiones y
 * compararlas a ojo, y una definicion pasa de 110 KB.
 *
 * La comparacion se hace aqui y no en el navegador por eso mismo: mandar dos
 * arboles completos para que el cliente los recorra gasta medio megabyte por
 * cada version que alguien despliega, y la respuesta util son treinta lineas.
 *
 * **Todo se empareja por `id`.** El modelo declara los identificadores
 * estables — "es lo que no cambia cuando se renombra la etiqueta" —, asi que
 * renombrar un campo sale como un cambio de etiqueta y no como un borrado mas
 * un alta. Comparar por posicion daria justo lo contrario: insertar una fila
 * arriba marcaria como modificadas todas las de debajo.
 */

/** Que le paso a la cosa. */
export type ChangeKind = 'added' | 'removed' | 'moved' | 'changed'

/**
 * A que nivel del documento ocurrio, para poder agrupar y filtrar en pantalla
 * sin volver a interpretar el texto.
 */
export type ChangeScope =
  | 'definition'
  | 'document'
  | 'section'
  | 'field'
  | 'column'
  | 'item'
  | 'slot'
  | 'row'
  | 'cell'

export interface DefinitionChange {
  kind: ChangeKind
  scope: ChangeScope
  /** Documento donde ocurre, con su nombre legible. Vacio si es del formato. */
  document?: string
  /** Bloque dentro del documento. Vacio si el cambio es del documento entero. */
  section?: string
  /** Que ha cambiado, dicho como se llama en pantalla. */
  target: string
  /** El detalle: valor anterior y nuevo, o la propiedad tocada. */
  detail?: string
}

export interface DefinitionDiff {
  /** Version de partida. `null` cuando no hay nada anterior con que comparar. */
  from: number | null
  to: number
  changes: DefinitionChange[]
  summary: { added: number; removed: number; changed: number; moved: number }
  /**
   * `true` cuando se corto la lista. Una restauracion de fabrica reescribe el
   * formato entero y produce miles de entradas; pintarlas todas no informa mas
   * que las primeras y sube la respuesta a varios megabytes.
   */
  truncated: boolean
}

/** Tope de cambios que se devuelven. Ver `truncated`. */
const MAX_CHANGES = 400

/** Nombre legible de cada tipo de bloque. El mismo que usa el maestro. */
const SECTION_KIND_LABELS: Record<string, string> = {
  header: 'Cabecera',
  fields: 'Campos',
  checklist: 'Lista de verificacion',
  table: 'Lista de personal',
  rows: 'Bloque de filas',
  signatures: 'Firmas',
}

/**
 * Propiedades que se comparan una a una, con el nombre que tienen en el
 * maestro. Lo que no esta aqui no genera linea: `id`, listas de hijos (que
 * tienen su propio recorrido) y detalles internos que no significan nada para
 * quien configura.
 */
const PROPERTY_LABELS: Record<string, string> = {
  label: 'etiqueta',
  title: 'titulo',
  name: 'nombre',
  source: 'origen',
  literal: 'texto fijo',
  transform: 'formato',
  visible: 'visibilidad',
  span: 'ancho',
  width: 'ancho',
  widthMm: 'ancho (mm)',
  align: 'alineacion',
  bold: 'negrita',
  fill: 'fondo',
  boxed: 'recuadro',
  columns: 'columnas',
  rowsPerPage: 'filas por pagina',
  minRows: 'filas minimas',
  minHeightMm: 'alto minimo (mm)',
  orientation: 'orientacion',
  documentCode: 'codigo del documento',
  documentVersion: 'version del documento',
  documentDate: 'fecha del documento',
  pageIndicator: 'indicador de pagina',
  cargo: 'cargo',
  nameSource: 'origen del nombre',
  documentSource: 'origen del documento',
  equals: 'condicion',
  text: 'texto',
  alt: 'texto alternativo',
}

/** Como se lee un valor suelto dentro de "de X a Y". */
function readable(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return 'vacio'
  }
  if (value === true) {
    return 'si'
  }
  if (value === false) {
    return 'no'
  }
  if (Array.isArray(value)) {
    return `${value.length} elemento${value.length === 1 ? '' : 's'}`
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  const text = String(value)
  return text.length > 60 ? `${text.slice(0, 57)}...` : text
}

/**
 * Nombre con el que se conoce a un elemento en pantalla.
 *
 * Se recorta: el titulo de una seccion del ATS es un parrafo entero
 * ("SECCION II: REQUISITOS DE SEGURIDAD GENERAL (Supervisor responsable del
 * Area de Trabajo) CONFORME: u NO CONFORME: X..."), y repetido en cada linea
 * del historial tapa el cambio, que es lo que se viene a leer.
 */
function nameOf(item: any, fallback: string): string {
  const named = item?.label || item?.title || item?.name || item?.cargo
  if (!named) {
    return fallback
  }
  const text = String(named).replace(/\s+/g, ' ').trim()
  return text.length > 64 ? `${text.slice(0, 61)}...` : text
}

/**
 * Como se resume el contenido de una celda de la rejilla preimpresa.
 *
 * Una celda no tiene etiqueta propia: su identidad es lo que dice. Sin esto,
 * el historial de un permiso de trabajo — doscientas y pico casillas — seria
 * una lista de identificadores que no significan nada.
 */
function cellSummary(content: CellContent | undefined): string {
  if (!content) {
    return 'celda'
  }
  switch (content.kind) {
    case 'text':
      return content.text
        ? `"${readable(content.text)}"${content.marked ? ' marcado' : ''}`
        : 'texto vacio'
    case 'data':
      return `dato ${content.source}`
    case 'check':
      return content.checked && !content.when ? 'casilla marcada' : 'casilla'
    case 'image':
      return content.text ? `imagen "${content.text}"` : 'imagen'
    case 'blank':
      return 'celda en blanco'
    default:
      return 'celda'
  }
}

/** Acumula cambios y corta cuando ya hay bastantes. */
class ChangeLog {
  readonly changes: DefinitionChange[] = []
  truncated = false

  add(change: DefinitionChange): void {
    if (this.changes.length >= MAX_CHANGES) {
      this.truncated = true
      return
    }
    this.changes.push(change)
  }

  get full(): boolean {
    return this.changes.length >= MAX_CHANGES
  }
}

/** Contexto de donde estamos mirando, para etiquetar cada linea. */
interface Where {
  document?: string
  section?: string
}

/** Compara las propiedades sueltas de dos objetos del mismo tipo. */
function compareProperties(
  log: ChangeLog,
  before: any,
  after: any,
  keys: string[],
  where: Where,
  scope: ChangeScope,
  target: string
): void {
  for (const key of keys) {
    const previous = before?.[key]
    const next = after?.[key]
    if (sameValue(previous, next)) {
      continue
    }
    log.add({
      kind: 'changed',
      scope,
      ...where,
      target,
      detail: `${PROPERTY_LABELS[key] ?? key}: ${readable(previous)} → ${readable(next)}`,
    })
  }
}

/**
 * Igualdad para efectos del historial.
 *
 * `undefined`, `null` y `''` cuentan como lo mismo: el maestro deja campos
 * opcionales sin escribir y guardar dos veces la misma pantalla no puede salir
 * como una modificacion.
 */
function sameValue(a: unknown, b: unknown): boolean {
  const empty = (v: unknown) => v === undefined || v === null || v === ''
  if (empty(a) && empty(b)) {
    return true
  }
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  }
  return a === b
}

interface Pair<T> {
  before: T
  after: T
  movedFrom: number
  movedTo: number
  /** El elemento cambio de sitio de verdad. Ver `markMoves`. */
  moved: boolean
}

/**
 * Cuales de los elementos comunes han cambiado de sitio **de verdad**.
 *
 * Comparar el indice de antes con el de despues no vale: borrar la fila 4 de un
 * bloque de nueve sube una posicion a las cinco de debajo, y el historial
 * salia con seis lineas — un borrado y cinco movimientos — cuando lo unico que
 * paso fue el borrado.
 *
 * Lo que interesa es el **orden relativo** entre los que siguen estando. Se
 * busca la subsecuencia creciente mas larga de los indices de destino: esos
 * son los que mantienen su orden entre si, y los demas son los que se han
 * movido. Es el conjunto minimo de movimientos que explica la reordenacion.
 */
function markMoves<T>(pairs: Pair<T>[]): void {
  const byOrigin = [...pairs].sort((a, b) => a.movedFrom - b.movedFrom)
  const targets = byOrigin.map(pair => pair.movedTo)

  // Subsecuencia creciente mas larga, con reconstruccion.
  const tails: number[] = []
  const tailIndex: number[] = []
  const previous: number[] = new Array(targets.length).fill(-1)

  for (let i = 0; i < targets.length; i++) {
    let low = 0
    let high = tails.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (tails[middle] < targets[i]) {
        low = middle + 1
      } else {
        high = middle
      }
    }
    tails[low] = targets[i]
    tailIndex[low] = i
    previous[i] = low > 0 ? tailIndex[low - 1] : -1
  }

  const stable = new Set<number>()
  for (let i = tailIndex.length > 0 ? tailIndex[tailIndex.length - 1] : -1; i >= 0; i = previous[i]) {
    stable.add(i)
  }

  byOrigin.forEach((pair, i) => {
    pair.moved = !stable.has(i)
  })
}

/**
 * Recorre dos listas emparejando por `id`.
 *
 * Devuelve las altas, las bajas y los que siguen en ambas, estos ultimos ya
 * marcados con si se han movido. El orden importa: en un formato preimpreso
 * mover una fila cambia el documento.
 */
function pairById<T extends { id?: string }>(
  before: T[] = [],
  after: T[] = []
): { added: T[]; removed: T[]; common: Pair<T>[] } {
  const beforeIndex = new Map<string, { item: T; at: number }>()
  before.forEach((item, at) => {
    if (item?.id) {
      beforeIndex.set(item.id, { item, at })
    }
  })

  const added: T[] = []
  const common: Pair<T>[] = []
  const seen = new Set<string>()

  after.forEach((item, at) => {
    const previous = item?.id ? beforeIndex.get(item.id) : undefined
    if (!previous) {
      added.push(item)
      return
    }
    seen.add(item.id!)
    common.push({
      before: previous.item,
      after: item,
      movedFrom: previous.at,
      movedTo: at,
      moved: false,
    })
  })

  markMoves(common)

  const removed = before.filter(item => item?.id && !seen.has(item.id))
  return { added, removed, common }
}

/**
 * Las listas de hijos que cuelgan de cada tipo de bloque.
 *
 * Se recorren aparte de las propiedades sueltas: `compareProperties` sobre
 * `fields` diria "campos: 4 elementos → 5 elementos", que no es el cambio, es
 * el sintoma.
 */
interface ChildList {
  key: string
  scope: ChangeScope
  noun: string
  /** El genero del sustantivo, para que "columna nuevo" no salga en pantalla. */
  feminine?: boolean
}

const SECTION_CHILDREN: Record<string, ChildList[]> = {
  header: [{ key: 'fields', scope: 'field', noun: 'campo' }],
  fields: [{ key: 'fields', scope: 'field', noun: 'campo' }],
  checklist: [{ key: 'items', scope: 'item', noun: 'elemento' }],
  table: [
    { key: 'columns', scope: 'column', noun: 'columna', feminine: true },
    { key: 'leadingRows', scope: 'row', noun: 'fila fija', feminine: true },
  ],
  signatures: [{ key: 'slots', scope: 'slot', noun: 'firma', feminine: true }],
  rows: [],
}

/** Propiedades sueltas por tipo de bloque. */
const SECTION_PROPERTIES: Record<string, string[]> = {
  header: ['title', 'visible', 'documentCode', 'documentVersion', 'documentDate', 'pageIndicator', 'logo'],
  fields: ['title', 'visible', 'columns'],
  checklist: ['title', 'visible', 'columns'],
  table: ['title', 'visible', 'rowsPerPage', 'minRows'],
  rows: ['title', 'visible'],
  signatures: ['title', 'visible', 'columns'],
}

/** Propiedades comparables de cada clase de hijo. */
const CHILD_PROPERTIES: Record<ChangeScope, string[]> = {
  definition: [],
  document: [],
  section: [],
  field: ['label', 'source', 'literal', 'transform', 'visible', 'span'],
  column: ['label', 'source', 'widthMm', 'align', 'fixedText'],
  item: ['label', 'image', 'when'],
  slot: ['label', 'nameSource'],
  row: ['cargo', 'nameSource', 'documentSource', 'minHeightMm', 'visible'],
  cell: ['width', 'bold', 'align', 'fill', 'boxed', 'visible'],
}

/** Compara una lista de hijos simples (campos, columnas, elementos, firmas). */
function compareChildren(
  log: ChangeLog,
  before: any[] = [],
  after: any[] = [],
  child: ChildList,
  where: Where
): void {
  const { scope, noun } = child
  const nueva = child.feminine ? 'nueva' : 'nuevo'
  const eliminada = child.feminine ? 'eliminada' : 'eliminado'
  const { added, removed, common } = pairById(before, after)

  for (const item of added) {
    log.add({ kind: 'added', scope, ...where, target: nameOf(item, noun), detail: `${noun} ${nueva}` })
  }
  for (const item of removed) {
    log.add({ kind: 'removed', scope, ...where, target: nameOf(item, noun), detail: `${noun} ${eliminada}` })
  }
  for (const pair of common) {
    const target = nameOf(pair.after, nameOf(pair.before, noun))
    compareProperties(log, pair.before, pair.after, CHILD_PROPERTIES[scope], where, scope, target)
    if (pair.moved) {
      log.add({
        kind: 'moved',
        scope,
        ...where,
        target,
        detail: `de la posicion ${pair.movedFrom + 1} a la ${pair.movedTo + 1}`,
      })
    }
    if (log.full) {
      return
    }
  }
}

/** Las filas de un bloque preimpreso y las celdas de cada una. */
function compareRows(log: ChangeLog, before: BlockRow[] = [], after: BlockRow[] = [], where: Where): void {
  const { added, removed, common } = pairById(before, after)

  for (const row of added) {
    log.add({
      kind: 'added',
      scope: 'row',
      ...where,
      target: `fila de ${row.cells?.length ?? 0} celdas`,
      detail: 'fila nueva',
    })
  }
  for (const row of removed) {
    log.add({
      kind: 'removed',
      scope: 'row',
      ...where,
      target: `fila de ${row.cells?.length ?? 0} celdas`,
      detail: 'fila eliminada',
    })
  }

  for (const pair of common) {
    if (log.full) {
      return
    }
    const rowLabel = `fila ${pair.movedTo + 1}`
    compareProperties(log, pair.before, pair.after, CHILD_PROPERTIES['row'], where, 'row', rowLabel)
    if (pair.moved) {
      log.add({
        kind: 'moved',
        scope: 'row',
        ...where,
        target: rowLabel,
        detail: `de la posicion ${pair.movedFrom + 1} a la ${pair.movedTo + 1}`,
      })
    }
    compareCells(log, pair.before.cells, pair.after.cells, where, rowLabel)
  }
}

function compareCells(
  log: ChangeLog,
  before: BlockCell[] = [],
  after: BlockCell[] = [],
  where: Where,
  rowLabel: string
): void {
  const { added, removed, common } = pairById(before, after)

  for (const cell of added) {
    log.add({
      kind: 'added',
      scope: 'cell',
      ...where,
      target: `${rowLabel} · ${cellSummary(cell.content)}`,
      detail: 'celda nueva',
    })
  }
  for (const cell of removed) {
    log.add({
      kind: 'removed',
      scope: 'cell',
      ...where,
      target: `${rowLabel} · ${cellSummary(cell.content)}`,
      detail: 'celda eliminada',
    })
  }

  for (const pair of common) {
    if (log.full) {
      return
    }
    const target = `${rowLabel} · ${cellSummary(pair.after.content)}`
    compareProperties(log, pair.before, pair.after, CHILD_PROPERTIES['cell'], where, 'cell', target)

    // El contenido va aparte porque es una union discriminada: comparar el
    // objeto entero solo diria "cambio", y lo que se necesita saber es si el
    // texto preimpreso ahora dice otra cosa.
    if (!sameValue(pair.before.content, pair.after.content)) {
      log.add({
        kind: 'changed',
        scope: 'cell',
        ...where,
        target,
        detail: `contenido: ${cellSummary(pair.before.content)} → ${cellSummary(pair.after.content)}`,
      })
    }
  }
}

function compareSections(
  log: ChangeLog,
  before: SectionDefinition[] = [],
  after: SectionDefinition[] = [],
  documentLabel: string
): void {
  const { added, removed, common } = pairById(before as any[], after as any[])

  for (const section of added) {
    log.add({
      kind: 'added',
      scope: 'section',
      document: documentLabel,
      target: nameOf(section, SECTION_KIND_LABELS[(section as any).kind] ?? 'bloque'),
      detail: `bloque nuevo de tipo ${SECTION_KIND_LABELS[(section as any).kind] ?? (section as any).kind}`,
    })
  }
  for (const section of removed) {
    log.add({
      kind: 'removed',
      scope: 'section',
      document: documentLabel,
      target: nameOf(section, SECTION_KIND_LABELS[(section as any).kind] ?? 'bloque'),
      detail: 'bloque eliminado',
    })
  }

  for (const pair of common) {
    if (log.full) {
      return
    }
    const previous = pair.before as any
    const next = pair.after as any
    const sectionLabel = nameOf(next, SECTION_KIND_LABELS[next.kind] ?? 'bloque')
    const where: Where = { document: documentLabel, section: sectionLabel }

    if (previous.kind !== next.kind) {
      // Cambiar de tipo rehace el bloque entero: los hijos de uno no son
      // comparables con los del otro, asi que se anota y no se entra.
      log.add({
        kind: 'changed',
        scope: 'section',
        document: documentLabel,
        target: sectionLabel,
        detail: `tipo: ${SECTION_KIND_LABELS[previous.kind] ?? previous.kind} → ${
          SECTION_KIND_LABELS[next.kind] ?? next.kind
        }`,
      })
      continue
    }

    compareProperties(
      log,
      previous,
      next,
      SECTION_PROPERTIES[next.kind] ?? ['title', 'visible'],
      { document: documentLabel },
      'section',
      sectionLabel
    )

    if (pair.moved) {
      log.add({
        kind: 'moved',
        scope: 'section',
        document: documentLabel,
        target: sectionLabel,
        detail: `de la posicion ${pair.movedFrom + 1} a la ${pair.movedTo + 1}`,
      })
    }

    if (next.kind === 'rows') {
      compareRows(log, previous.rows, next.rows, where)
      continue
    }

    for (const child of SECTION_CHILDREN[next.kind] ?? []) {
      compareChildren(log, previous[child.key], next[child.key], child, where)
    }
  }
}

/** Como se lee una numeracion, para no ensenar el objeto del modelo. */
function numberingSummary(numbering: any): string {
  if (!numbering || numbering.kind === 'none') {
    return 'sin numero'
  }
  if (numbering.kind === 'namedCode') {
    return 'codigo de nombrada'
  }
  if (numbering.kind === 'inherit') {
    return numbering.from ? `heredada de "${numbering.from}"` : 'heredada, sin origen'
  }
  const series = numbering.series ?? {}
  return `serie propia ${series.prefix ?? ''} (${series.scope ?? 'year'}, ${series.pad ?? 0} digitos)`
}

function compareDocuments(
  log: ChangeLog,
  before: DocumentDefinition[] = [],
  after: DocumentDefinition[] = []
): void {
  const { added, removed, common } = pairById(before, after)

  for (const document of added) {
    log.add({
      kind: 'added',
      scope: 'document',
      target: nameOf(document, document.id),
      detail: 'documento nuevo',
    })
  }
  for (const document of removed) {
    log.add({
      kind: 'removed',
      scope: 'document',
      target: nameOf(document, document.id),
      detail: 'documento eliminado',
    })
  }

  for (const pair of common) {
    if (log.full) {
      return
    }
    const label = nameOf(pair.after, pair.after.id)
    compareProperties(
      log,
      pair.before,
      pair.after,
      ['name', 'orientation', 'documentCode', 'documentVersion', 'documentDate'],
      {},
      'document',
      label
    )

    if (!sameValue(pair.before.numbering, pair.after.numbering)) {
      log.add({
        kind: 'changed',
        scope: 'document',
        target: label,
        detail: `numeracion: ${numberingSummary(pair.before.numbering)} → ${numberingSummary(
          pair.after.numbering
        )}`,
      })
    }

    if (pair.moved) {
      log.add({
        kind: 'moved',
        scope: 'document',
        target: label,
        detail: `de la posicion ${pair.movedFrom + 1} a la ${pair.movedTo + 1}`,
      })
    }

    compareSections(log, pair.before.sections, pair.after.sections, label)
  }
}

/**
 * Que cambio de `before` a `after`.
 *
 * `before` a `null` significa que no hay nada anterior: la primera publicacion
 * no es "todo nuevo", es simplemente el origen, y llenarla con una linea por
 * cada casilla del permiso de trabajo no dice nada. Se devuelve vacia.
 */
export function diffDefinitions(
  before: FormatDefinition | null,
  after: FormatDefinition
): DefinitionDiff {
  const log = new ChangeLog()

  if (before) {
    if (!sameValue(before.label, after.label)) {
      log.add({
        kind: 'changed',
        scope: 'definition',
        target: 'Nombre del formato',
        detail: `${readable(before.label)} → ${readable(after.label)}`,
      })
    }
    compareDocuments(log, before.documents, after.documents)
  }

  const summary = { added: 0, removed: 0, changed: 0, moved: 0 }
  for (const change of log.changes) {
    summary[change.kind] += 1
  }

  return {
    from: before ? before.version : null,
    to: after.version,
    changes: log.changes,
    summary,
    truncated: log.truncated,
  }
}
