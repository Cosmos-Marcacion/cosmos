/**
 * El modelo de documento del motor v2, tal como lo devuelve el backend.
 *
 * Es un espejo de `cosmos-back/src/modules/format/v2/document-model.ts`. La
 * vista de impresion y el maestro leen esto y nada mas: el frontend no sabe de
 * plantillas `.xlsx` ni de coordenadas de celda.
 */

export type FieldSource = string
export type FieldTransform = string

export interface IImageRef {
  sha1: string
  alt: string
  widthMm?: number
  heightMm?: number
}

// --- documento resuelto (lo que se imprime) ----------------------------------

export interface IResolvedField {
  id: string
  label: string
  value: string
  span?: number
}

export interface IResolvedHeaderSection {
  kind: 'header'
  id: string
  title: string
  logo?: IImageRef
  documentCode?: string
  documentVersion?: string
  documentDate?: string
  /** `null` si el documento no lleva indicador de pagina. */
  pages: number | null
  fields: IResolvedField[]
}

export interface IResolvedFieldsSection {
  kind: 'fields'
  id: string
  title?: string
  columns: number
  fields: IResolvedField[]
}

export interface IResolvedChecklistSection {
  kind: 'checklist'
  id: string
  title?: string
  columns: number
  items: { id: string; label: string; checked: boolean; image?: IImageRef }[]
}

export interface IResolvedTableSection {
  kind: 'table'
  id: string
  title?: string
  columns: { id: string; label: string; widthMm: number; align: 'left' | 'center' | 'right' }[]
  rows: string[][]
  /**
   * Firma de cada casilla, con la misma forma que `rows`: `null` donde no hay
   * firma que imprimir, que son casi todas. Va aparte para que `rows` siga
   * siendo texto.
   */
  signatures: (string | null)[][]
  rowsPerPage: number
  pages: number
}

/**
 * Contenido de una celda.
 *
 * Cinco clases y no más: texto preimpreso, un dato de la jornada, una casilla
 * de verificación, una imagen de la plantilla y la firma registrada de quien
 * firma. La firma es la única que no viene de la plantilla: la hoja deja el
 * hueco en blanco y esta clase lo rellena cuando la persona ya la registró.
 */
export type ICellContent =
  /**
   * Texto preimpreso. `marked` lo imprime marcado con una X (`SI` sale como
   * `X SI`, y `(   )` como `( X )`). Lo resuelve el back.
   */
  | { kind: 'text'; text: string; marked?: boolean }
  | { kind: 'data'; source: string; transform?: string; label?: string }
  /**
   * Una casilla de verificación.
   *
   * `when` la marca sola cuando el campo indicado vale eso; sin `when` sale con
   * el valor fijo de `checked`, para rellenar a mano. Las tres casillas de
   * jornada de la hoja de asistencia son del primer tipo: dependen del turno de
   * la nombrada, no de quien firma.
   *
   * Quien la resuelve es el back; aquí llega ya resuelta en `checked` dentro de
   * la celda del documento. `when` viaja en la **definición**, que es lo que
   * edita el maestro.
   */
  | {
      kind: 'check'
      checked?: boolean
      when?: { source: string; transform?: string; equals: string }
    }
  | { kind: 'image'; images: IImageRef[]; text?: string }
  | { kind: 'signature'; source: string }
  | { kind: 'blank' }

/**
 * Una celda de una fila.
 *
 * **No lleva coordenadas.** Su sitio lo da el orden dentro de la fila y su
 * ancho en porcentaje, como una columna de WordPress. Es lo que permite añadir
 * una columna en medio sin recolocar nada.
 */
export interface IBlockCell {
  id: string
  width: number
  content: ICellContent
  bold?: boolean
  align?: 'left' | 'center' | 'right'
  fill?: boolean
  boxed?: boolean
  visible?: boolean
}

export interface IBlockRow {
  id: string
  cells: IBlockCell[]
  minHeightMm?: number
  visible?: boolean
}

// --- resuelto -----------------------------------------------------------------

export interface IResolvedCell {
  id: string
  width: number
  text: string
  kind: ICellContent['kind']
  checked: boolean
  images?: IImageRef[]
  /** URL de la firma ya resuelta. Vacía significa hueco en blanco, no error. */
  signatureUrl?: string
  bold: boolean
  align: 'left' | 'center' | 'right'
  fill: boolean
  boxed: boolean
}

export interface IResolvedRow {
  id: string
  cells: IResolvedCell[]
  minHeightMm?: number
}

export interface IResolvedRowsSection {
  kind: 'rows'
  id: string
  title?: string
  rows: IResolvedRow[]
}

export interface IResolvedSignaturesSection {
  kind: 'signatures'
  id: string
  title?: string
  columns: number
  slots: { id: string; label: string; name: string }[]
}

export type IResolvedSection =
  | IResolvedHeaderSection
  | IResolvedFieldsSection
  | IResolvedChecklistSection
  | IResolvedTableSection
  | IResolvedRowsSection
  | IResolvedSignaturesSection

export interface IResolvedDocument {
  id: string
  name: string
  orientation: 'portrait' | 'landscape'
  /** Hojas A4 que ocupa en la plantilla original. */
  printPages?: number
  pages: number
  /** Correlativo ya resuelto. Cadena vacia si el documento no lleva numero. */
  number: string
  sections: IResolvedSection[]
}

