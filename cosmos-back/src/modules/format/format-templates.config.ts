/**
 * Descripcion de cada plantilla de formato.
 *
 * Las cinco plantillas comparten la misma arquitectura: una hoja `GLOBAL` con 18
 * campos de la que cuelgan, por formula, las cabeceras del resto de hojas
 * (asistencia, charla, ATS, permiso de trabajo, inspeccion de nave e ingles).
 *
 * El personal es otra historia. La plantilla trae unas pocas formulas escritas
 * a mano (`='ASIST.'!C9`) que arrastran dos o tres nombres a las demas hojas y
 * dejan el resto de la lista en blanco. Por eso aqui se declara, hoja por hoja,
 * **donde va cada persona**: la plataforma escribe la lista completa en todas
 * las hojas y ya no depende de esas formulas.
 *
 * Cuando el personal no cabe, se anaden paginas clonando el rango `page`, que
 * es la pagina impresa entera (cabecera, lista y pie).
 */

/** Celdas de la hoja GLOBAL, identicas en las cinco plantillas. */
export const GLOBAL_CELLS = {
  nave: 'B3',
  fecha: 'B4',
  muelle: 'B5',
  jornada: 'B6',
  inicioJornada: 'B7',
  terminoJornada: 'B8',
  supervisorOperaciones: 'B9',
  jefeCubierta: 'B10',
  temaCharla1: 'B11',
  temaCharla2: 'B12',
  temaCharla3: 'B13',
  resumenCharla1: 'B14',
  resumenCharla2: 'B15',
  resumenCharla3: 'B16',
  supervisorSsoma: 'B17',
  /** Codigo de nombrada. Es tambien el "N° ATS" de las hojas ATS y PTS. */
  codigoNombrada: 'B18',
  jefeCubiertaVsi: 'B20',
  ssomaVsi: 'B21',
} as const

/**
 * Cabecera de la hoja CHARLA, identica en las tres plantillas.
 *
 * No cuelga de `GLOBAL` como el resto porque no son campos: son textos
 * preimpresos con las opciones dentro (`"Marcar (X)"`), pensados para
 * rellenarse a mano. La plataforma escribe *encima* de ellos sin cambiarles la
 * longitud; ver `preprinted-text.ts`.
 */
export const CHARLA_CELLS = {
  /** Lista de tipos de actividad, en una sola celda combinada. */
  tipo: 'A8',
  /** `"                       SI                          NO"`. */
  programaAnual: 'A16',
  /** El lugar sí va en cuatro celdas, una por opcion. */
  lugarEmbarcacion: 'A18',
  lugarTerminal: 'E18',
  lugarOficina: 'G18',
  lugarOtros: 'I18',
  /** Celdas vacias a la derecha de sus etiquetas. */
  horaInicio: 'C20',
  horaTermino: 'F20',
  /** `"N° Horas: ___________"`: el valor va en el hueco. */
  horas: 'H20',
  /** Nombre del capacitador. Trae `=GLOBAL!B9` y solo se pisa si hay entrenador. */
  capacitador: 'A22',
  /** `"Nombre:            Fecha:"` y `"Cargo:            Firma:"`. */
  responsableNombre: 'A24',
  responsableCargo: 'A25',
} as const

/**
 * Etiqueta de cada opcion **tal como esta escrita en la plantilla**. Es lo que
 * se busca en el texto para poner la X al lado, asi que tiene que coincidir
 * caracter a caracter con la hoja, acentos incluidos.
 */
export const CHARLA_TYPE_LABELS: Record<string, string> = {
  INDUCCION: 'Inducción',
  CAPACITACION: 'Capacitación',
  ENTRENAMIENTO: 'Entrenamiento',
  SIMULACRO: 'Simulacro de Emergencia',
  TOOLBOX: 'TOOLBOX',
  OTROS: 'Otros',
}

/** Celda y etiqueta de cada lugar. La opcion vive en su propia celda. */
export const CHARLA_PLACE_CELLS: Record<string, { cell: string; label: string }> = {
  EMBARCACION: { cell: CHARLA_CELLS.lugarEmbarcacion, label: 'Embarcación' },
  TERMINAL: { cell: CHARLA_CELLS.lugarTerminal, label: 'Terminal' },
  OFICINA: { cell: CHARLA_CELLS.lugarOficina, label: 'Oficina' },
  OTROS: { cell: CHARLA_CELLS.lugarOtros, label: 'Otros' },
}

