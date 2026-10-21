import { NumberingSource } from './numbering'

/**
 * El modelo de documento del motor v2.
 *
 * Un formato es una lista de secciones, no una hoja de calculo. Esa es la
 * diferencia entera con el motor actual: aqui no hay celdas, hay contenido con
 * nombre, y de ese contenido salen las tres formas de entregarlo (Excel, PDF e
 * impresion del navegador). Ninguna puede omitir un dato que otra lleve porque
 * las tres leen esta misma lista.
 *
 * Hay dos capas y conviene no mezclarlas:
 *
 * - La **definicion** (`...Definition`) es lo que se edita en el maestro: que
 *   campos hay, como se llaman, de donde sale cada uno y en que orden van.
 *   No contiene datos de ninguna nombrada.
 * - El **documento** (`Document`) es el resultado de aplicar una definicion a
 *   los datos de una nombrada concreta. Es lo unico que ven los renderizadores.
 *
 * Los tipos de seccion son cinco y salen de medir las plantillas reales, no de
 * imaginar: cabecera, rejilla de campos, tabla, lista de verificacion y firmas.
 * Anadir un sexto no es configuracion, es codigo en los tres renderizadores.
 */

// --- catalogos cerrados ------------------------------------------------------

/**
 * De donde puede salir el valor de un campo.
 *
 * Es un catalogo cerrado a proposito. El informe de factibilidad insistia en
 * esto: con texto libre, la primera errata rompe el formato en silencio, que es
 * peor que romperlo a la vista.
 */
export const FIELD_SOURCES = [
  'nave',
  'fecha',
  'muelle',
  'turno',
  'jornada',
  'supervisorOperaciones',
  'jefeCubierta',
  'supervisorSsoma',
  'jefeCubiertaVsi',
  'ssomaVsi',
  'codigoNombrada',
  'numeroPermiso',
  /**
   * Numero de este documento, resuelto por la numeracion del formato.
   *
   * Es lo que imprime el `N° ATS` o el `N° PERMISO` de la cabecera. Un campo
   * con este origen no necesita saber de que serie sale ni si la hereda: eso lo
   * decide `numbering` a nivel de documento, y aqui llega ya resuelto.
   */
  'numeroDocumento',
  'temaCharla1',
  'temaCharla2',
  'temaCharla3',
  'resumenCharla1',
  'resumenCharla2',
  'resumenCharla3',
  'totalPersonal',
  /** Texto fijo escrito en la definicion. No depende de la nombrada. */
  'literal',
] as const

export type FieldSource = (typeof FIELD_SOURCES)[number]

/** Como se presenta el valor. Tambien cerrado, y por el mismo motivo. */
export const FIELD_TRANSFORMS = [
  /** Tal cual. */
  'texto',
  'mayusculas',
  /** `10/09/2025`. */
  'fechaCorta',
  /** `10 de septiembre de 2025`. */
  'fechaLarga',
  /** Del turno `07:00 - 15:00`, su hora de inicio: `07:00`. */
  'horaInicio',
  /** Del mismo turno, su hora de termino: `15:00`. */
  'horaFin',
  /** `1`, `2` o `3` segun la hora de inicio. */
  'numeroJornada',
  /** `NOMBRE APELLIDO - 12345678`. */
  'nombreYDocumento',
  /** Solo el nombre de una persona responsable. */
  'soloNombre',
  /** Solo su documento de identidad. */
  'soloDocumento',
  /** Cuatro digitos: `0012`. */
  'correlativo4',
] as const

export type FieldTransform = (typeof FIELD_TRANSFORMS)[number]

/** De donde sale cada columna de una tabla de personal. */
export const PERSON_COLUMNS = [
  'numero',
  'cargo',
  'nombre',
  'documento',
  'horaIngreso',
  'horaSalida',
  /** Columna en blanco, para firmar a mano. */
  'firma',
] as const

export type PersonColumn = (typeof PERSON_COLUMNS)[number]

// --- definicion --------------------------------------------------------------