export interface IResolvedFormat {
  formatType: string
  label: string
  version: number
  engine: 'v2'
  documents: IResolvedDocument[]
}

// --- definicion (lo que edita el maestro) ------------------------------------

export interface INumberSeries {
  id: string
  prefix: string
  scope: 'year' | 'global'
  pad: number
}

export type INumberingSource =
  | { kind: 'none' }
  | { kind: 'own'; series: INumberSeries }
  | { kind: 'inherit'; from: string }
  | { kind: 'namedCode' }

export interface IFieldDefinition {
  id: string
  label: string
  source: FieldSource
  literal?: string
  transform?: FieldTransform
  visible?: boolean
  span?: number
}

export interface IColumnDefinition {
  id: string
  label: string
  source: string
  widthMm: number
  align?: 'left' | 'center' | 'right'
  fixedText?: { firstRow?: string; rest: string }
}

/**
 * Una sección de la definición.
 *
 * Es una forma plana en vez de una unión discriminada a propósito: el maestro
 * edita cualquier tipo con el mismo código y no puede saber en tiempo de
 * compilación cuál está tocando. El backend sí la valida con el tipo estricto
 * antes de publicar, que es donde importa.
 */
export interface ISectionDefinition {
  kind: 'header' | 'fields' | 'checklist' | 'table' | 'rows' | 'signatures'
  id: string
  title?: string
  visible?: boolean
  columns?: number | IColumnDefinition[]
  fields?: IFieldDefinition[]
  items?: { id: string; label: string; image?: IImageRef; when?: any }[]
  slots?: { id: string; label: string; nameSource?: string }[]
  leadingRows?: { id: string; cargo: string; nameSource: string; documentSource?: string }[]
  minRows?: number
  rowsPerPage?: number
  logo?: IImageRef
  documentCode?: string
  documentVersion?: string
  documentDate?: string
  pageIndicator?: boolean
  /** Solo en las secciones `rows`. */
  rows?: IBlockRow[]
}

export interface IDocumentDefinition {
  id: string
  name: string
  /** Nombre corto y estable del documento: Asistencia, Charla, PTS, ATS. */
  label?: string
  documentCode?: string
  documentVersion?: string
  documentDate?: string
  orientation: 'portrait' | 'landscape'
  numbering?: INumberingSource
  /** Hojas A4 que ocupa en la plantilla original. */
  printPages?: number
  sections: ISectionDefinition[]
}

export interface IFormatDefinition {
  formatType: string
  label: string
  version: number
  documents: IDocumentDefinition[]
}

export interface IValidationIssue {
  path: string
  message: string
}

/**
 * Un borrador que se quedo atras.
 *
 * La definicion publicada avanza sola cuando cambian las plantillas de fabrica.
 * Un borrador guardado antes de eso ya no describe el mismo documento, asi que
 * el servidor sirve lo publicado y manda esto para poder explicarlo. El
 * borrador sigue guardado: se puede cargar a proposito o descartar.
 */
export interface IStaleDraft {
  /** Version de la que salio. `null` si es anterior a que se anotara. */
  baseVersion: number | null
  publishedVersion: number
  updatedBy?: string
  updatedAt?: string
}

export interface IDefinitionResponse {
  published: IFormatDefinition
  draft: IFormatDefinition
  issues: IValidationIssue[]
  /** Presente solo cuando hay un borrador que no se esta sirviendo. */
  staleDraft?: IStaleDraft | null
}

export interface IDefinitionSummary {
  formatType: string
  label: string
  version: number
  hasDraft: boolean
}

/** Catalogos cerrados que admite el motor. La pantalla se construye con ellos. */
export interface IFormatCatalog {
  sources: string[]
  transforms: string[]
  personColumns: string[]
  sectionKinds: string[]
  numberingKinds: string[]
  numberingScopes: ('year' | 'global')[]
  orientations: ('portrait' | 'landscape')[]
}

export interface IDefinitionVersion {
  version: number
  label: string
  publishedBy?: string
  publishedAt: string
}

/** Que le paso a un elemento entre dos versiones. */
export type ChangeKind = 'added' | 'removed' | 'moved' | 'changed'

/** A que nivel del documento ocurrio el cambio. */
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

export interface IDefinitionChange {
  kind: ChangeKind
  scope: ChangeScope
  /** Documento donde ocurre. Vacio si el cambio es del formato entero. */
  document?: string
  /** Bloque dentro del documento. Vacio si el cambio es del documento. */
  section?: string
  target: string
  detail?: string
}

/**
 * Lo que cambio entre dos versiones, ya resuelto por el servidor.
 *
 * La comparacion no se hace aqui: una definicion pasa de 110 KB y traer dos
 * arboles completos por cada version que alguien despliega gastaria medio
 * megabyte para pintar treinta lineas.
 */
export interface IDefinitionDiff {
  /** `null` en la primera publicacion: no hay nada anterior con que comparar. */
  from: number | null
  to: number
  changes: IDefinitionChange[]
  summary: { added: number; removed: number; changed: number; moved: number }
  /** `true` cuando la lista se corto por larga. */
  truncated: boolean
}