/** Columnas que ocupa una persona dentro de una fila de la lista. */
export interface PersonLane {
  /** Correlativo impreso. */
  numero?: string
  /** Cargo o puesto. Se omite en las hojas que lo traen preimpreso. */
  cargo?: string
  nombre: string
  documento: string
  /** Hora de ingreso, refrigerio y salida (solo la hoja de asistencia). */
  horaIngreso?: string
  inicioRefrigerio?: string
  terminoRefrigerio?: string
  horaSalida?: string
}

export interface PersonBlock {
  /** Identificador legible, usado en los avisos de cobertura. */
  id: string
  label: string
  sheet: string
  /**
   * Filas de la plantilla que admiten personal, en orden. No son contiguas:
   * la lista intercala cabeceras repetidas para que cada pagina impresa las
   * lleve.
   */
  rows: number[]
  /**
   * Uno o dos juegos de columnas por fila. El ATS y el permiso de trabajo
   * imprimen dos personas por fila, en dos columnas.
   */
  lanes: PersonLane[]
  /**
   * `lane` numera hacia abajo por columna (01..20 a la izquierda, 21..40 a la
   * derecha), que es como estan preimpresos los correlativos del ATS y del PT.
   * `row` numera de izquierda a derecha y luego baja.
   */
  fill: 'lane' | 'row'
  /**
   * Pagina impresa que se clona cuando el personal no cabe. Incluye cabecera y
   * pie para que la pagina anadida sea autonoma, y debe cubrir todas las filas
   * de `rows`: la copia solo trae las filas que existen dentro del rango.
   */
  page: { from: number; to: number }
  /**
   * Celda de la cabecera que lleva el N.o de permiso de trabajo, cuando la hoja
   * lo imprime. Solo la traen las hojas PTS.
   *
   * Se escribe **antes** de paginar: la copia de una pagina arrastra el valor ya
   * puesto, asi que todas las paginas del permiso salen con el mismo numero, que
   * es lo correcto (es un solo permiso repartido en varias hojas).
   */
  permitNumberCell?: string
}

export interface FormatTemplate {
  /** Identificador estable, usado por la API y guardado en la nombrada. */
  id: string
  label: string
  file: string
  /** Hoja donde va la lista principal de personal. */
  attendanceSheet: string
  /** Bloques de personal de todas las hojas del libro. */
  blocks: PersonBlock[]
}

/** `[8,9,10]` a partir de `range(8, 10)`. */
const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)

// --- geometria compartida ----------------------------------------------------
//
// CHARLA, PTS e INGLES son identicas en las tres plantillas; el ATS cambia de
// nombre pero no de disposicion. Se declaran una vez.

const ATTENDANCE_LANE: PersonLane = {
  numero: 'A',
  cargo: 'B',
  // `C` esta combinada con `D`.
  nombre: 'C',
  documento: 'E',
  horaIngreso: 'F',
  inicioRefrigerio: 'H',
  terminoRefrigerio: 'I',
  horaSalida: 'K',
}

/** Cabecera en la fila 26, lista del 27 al 77, "OBSERVACIONES" en la 78. */
const charlaBlock = (): PersonBlock => ({
  id: 'charla',
  label: 'Charla',
  sheet: 'CHARLA',
  rows: range(27, 77),
  lanes: [{ numero: 'A', cargo: 'F', nombre: 'B', documento: 'H' }],
  fill: 'row',
  page: { from: 1, to: 78 },
})

/** Dos personas por fila: izquierda 01..20, derecha 21..40. */
const atsBlock = (sheet: string): PersonBlock => ({
  id: `ats:${sheet}`,
  label: sheet,
  sheet,
  rows: range(23, 42),
  lanes: [
    { numero: 'A', nombre: 'B', documento: 'H' },
    { numero: 'M', nombre: 'N', documento: 'U' },
  ],
  fill: 'lane',
  page: { from: 1, to: 100 },
})

/**
 * Seccion V del permiso de trabajo, tambien a dos columnas.
 *
 * `T6` es el "N° PERMISO" de la cabecera. En la plantilla venia por formula
 * desde `GLOBAL!B18`, es decir, repetia el codigo de la nombrada; ahora lleva el
 * correlativo propio del permiso. El "N° PERMISO" del pie (`Z63`) cuelga de
 * `T6` por formula, asi que se actualiza solo.
 */