/** Una imagen de la biblioteca de recursos, por su SHA-1. */
export interface ImageRef {
  sha1: string
  /** Texto alternativo. Obligatorio: sin el, la impresion pierde informacion. */
  alt: string
  widthMm?: number
  heightMm?: number
}

export interface FieldDefinition {
  /** Identificador estable. Es lo que no cambia cuando se renombra la etiqueta. */
  id: string
  label: string
  source: FieldSource
  /** Solo para `source: 'literal'`. */
  literal?: string
  transform?: FieldTransform
  /** Un campo oculto sigue en la definicion; simplemente no se pinta. */
  visible?: boolean
  /** Ancho relativo dentro de la rejilla de la seccion. */
  span?: number
}

export interface ColumnDefinition {
  id: string
  label: string
  source: PersonColumn
  /** Ancho en milimetros sobre la rejilla A4 compartida. */
  widthMm: number
  align?: 'left' | 'center' | 'right'
  /**
   * Texto fijo para esta columna, cuando el documento lo trae preimpreso en
   * lugar de sacarlo del dato.
   *
   * La hoja de ingles es el caso: su columna de cargo dice `FOREMAN` en la
   * primera fila del personal y `STEVEDORE` en el resto, sin mirar el cargo
   * real de cada uno. Es una lista para la tripulacion del buque y solo
   * distingue esos papeles. Escribir ahi el cargo en castellano que trae la
   * nombrada cambiaria el sentido del documento.
   *
   * No afecta a `leadingRows`, que llevan el suyo escrito.
   */
  fixedText?: { firstRow?: string; rest: string }
  /**
   * Imprime en esta columna la firma registrada de cada persona, en vez de
   * dejar el hueco para firmar a mano. Solo tiene sentido con `source: 'firma'`.
   *
   * Se declara por columna y no por tabla porque la hoja de asistencia lleva
   * **tres**: ingreso, refrigerio y salida. Son tres actos distintos, y estampar
   * la misma imagen en los tres es una decision del cliente, no algo que deba
   * pasar solo. De fabrica se marca la primera; las demas se activan desde el
   * maestro.
   */
  signature?: boolean
}

interface SectionDefinitionBase {
  id: string
  title?: string
  /** Una seccion oculta no se pinta en ninguna de las tres salidas. */
  visible?: boolean
}

export interface HeaderSectionDefinition extends SectionDefinitionBase {
  kind: 'header'
  title: string
  logo?: ImageRef
  /**
   * Codigo, version y fecha del documento controlado. Va aqui y no en el codigo
   * porque es justo lo que cambia cuando el cliente aprueba una revision.
   */
  documentCode?: string
  documentVersion?: string
  documentDate?: string
  /**
   * Imprime `Página: 1 de N`. La hoja original lo lleva escrito a mano como
   * `Página: 1 de 1`, que deja de ser cierto en cuanto el personal no cabe en
   * una pagina. Aqui lo pone el modelo, que es quien sabe cuantas hay.
   */
  pageIndicator?: boolean
  fields?: FieldDefinition[]
}

export interface FieldsSectionDefinition extends SectionDefinitionBase {
  kind: 'fields'
  columns: number
  fields: FieldDefinition[]
}

export interface ChecklistItemDefinition {
  id: string
  label: string
  image?: ImageRef
  /**
   * Marca la casilla cuando el campo indicado vale esto. Sin `when`, la casilla
   * sale siempre en blanco para rellenar a mano.
   */
  when?: { source: FieldSource; transform?: FieldTransform; equals: string }
}

export interface ChecklistSectionDefinition extends SectionDefinitionBase {
  kind: 'checklist'
  columns: number
  items: ChecklistItemDefinition[]
}

export interface TableSectionDefinition extends SectionDefinitionBase {
  kind: 'table'
  columns: ColumnDefinition[]
  /**
   * Filas fijas antes de la lista, con su cargo escrito y su persona tomada de
   * un campo. Es como la hoja de ingles pone al supervisor de operaciones y al
   * de SSOMA por encima del personal.
   */
  leadingRows?: {
    id: string
    cargo: string
    nameSource: FieldSource
    documentSource?: FieldSource
  }[]
  /**
   * Huecos que se imprimen aunque no haya nadie, para poder anadir a mano.
   * `0` deja la tabla del tamano exacto de la lista.
   */
  minRows?: number
  /** Filas por pagina impresa. La pagina se declara aqui, no la decide el medio. */
  rowsPerPage: number
}

/**
 * Una celda de la rejilla preimpresa.
 *
 * Lleva su posicion porque la hoja original la lleva: el ATS y el permiso de
 * trabajo son formularios de doscientas y pico casillas cuya disposicion **es**
 * el documento, y aplanarlos a una lista de campos perderia la relacion entre
 * lo que pregunta cada casilla y donde se responde.
 */
/**
 * Contenido de una celda.
 *
 * Cinco clases y no mas: texto preimpreso, un dato de la jornada, una casilla
 * de verificacion, una imagen de la plantilla y la firma registrada de quien
 * firma. Todo lo que traen los formatos del cliente cabe en estas cinco.
 *
 * La firma es la unica que no viene de la plantilla: la hoja deja el hueco en
 * blanco para firmar a mano, y lo que hace esta clase es rellenarlo cuando la
 * persona ya tiene su firma guardada.
 */
export type CellContent =
  /**
   * Texto preimpreso.
   *
   * `marked` lo imprime marcado con una X: es la respuesta fijada desde el
   * maestro en las casillas `SI` / `NO` / `NA` del permiso de trabajo, o el
   * `(   )` de los trabajos de alto riesgo del ATS. La marca no sustituye al
   * rotulo: sin el, una X en la columna de `SI` y otra en la de `NO` se leen
   * igual. Ver `markText`.
   */
  | { kind: 'text'; text: string; marked?: boolean }
  | {
      kind: 'data'
      source: FieldSource
      transform?: FieldTransform
      label?: string
    }
  /**
   * Una casilla de verificacion.
   *
   * `when` la marca sola cuando el campo indicado vale eso; sin `when` sale con
   * el valor fijo de `checked`, que es lo que se rellena a mano.
   *
   * Hace falta porque las hojas traen casillas que dependen de la jornada y no
   * del criterio de quien firma: la de asistencia marca cual de los tres turnos
   * es con `IF(GLOBAL!$B$7="15:00 HRS.","X"," ")`. Sin condicion, esas tres
   * casillas salian con la marca de la nombrada de ejemplo de la plantilla, y
   * el documento decia que la jornada era otra.
   */
  | {
      kind: 'check'
      checked?: boolean
      when?: { source: FieldSource; transform?: FieldTransform; equals: string }
    }
  /**
   * Una o varias imagenes en la misma celda.
   *
   * Es una lista y no una sola porque los 28 pictogramas de equipo de
   * proteccion del permiso de trabajo van en bandas de varios por casilla.
   * Guardar solo la primera perdia diez de ellos, y son contenido normativo.
   */
  | {
      kind: 'image'
      images: ImageRef[]
      /**
       * Rotulo de la imagen, cuando la casilla lleva las dos cosas.
       *
       * En el permiso de trabajo cada pictograma de equipo de proteccion tiene
       * su nombre debajo, en la misma celda: `Casco Dieléctrico`, `Zapatos
       * Seguridad`. Quedarse solo con la imagen perdia 21 rotulos.
       */
      text?: string
    }
  /**
   * La firma registrada de una persona.
   *
   * No es una imagen de la biblioteca: la biblioteca guarda lo que traen las
   * plantillas, y una firma es un dato de quien firma, distinto en cada
   * nombrada. Por eso lleva `source` y no `sha1`, y por eso se resuelve como se
   * resuelve un dato, no como se resuelve un pictograma.
   *
   * Sin firma registrada la casilla sale en blanco, que es el hueco de siempre
   * para firmar a mano.
   */
  | { kind: 'signature'; source: FieldSource }
  | { kind: 'blank' }