const ptsBlock = (sheet: string): PersonBlock => ({
  id: `pt:${sheet}`,
  label: sheet,
  sheet,
  rows: range(99, 106),
  lanes: [
    { nombre: 'B', documento: 'I' },
    { nombre: 'O', documento: 'V' },
  ],
  fill: 'lane',
  page: { from: 1, to: 122 },
  permitNumberCell: 'T6',
})

/**
 * Las filas 8 y 9 traen al supervisor de operaciones y al de SSOMA por formula
 * desde `GLOBAL`, asi que la lista de personal empieza en la 10.
 */
const inglesBlock = (): PersonBlock => ({
  id: 'ingles',
  label: 'Inglés',
  sheet: 'INGLÉS',
  rows: range(10, 43),
  lanes: [{ numero: 'A', nombre: 'C', documento: 'E' }],
  fill: 'row',
  page: { from: 1, to: 44 },
})

/**
 * Hoja de asistencia de 73 plazas. La comparten mercaderia general, containero
 * y big bag, que la heredaron de la misma plantilla.
 */
const wideAttendanceBlock = (): PersonBlock => ({
  id: 'asistencia',
  label: 'Asistencia',
  sheet: 'ASISTENCIA',
  // Cabeceras repetidas en 7, 19, 29, 39, 58, 70, 80 y 90. La 47 y la 48 estan
  // ocultas en la plantilla y la 52-53 es la cabecera impresa de la segunda
  // pagina ("Fecha / Version / Codigo"): antes la lista usaba la 47 y la 53, y
  // la persona 37 no se veia y la 38 escribia encima de esa cabecera. La tabla
  // de la primera pagina acaba en la 51, que lleva el borde grueso de cierre.
  rows: [
    ...range(8, 18), ...range(20, 28), ...range(30, 38), ...range(40, 46), ...range(49, 51),
    ...range(59, 69), ...range(71, 79), ...range(81, 89), ...range(91, 95),
  ],
  lanes: [ATTENDANCE_LANE],
  fill: 'row',
  page: { from: 1, to: 95 },
})

export const FORMAT_TEMPLATES: FormatTemplate[] = [
  {
    id: 'ETHANOL',
    label: 'Ethanol',
    file: 'FORMATOS ETHANOL.xlsx',
    attendanceSheet: 'PD03-R97 ASIST.',
    blocks: [
      {
        id: 'asistencia',
        label: 'Asistencia',
        sheet: 'PD03-R97 ASIST.',
        // Cabeceras repetidas en las filas 7 y 15.
        rows: [...range(8, 14), ...range(16, 24)],
        lanes: [ATTENDANCE_LANE],
        fill: 'row',
        page: { from: 1, to: 29 },
      },
      charlaBlock(),
      atsBlock('ATS ETHANOL'),
      ptsBlock('SS01-F167. PTS'),
      inglesBlock(),
    ],
  },
  {
    id: 'GRANEL',
    label: 'Granel',
    file: 'FORMATOS GRANEL.xlsx',
    attendanceSheet: 'ASISTENCIA',
    blocks: [
      {
        id: 'asistencia',
        label: 'Asistencia',
        sheet: 'ASISTENCIA',
        // Cabeceras repetidas en 7, 15, 21, 27, 46, 58, 68 y 78. La 35 y la 36
        // estan ocultas y la 40-41 es la cabecera impresa de la segunda pagina;
        // la tabla de la primera acaba en la 39. Mismo caso que la 47/53 de
        // `wideAttendanceBlock`.
        rows: [
          ...range(8, 14), ...range(16, 20), ...range(22, 26), ...range(28, 34), ...range(37, 39),
          ...range(47, 57), ...range(59, 67), ...range(69, 77), ...range(79, 83),
        ],
        lanes: [ATTENDANCE_LANE],
        fill: 'row',
        page: { from: 1, to: 83 },
      },
      charlaBlock(),
      atsBlock('ATS GRANEL'),
      ptsBlock('SS01-F167. PTS'),
      ptsBlock('SS01-F167. PTS (3C)'),
      inglesBlock(),
    ],
  },
  {
    id: 'MERCADERIA_GENERAL',
    label: 'Mercadería general',
    file: 'FORMATOS MERCADERIA GENERAL.xlsx',
    attendanceSheet: 'ASISTENCIA',
    blocks: [
      wideAttendanceBlock(),
      charlaBlock(),
      atsBlock('ATS MERCADERIA'),
      atsBlock('ATS DESPACHO'),
      ptsBlock('SS01-F167. PTS'),
      ptsBlock('SS01-F167. PTS (3C)'),
      inglesBlock(),
    ],
  },
  {
    // `CO` en Cosmos. La hoja de asistencia es la de mercaderia general; el ATS
    // se llama `ATS ACTUAL` y no hay ATS de despacho.
    id: 'CONTAINERO',
    label: 'Containero',
    file: 'FORMATOS CONTAINERO.xlsx',
    attendanceSheet: 'ASISTENCIA',
    blocks: [
      wideAttendanceBlock(),
      charlaBlock(),
      atsBlock('ATS ACTUAL'),
      ptsBlock('SS01-F167. PTS'),
      ptsBlock('SS01-F167. PTS (3C)'),
      inglesBlock(),
    ],
  },
  {
    // `BB` en Cosmos. Copia de mercaderia general con su propio ATS de carga.
    id: 'BIG_BAG',
    label: 'Big bag',
    file: 'FORMATOS BIG BAG.xlsx',
    attendanceSheet: 'ASISTENCIA',
    blocks: [
      wideAttendanceBlock(),
      charlaBlock(),
      atsBlock('ATS BIG BAG'),
      atsBlock('ATS DESPACHO'),
      ptsBlock('SS01-F167. PTS'),
      ptsBlock('SS01-F167. PTS (3C)'),
      inglesBlock(),
    ],
  },
]