/**
 * Una celda de una fila.
 *
 * **No lleva coordenadas.** Su sitio lo da el orden dentro de la fila y su
 * ancho relativo, igual que una columna de WordPress o de cualquier maquetador
 * por bloques. Fue el cambio de fondo respecto al modelo anterior, que
 * reproducia la rejilla de Excel con `row`, `col` y `colSpan`: aquello obligaba
 * a pensar en coordenadas para mover una casilla de sitio.
 */
export interface BlockCell {
  id: string
  /** Ancho dentro de la fila, en porcentaje. Los de una fila suman 100. */
  width: number
  content: CellContent
  bold?: boolean
  align?: 'left' | 'center' | 'right'
  /** Fondo de cabecera. */
  fill?: boolean
  /** Recuadro alrededor de la celda. */
  boxed?: boolean
  visible?: boolean
}

/** Una fila de la seccion: una banda horizontal partida en celdas. */
export interface BlockRow {
  id: string
  cells: BlockCell[]
  /** Alto minimo en milimetros. Sin el, la fila mide lo que su contenido. */
  minHeightMm?: number
  visible?: boolean
}

/**
 * Una seccion del documento: un titulo y sus filas.
 *
 * Es la unidad con la que se construye un formato. Se anaden filas al final o
 * entre dos, y cada fila se parte en las columnas que haga falta. El documento
 * es la lista ordenada de secciones, y no hay nada mas: ni rejilla previa, ni
 * posiciones absolutas.
 */
export interface RowsSectionDefinition extends SectionDefinitionBase {
  kind: 'rows'
  rows: BlockRow[]
}

export interface SignaturesSectionDefinition extends SectionDefinitionBase {
  kind: 'signatures'
  columns: number
  slots: { id: string; label: string; nameSource?: FieldSource }[]
}

export type SectionDefinition =
  | HeaderSectionDefinition
  | FieldsSectionDefinition
  | ChecklistSectionDefinition
  | TableSectionDefinition
  | RowsSectionDefinition
  | SignaturesSectionDefinition

/** Un documento del libro: la hoja de ingles, el ATS, el permiso de trabajo. */
export interface DocumentDefinition {
  id: string
  /** Nombre de la hoja en el Excel y titulo de la pestana en pantalla. */
  name: string
  /** Orientacion del papel. */
  orientation: 'portrait' | 'landscape'
  /**
   * Codigo, version y fecha del documento controlado del cliente.
   *
   * Van a nivel de documento y no dentro de una seccion porque describen al
   * documento entero, y porque en las hojas generadas desde plantilla el texto
   * ya viaja dentro de la rejilla preimpresa: aqui quedan ademas en un sitio
   * donde el maestro los puede leer y cambiar cuando el cliente apruebe una
   * revision.
   */
  documentCode?: string
  documentVersion?: string
  documentDate?: string
  /**
   * De donde sale el correlativo de este documento.
   *
   * Sin esto no hay forma de expresar que el pie del permiso de trabajo repita
   * el numero de su cabecera, que en la plantilla era la formula `Z63 = T6` y
   * al generar el documento deja de existir. Ver `numbering.ts`.
   */
  numbering?: NumberingSource
  /**
   * Hojas A4 que ocupa el documento en la plantilla original, con su escala de
   * impresion: asistencia y charla en una, ATS y permiso en dos (la plantilla
   * lleva un salto de pagina manual). Las tres salidas lo respetan: el Excel
   * (y el PDF que sale de el) con `fitToHeight` y la vista de impresion con un
   * zoom calculado. Sin el, una hoja de 60 filas se partia en tres paginas y
   * solo la primera llevaba la cabecera del documento.
   */
  printPages?: number
  sections: SectionDefinition[]
}

/** El libro entero de un tipo de formato. */
export interface FormatDefinition {
  /** `GRANEL`, `ETHANOL`, `MERCADERIA_GENERAL`, `CONTAINERO`, `BIG_BAG`. */
  formatType: string
  label: string
  /** Version publicada. Cada formato emitido anota con cual salio. */
  version: number
  documents: DocumentDefinition[]
}

// --- documento resuelto ------------------------------------------------------

export interface ResolvedField {
  id: string
  label: string
  value: string
  span?: number
}

export interface ResolvedHeaderSection {
  kind: 'header'
  id: string
  title: string
  logo?: ImageRef
  documentCode?: string
  documentVersion?: string
  documentDate?: string
  /** `null` si el documento no lleva indicador de pagina. */
  pages: number | null
  fields: ResolvedField[]
}

export interface ResolvedFieldsSection {
  kind: 'fields'
  id: string
  title?: string
  columns: number
  fields: ResolvedField[]
}

export interface ResolvedChecklistSection {
  kind: 'checklist'
  id: string
  title?: string
  columns: number
  items: { id: string; label: string; checked: boolean; image?: ImageRef }[]
}

export interface ResolvedTableSection {
  kind: 'table'
  id: string
  title?: string
  columns: {
    id: string
    label: string
    widthMm: number
    align: 'left' | 'center' | 'right'
  }[]
  rows: string[][]
  /**
   * Firma de cada casilla, con la misma forma que `rows`: `null` donde no hay
   * firma que imprimir, que son casi todas.
   *
   * Va aparte y no dentro de `rows` para no convertir la celda en un objeto:
   * los tres renderizadores leen `rows` como texto y cambiarlo obligaria a
   * tocarlos todos para una columna de cada nueve.
   */
  signatures: (string | null)[][]
  rowsPerPage: number
  /** Paginas que ocupa la tabla. Lo decide el modelo, no cada renderizador. */
  pages: number
}

export interface ResolvedCell {
  id: string
  width: number
  /**
   * Texto ya resuelto. Vacio en una casilla de verificacion o una imagen. En
   * un texto marcado ya lleva la X, para que las tres salidas la impriman sin
   * saber nada de marcas.
   */
  text: string
  kind: CellContent['kind']
  /** Casilla marcada, o texto marcado con una X. */
  checked: boolean
  images?: ImageRef[]
  /**
   * URL de la firma ya resuelta, cuando la casilla es de firma y la persona
   * tiene una guardada. Vacia significa hueco en blanco, no error.
   */
  signatureUrl?: string
  bold: boolean
  align: 'left' | 'center' | 'right'
  fill: boolean
  boxed: boolean
}

export interface ResolvedRow {
  id: string
  cells: ResolvedCell[]
  minHeightMm?: number
}

export interface ResolvedRowsSection {
  kind: 'rows'
  id: string
  title?: string
  rows: ResolvedRow[]
}

export interface ResolvedSignaturesSection {
  kind: 'signatures'
  id: string
  title?: string
  columns: number
  slots: { id: string; label: string; name: string }[]
}

export type ResolvedSection =
  | ResolvedHeaderSection
  | ResolvedFieldsSection
  | ResolvedChecklistSection
  | ResolvedTableSection
  | ResolvedRowsSection
  | ResolvedSignaturesSection

export interface ResolvedDocument {
  id: string
  name: string
  orientation: 'portrait' | 'landscape'
  /** Paginas impresas que ocupa. Lo marca la tabla mas larga. */
  pages: number
  /**
   * Hojas A4 en las que se imprime: las de la plantilla original por cada
   * pagina de la lista de personal. Ver `DocumentDefinition.printPages`.
   */
  printPages: number
  /** Correlativo ya resuelto. Cadena vacia si el documento no lleva numero. */
  number: string
  documentCode?: string
  documentVersion?: string
  documentDate?: string
  sections: ResolvedSection[]
}

export interface ResolvedFormat {
  formatType: string
  label: string
  version: number
  /** Con que motor y definicion se genero. Sin esto no es reproducible. */
  engine: 'v2'
  documents: ResolvedDocument[]
}