export const DEFAULT_FORMAT_TYPE = 'GRANEL'

export function getFormatTemplate(id: string | undefined | null): FormatTemplate {
  const found = FORMAT_TEMPLATES.find(t => t.id === id)
  return found ?? FORMAT_TEMPLATES.find(t => t.id === DEFAULT_FORMAT_TYPE)!
}

/** Huecos de personal que ofrece un bloque antes de anadir paginas. */
export function blockCapacity(block: PersonBlock): number {
  return block.rows.length * block.lanes.length
}

/**
 * Personal que lista la hoja de asistencia en una pagina. Es lo que distingue
 * de verdad a los formatos (16, 61 y 73) y lo que reconoce quien elige.
 */
export function attendanceCapacity(template: FormatTemplate): number {
  const block = template.blocks.find(b => b.id === 'asistencia')
  return block ? blockCapacity(block) : 0
}

/**
 * Personal que cabe en una sola pagina de **todas** las hojas.
 *
 * Lo marca el bloque mas estrecho, que en las tres plantillas es la seccion V
 * del permiso de trabajo (8 filas por 2 columnas). Por encima de esta cifra el
 * formato sigue saliendo completo, solo que repartido en varias paginas: no es
 * un tope, es el punto en el que empieza a paginar.
 */
export function onePageCapacity(template: FormatTemplate): number {
  return Math.min(...template.blocks.map(blockCapacity))
}

/**
 * `GLOBAL!B10` guarda nombre y documento en un unico texto de ancho fijo,
 * porque la plantilla los separa con `MID(B10,1,25)` y `MID(B10,52,30)`.
 */
export function packNameAndDocument(name: string, document: string): string {
  return `${(name ?? '').padEnd(51)}${document ?? ''}`
}

/** `"07:00 - 15:00"` a `"07:00 HRS."`, que es lo que comparan las formulas. */
export function toShiftLabel(shiftDescription: string): string {
  const start = (shiftDescription ?? '').split('-')[0]?.trim() ?? ''
  return start ? `${start} HRS.` : ''
}

/**
 * Correlativo del permiso de trabajo tal como se imprime: cuatro digitos, para
 * que case con el N.o de ATS que lleva al lado. La hoja ya trae el prefijo
 * `PTS-` preimpreso, asi que aqui solo va el numero.
 */
export function toWorkPermitLabel(workPermitNumber: number | null | undefined): string {
  return workPermitNumber ? String(workPermitNumber).padStart(4, '0') : ''
}

/** Numero de jornada segun la hora de inicio del turno. */
export function toJornadaNumber(shiftDescription: string): number {
  const start = (shiftDescription ?? '').split('-')[0]?.trim()
  if (start === '07:00') return 1
  if (start === '15:00') return 2
  if (start === '23:00') return 3
  return 0
}
