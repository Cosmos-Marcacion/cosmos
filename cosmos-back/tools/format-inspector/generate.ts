/**
 * Genera las definiciones del motor v2 desde las plantillas del cliente.
 *
 *   npm run format:generate
 *
 * Transcribir a mano los 817 rotulos y las 41 imagenes de las tres plantillas
 * es donde se pierden datos: un rotulo que falta no da error, sale un formato
 * que parece correcto y no lo es. Este generador lee las hojas y emite la
 * definicion completa, y `label-coverage.spec.ts` comprueba despues que no
 * falte nada.
 *
 * Que produce, por cada hoja imprimible:
 *
 * - Una **cabecera** con el codigo de documento controlado, su version y su
 *   fecha, sacados de la propia hoja.
 * - Un bloque **grid** con el resto del contenido preimpreso, celda a celda,
 *   con sus anchos y alturas en milimetros, sus combinaciones, sus bordes y sus
 *   imagenes ancladas donde estaban.
 * - Una **tabla** de personal en el hueco donde la hoja la tiene, cuando la
 *   hoja lleva lista (`format-templates.config.ts` dice cuales y donde).
 *
 * Las hojas `GLOBAL` y `GENERAL` no se emiten: la primera es el origen de las
 * formulas de la plantilla, que aqui no existen, y la segunda es una lista para
 * los desplegables con nombres de personal escritos a mano dentro del `.xlsx`.
 * Ninguna se imprime.
 */

import * as fs from 'fs'
import * as path from 'path'
import { readWorkbook, Sheet, Cell, columnToNumber } from './xlsx-read'
import {
  FORMAT_TEMPLATES,
  PersonBlock,
  PersonLane,
} from '../../src/modules/format/format-templates.config'

const TEMPLATES_DIR = path.join(process.cwd(), 'templates')
const OUT_DIR = path.join(process.cwd(), 'src', 'modules', 'format', 'v2', 'definitions', 'generated')
const ASSETS_DIR = path.join(process.cwd(), 'public', 'format-assets')

/**
 * Los cuatro documentos del formato, en el orden en que se emiten.
 *
 * Cada tipo de nombrada trae las mismas cuatro hojas con nombres distintos
 * (`ASISTENCIA` en granel y mercaderia, `PD03-R97 ASIST.` en ethanol; el ATS
 * lleva el nombre de la carga). Aqui se les da un `id` estable, que es lo que
 * guarda la numeracion y lo que referencia el maestro: si el `id` dependiera
 * del nombre de la hoja, el correlativo del ATS de granel y el de ethanol
 * serian series distintas sin motivo.
 *
 * `match` se prueba en orden contra el nombre de la hoja.
 */
const DOCUMENTS: { id: string; label: string; match: RegExp }[] = [
  { id: 'asistencia', label: 'Asistencia', match: /^(ASISTENCIA|PD03-R97 ASIST)/i },
  { id: 'charla', label: 'Charla', match: /^CHARLA/i },
  { id: 'pts', label: 'Permiso de trabajo seguro', match: /PTS$/i },
  { id: 'ats', label: 'ATS', match: /^ATS/i },
]

/**
 * Hojas que existen en la plantilla y **no** se emiten.
 *
 * Se declaran una a una y con motivo, en vez de dejarlas caer por no encajar en
 * `DOCUMENTS`: una hoja que desaparece sin que nadie lo note es justo lo que no
 * conviene en un documento que se audita. `generated.spec.ts` comprueba que
 * toda hoja de las plantillas esta o en `DOCUMENTS` o aqui.
 */
const EXCLUDED: Record<string, string> = {
  GLOBAL: 'origen de las formulas de la plantilla; el motor v2 no usa formulas',
  GENERAL: 'lista para los desplegables, con personal escrito a mano dentro; no se imprime',
  'VESSEL INSPECTION': 'fuera del alcance acordado de cuatro documentos por tipo',
  // Asi, con la errata, se llama la hoja en la plantilla de containero.
  'VESSEL INPECTION': 'fuera del alcance acordado de cuatro documentos por tipo',
  'INGLÉS': 'fuera del alcance acordado de cuatro documentos por tipo',
  'SS01-F167. PTS (3C)': 'segunda copia del mismo permiso; se emite una sola',
  'ATS DESPACHO': 'segundo ATS de mercaderia general y big bag; se emite el de la carga',
}

/** `SUPERVISOR DE OPERACIONES` a `supervisor-de-operaciones`. */
function slug(text: string): string {
  return text
    .normalize('NFD')
    // `\p{M}` son las marcas diacriticas que deja `NFD` al separarlas.
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'x'
}

/** Extrae de la cabecera de la hoja el codigo, la version y la fecha. */
function documentMeta(cells: Cell[]) {
  const meta: { code?: string; version?: string; date?: string } = {}
  for (const cell of cells) {
    if (cell.row > 6 || cell.type !== 's') {
      continue
    }
    const text = String(cell.value ?? '').trim()
    const code = /c[oó]digo\s*:?\s*:?\s*(.+)/i.exec(text)
    if (code) meta.code = code[1].trim()
    const version = /versi[oó]n\s*:?\s*(.+)/i.exec(text)
    if (version) meta.version = version[1].trim()
    const date = /fecha\s*:?\s*([\d./-]+)/i.exec(text)
    if (date) meta.date = date[1].trim()
  }
  return meta
}

/** El titulo del documento: el texto mas largo de las dos primeras filas. */
function documentTitle(cells: Cell[], fallback: string): string {
  const candidates = cells
    .filter(cell => cell.row <= 2 && cell.type === 's')
    .map(cell => String(cell.value ?? '').trim())
    .filter(text => text.length > 3 && !/c[oó]digo|versi[oó]n|p[aá]gina|fecha/i.test(text))
  return candidates.sort((a, b) => b.length - a.length)[0] ?? fallback
}

interface MergeInfo {
  top: number
  left: number
  bottom: number
  right: number
}

function parseMerges(sheet: Sheet): Map<string, MergeInfo> {
  const byTopLeft = new Map<string, MergeInfo>()
  // `sheet.merges` son objetos con `from` y `to` ya troceados, no cadenas.
  // Tratarlos como texto daba "[object Object]", la expresion regular no casaba
  // y **ninguna celda salia combinada**: los rotulos quedaban cada uno en su
  // columna estrecha, sin las cajas que los encuadran, y el documento se veia
  // disperso. Eran 361 combinaciones perdidas solo en el ATS.
  for (const merge of sheet.merges ?? []) {
    const top = merge.from.row
    const left = columnToNumber(merge.from.column)
    const bottom = merge.to.row
    const right = columnToNumber(merge.to.column)
    byTopLeft.set(`${top}|${left}`, { top, left, bottom, right })
  }
  return byTopLeft
}

/**
 * Anchos de columna en milimetros, por indice de columna (1..n).
 *
 * Una columna que la hoja no declara **no mide cero ni un valor inventado**:
 * mide el ancho por defecto de la hoja. El ATS deja siete sin declarar, y
 * darles 4,5 mm en vez de sus 21 mm desplazaba lateralmente todo lo que va a su
 * derecha; la rejilla salia 31 mm mas estrecha que la original.
 */
function columnWidths(sheet: Sheet, used: number): number[] {
  const widths: number[] = new Array(used).fill(-1)
  for (const column of sheet.columns ?? []) {
    for (let index = column.min; index <= Math.min(column.max, used); index++) {
      widths[index - 1] = column.hidden ? 0 : column.mm
    }
  }
  return widths.map(width => (width < 0 ? sheet.defaultColumnMm : width))
}

/**
 * El rectangulo que la hoja declara como area de impresion.
 *
 * Se devuelve solo la esquina inferior derecha: la superior siempre es `A1` en
 * estas plantillas, y el generador ya recorre desde ahi. Si la hoja declara
 * varios rangos se toma el mayor, que es el que envuelve al documento.
 */
function printRange(sheet: Sheet): { column: number; row: number } | null {
  if (!sheet.printArea) {
    return null
  }
  let column = 0
  let row = 0
  // El nombre de la hoja va delante y se descarta: `'SS01-F167. PTS'!$A$1:$AA$122`
  // trae `SS01` dentro del nombre, que se lee como una referencia perfectamente
  // valida a la columna 513.
  for (const range of sheet.printArea.split(',')) {
    const refs = range.slice(range.lastIndexOf('!') + 1)
    for (const match of refs.matchAll(/\$?([A-Z]{1,3})\$?(\d+)/g)) {
      column = Math.max(column, columnToNumber(match[1]))
      row = Math.max(row, Number(match[2]))
    }
  }
  return column > 0 && row > 0 ? { column, row } : null
}

/**
 * Si una columna lleva algo dentro del rango que se va a emitir.
 *
 * Cuenta como contenido el texto, una imagen anclada, un fondo o un borde: son
 * las cuatro cosas que se ven impresas. Una columna sin ninguna de ellas es
 * espacio en blanco.
 */
function columnHasContent(sheet: Sheet, column: number, lastRow: number): boolean {
  for (const cell of sheet.cells) {
    if (columnToNumber(cell.column) !== column || cell.row > lastRow) {
      continue
    }
    const style = (cell.style ?? {}) as any
    if (textOf(cell) || style.fill || (Array.isArray(style.borders) && style.borders.length > 0)) {
      return true
    }
  }
  return (sheet.images ?? []).some(
    image => image.from.column === column && image.from.row <= lastRow
  )
}

/** Primera columna del documento: se descartan los margenes de la izquierda. */
function trimStart(sheet: Sheet, usedColumns: number, lastRow: number): number {
  let column = 1
  while (column < usedColumns && !columnHasContent(sheet, column, lastRow)) {
    column += 1
  }
  return column
}

/** Ultima columna del documento, con el mismo criterio por la derecha. */
function trimEnd(sheet: Sheet, usedColumns: number, lastRow: number, first: number): number {
  let column = usedColumns
  while (column > first && !columnHasContent(sheet, column, lastRow)) {
    column -= 1
  }
  return column
}

/** Altos de fila, con el mismo criterio que los anchos. */
function rowHeights(sheet: Sheet, from: number, to: number): number[] {
  const byRow = new Map<number, number>()
  for (const row of sheet.rows ?? []) {
    byRow.set(row.row, row.hidden ? 0 : row.mm)
  }
  const heights: number[] = []
  for (let row = from; row <= to; row++) {
    heights.push(byRow.get(row) ?? sheet.defaultRowMm)
  }
  return heights
}

/**
 * La hoja de calculo, convertida en secciones con filas y columnas.
 *
 * Es el cambio de enfoque respecto a la version anterior. Antes se reproducia
 * la rejilla de Excel tal cual, con `fila`, `columna` y `colSpan`, y sobre esa
 * rejilla ya construida se colocaban los elementos. Editarlo obligaba a pensar
 * en coordenadas, y anadir algo en medio no tenia sentido.
 *
 * Ahora el documento **se construye**: una lista de secciones, cada una con sus
 * filas, y cada fila partida en las columnas que haga falta. El ancho de una
 * columna es un porcentaje de su fila, no una posicion. Anadir una fila es
 * insertarla en la lista, y partir una fila es anadir una celda.
 *
 * La hoja original sigue siendo la referencia: de ella salen el orden y el
 * contenido. Lo que no sale es su rejilla.
 */

interface Fragment {
  /** Columna de la hoja donde empieza, para ordenar y medir. */
  from: number
  span: number
  cell: Cell | undefined
  merged: boolean
}

/**
 * Trocea una fila de la hoja en fragmentos contiguos.
 *
 * Se recorre de la primera columna a la ultima. En cada posicion, o empieza
 * una celda (con su ancho, si esta combinada) o se esta dentro de otra. Lo que
 * sale es una particion exacta: los fragmentos de una fila cubren el ancho
 * entero sin huecos ni solapes, que es lo que permite expresar los anchos como
 * porcentajes que suman 100.
 */
function splitRow(
  row: number,
  firstColumn: number,
  usedColumns: number,
  cellAt: Map<string, Cell>,
  merges: Map<string, MergeInfo>,
  covered: Set<string>
): Fragment[] {
  const fragments: Fragment[] = []
  let column = firstColumn

  while (column <= usedColumns) {
    if (covered.has(`${row}|${column}`)) {
      // Lo tapa una celda que viene de una fila de mas arriba.
      //
      // En este modelo una fila no puede abarcar varias: cada una se reparte
      // sola. Asi que el espacio que ocupaba la celda alta se convierte en un
      // hueco en las filas de abajo. Sin esto, esas filas repartian menos del
      // 100% y salian cortas.
      let span = 0
      while (column + span <= usedColumns && covered.has(`${row}|${column + span}`)) {
        span += 1
      }
      fragments.push({ from: column, span, cell: undefined, merged: false })
      column += span
      continue
    }
    const merge = merges.get(`${row}|${column}`)
    const span = merge ? merge.right - merge.left + 1 : 1
    fragments.push({
      from: column,
      span,
      cell: cellAt.get(`${row}|${column}`),
      merged: !!merge,
    })

    // Una celda que ocupa varias filas tapa las de abajo.
    if (merge && merge.bottom > merge.top) {
      for (let r = merge.top + 1; r <= merge.bottom; r++) {
        for (let c = merge.left; c <= merge.right; c++) {
          covered.add(`${r}|${c}`)
        }
      }
    }
    column += span
  }
  return fragments
}

/** Texto de una celda de la hoja, o cadena vacia. */
function textOf(cell: Cell | undefined): string {
  const text = cell?.value === null || cell?.value === undefined ? '' : String(cell.value)
  return text.trim() ? text : ''
}

/**
 * De que campo de la jornada tira cada celda de la hoja `GLOBAL`.
 *
 * Es el reparto de `format.service.ts` leido al reves. El motor legacy escribe
 * el nombre de la nave en `GLOBAL!B3` y las demas hojas lo recogen por formula,
 * asi que **una celda cuya formula sea `=GLOBAL!B3` es el hueco de la nave**.
 * La plantilla ya dice donde va cada dato; no hay que adivinarlo ni declararlo
 * a mano hoja por hoja.
 *
 * Sin esto el generador guardaba el **valor cacheado** de la formula, que es el
 * de la nombrada de ejemplo con la que se guardo el libro: la fecha `46248`, el
 * codigo `0830` y el nombre y DNI de una persona real salian impresos como
 * texto fijo en todos los formatos.
 *
 * `transform` reproduce lo que el legacy escribia en cada celda: `B7` llevaba
 * `"07:00 HRS."`, o sea la hora de inicio del turno, y `B6` el numero de
 * jornada. Ver `toShiftLabel` y `packNameAndDocument`.
 */
const GLOBAL_SOURCES: Record<string, { source: string; transform?: string }> = {
  B3: { source: 'nave' },
  B4: { source: 'fecha', transform: 'fechaCorta' },
  B5: { source: 'muelle' },
  B6: { source: 'jornada', transform: 'numeroJornada' },
  B7: { source: 'turno', transform: 'horaInicio' },
  B8: { source: 'turno', transform: 'horaFin' },
  B9: { source: 'supervisorOperaciones', transform: 'nombreYDocumento' },
  B10: { source: 'jefeCubierta', transform: 'nombreYDocumento' },
  B11: { source: 'temaCharla1' },
  B12: { source: 'temaCharla2' },
  B13: { source: 'temaCharla3' },
  B14: { source: 'resumenCharla1' },
  B15: { source: 'resumenCharla2' },
  B16: { source: 'resumenCharla3' },
  B17: { source: 'supervisorSsoma' },
  B18: { source: 'codigoNombrada' },
  B20: { source: 'jefeCubiertaVsi' },
  B21: { source: 'ssomaVsi' },
}

/**
 * Donde va la firma de cada responsable, por documento.
 *
 * `column` es la columna de la hoja en la que el documento pone su cabecera
 * FIRMA, y `sources` los responsables cuya fila la recibe.
 *
 * La fila **no** se declara: se busca la que ya lleva el dato de ese
 * responsable. Declararla por numero fue el primer intento y estaba mal: el ATS
 * de granel tiene sus responsables dos filas mas arriba que el de las otras dos
 * plantillas, y las coordenadas fijas colocaban la firma del supervisor en la
 * casilla FIRMA **del inspector**, que es otra tabla y otra persona. Anclando a
 * la fila del propio responsable eso no puede ocurrir: una fila sin su dato no
 * recibe ninguna firma.
 *
 * El pie del permiso (fila 120) queda fuera a proposito: sus "Firma:" son
 * celdas de texto sin casilla propia al lado, asi que colocar ahi la firma
 * exige partir la celda, y esa es una decision de maquetacion de quien edita el
 * maestro, no del generador.
 */
const SIGNATURE_CELLS: Record<string, { column: number; sources: string[] }> = {
  // Responsable del Area (supervisor) y Responsable del Trabajo (jefe).
  pts: { column: 23, sources: ['supervisorOperaciones', 'jefeCubierta'] },
  // Ejecutante y Autorizante. En el ATS el ejecutante es el jefe de cubierta y
  // el autorizante el supervisor, al reves que en el permiso.
  ats: { column: 22, sources: ['jefeCubierta', 'supervisorOperaciones'] },
}

/** `IF(GLOBAL!$B$7="15:00 HRS.", "X", " ")`: una casilla que se marca sola. */
const CHECK_FORMULA = /^\+?\s*IF\(\s*'?GLOBAL'?!\$?([A-Z]+)\$?(\d+)\s*=\s*"([^"]*)"/i

/** `=+GLOBAL!$B$4` y demas formas de referirse a una celda de `GLOBAL`. */
const GLOBAL_FORMULA = /^\+?\s*'?GLOBAL'?!\$?([A-Z]+)\$?(\d+)\s*$/i

/**
 * Lo que compara la formula, en los terminos del motor v2.
 *
 * La plantilla compara contra `"07:00 HRS."` porque es lo que el legacy escribe
 * en `GLOBAL!B7`; aqui el mismo dato es `turno` con `horaInicio`, que resuelve
 * `07:00`. Se recorta el sufijo para que las dos formas digan lo mismo.
 */
function checkValue(raw: string): string {
  return raw.replace(/\s*HRS?\.?\s*$/i, '').trim()
}

/** `=+D6`: una celda que repite otra de su misma hoja. */
const LOCAL_FORMULA = /^\+?\s*\$?([A-Z]+)\$?(\d+)\s*$/

/**
 * A que campo de la jornada lleva la formula de una celda, si lleva a alguno.
 *
 * Sigue las referencias dentro de la hoja porque la plantilla encadena: el pie
 * del permiso de trabajo es `Z63 = +T6`, y `T6` es `=GLOBAL!B18`. Mirando solo
 * el primer salto, `Z63` se quedaba con el codigo de la nombrada de ejemplo
 * escrito como texto, y el pie del permiso decia un numero y la cabecera otro.
 *
 * `visitados` corta los ciclos: una plantilla mal cerrada no puede colgar el
 * generador.
 */
function bindingOf(
  cell: Cell | undefined,
  cellByRef: Map<string, Cell>,
  visitados = new Set<string>()
): { source: string; transform?: string } | null {
  const formula = cell?.formula?.trim() ?? ''
  if (!formula || !cell || visitados.has(cell.ref)) {
    return null
  }
  visitados.add(cell.ref)

  const reference = GLOBAL_FORMULA.exec(formula)
  if (reference) {
    return GLOBAL_SOURCES[`${reference[1].toUpperCase()}${reference[2]}`] ?? null
  }

  const local = LOCAL_FORMULA.exec(formula)
  if (local) {
    const target = cellByRef.get(`${local[1].toUpperCase()}${local[2]}`)
    return bindingOf(target, cellByRef, visitados)
  }

  return null
}

/** Contenido de una celda a partir de lo que trae la hoja. */
function contentOf(cell: Cell | undefined, cellByRef: Map<string, Cell>): any {
  const formula = cell?.formula?.trim() ?? ''

  const condition = CHECK_FORMULA.exec(formula)
  if (condition) {
    const bound = GLOBAL_SOURCES[`${condition[1].toUpperCase()}${condition[2]}`]
    if (bound) {
      return {
        kind: 'check',
        when: {
          source: bound.source,
          ...(bound.transform ? { transform: bound.transform } : {}),
          equals: checkValue(condition[3]),
        },
      }
    }
  }

  const bound = bindingOf(cell, cellByRef)
  if (bound) {
    return {
      kind: 'data',
      source: bound.source,
      ...(bound.transform ? { transform: bound.transform } : {}),
    }
  }

  const text = textOf(cell)
  return text ? { kind: 'text', text } : { kind: 'blank' }
}

/**
 * Ancho aproximado de un caracter, en milimetros.
 *
 * No se mide la fuente de verdad: basta con distinguir un rotulo que cabe de
 * uno que no. La proporcion sale de comparar los rotulos de las plantillas con
 * el ancho que Excel les reserva.
 */
function fontMm(style: any): number {
  return (style?.size ?? 11) * 0.16
}

/**
 * El rotulo que no cabe en su casilla se derrama sobre las de al lado.
 *
 * Es lo que hace Excel y lo que se ve impreso: `Hora Inicial :` esta en una
 * columna de 15 mm y se lee entera porque las dos de su derecha estan vacias.
 * Sin esto, el rotulo salia en una casilla del 4 % y el documento parecia
 * desordenado aunque tuviera todo el contenido.
 *
 * El derrame **para** donde para en Excel: en la primera casilla con algo
 * dentro. Un recuadro no lo detiene —el texto se dibuja igual por encima—, asi
 * que la casilla vacia se absorbe y su recuadro pasa al rotulo, que es como se
 * ve impreso: `Empresa Ejecutante:` dentro del marco que lo acompana.
 *
 * No se aplica a las casillas que ajustan el texto (`wrapText`), porque esas no
 * se derraman: crecen hacia abajo. Es la regla que evita que una pregunta de
 * tres lineas se trague la casilla donde se responde.
 */
function spill(cells: any[]) {
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index]
    if (cell.content.kind !== 'text' || cell.wrap) {
      continue
    }
    const needed = cell.content.text.length * cell.fontMm
    const align = cell.align ?? 'left'
    // Un rotulo centrado se derrama hacia los dos lados, uno alineado a la
    // derecha solo hacia la izquierda. `Empresa Ejecutante:` esta centrado, y
    // mirando solo a la derecha se quedaba encerrado en su columna de 15 mm.
    const lados = align === 'right' ? [-1] : align === 'center' ? [1, -1] : [1]

    while (cell.widthMm < needed) {
      let absorbida = false
      for (const lado of lados) {
        const at = index + lado
        const vecina = cells[at]
        if (!vecina || vecina.content.kind !== 'blank' || vecina.fill) {
          continue
        }
        cells.splice(at, 1)
        if (at < index) {
          index -= 1
        }
        cell.width = Math.round((cell.width + vecina.width) * 100) / 100
        cell.widthMm += vecina.widthMm
        // El marco de la casilla absorbida no se pierde.
        if (vecina.boxed !== false) {
          delete cell.boxed
        }
        absorbida = true
        break
      }
      if (!absorbida) {
        break
      }
    }
  }
}

/**
 * Convierte un rango de filas de la hoja en filas del modelo.
 *
 * Las filas totalmente vacias se descartan: en las plantillas hay bandas entre
 * bloques que solo separan visualmente, y arrastrarlas llenaria el editor de
 * filas sin nada dentro.
 */
function buildRows(
  sheet: Sheet,
  merges: Map<string, MergeInfo>,
  from: number,
  to: number,
  firstColumn: number,
  usedColumns: number,
  skipRows: Set<number>,
  widths: number[]
): any[] {
  const cellAt = new Map<string, Cell>()
  // Por referencia (`T6`), que es como se citan unas a otras las formulas.
  const cellByRef = new Map<string, Cell>()
  for (const cell of sheet.cells) {
    cellAt.set(`${cell.row}|${columnToNumber(cell.column)}`, cell)
    cellByRef.set(cell.ref.toUpperCase(), cell)
  }

  // Las imagenes se agrupan por fila, no por celda exacta.
  //
  // Una imagen anclada en la columna 16 puede caer **dentro** de una celda
  // combinada que empieza en la 15: buscarla por su columna exacta la perdia.
  // Y las que caen en la banda de la lista de personal, como el sello de la
  // hoja de asistencia, se llevan a la primera fila que si se emite.
  const imagesByRow = new Map<number, { column: number; image: any }[]>()
  for (const [index, image] of (sheet.images ?? []).entries()) {
    // Una imagen de la banda de la lista de personal se lleva a la fila
    // anterior a la banda: es el caso del sello de la hoja de asistencia, que
    // esta anclado en medio de la lista y no tiene ninguna fila detras.
    let row = image.from.row
    if (skipRows.has(row)) {
      let candidate = row
      while (candidate >= from && skipRows.has(candidate)) {
        candidate -= 1
      }
      row = candidate >= from ? candidate : row
    }
    const entry = {
      column: image.from.column,
      image: {
        sha1: image.sha1,
        alt: `Imagen ${index + 1} de ${sheet.name}`,
        widthMm: Math.round((image.widthMm ?? 10) * 100) / 100,
        heightMm: Math.round((image.heightMm ?? 10) * 100) / 100,
      },
    }
    imagesByRow.set(row, [...(imagesByRow.get(row) ?? []), entry])
  }

  const heightByRow = new Map<number, number>()
  for (const entry of sheet.rows ?? []) {
    heightByRow.set(entry.row, entry.hidden ? 0 : entry.mm)
  }

  // El 100 % de una fila es el ancho del documento, no el de la hoja: los
  // margenes de los extremos ya se han descartado.
  const totalWidth = widths
    .slice(firstColumn - 1, usedColumns)
    .reduce((sum, width) => sum + width, 0) || 1
  const covered = new Set<string>()
  const rows: any[] = []

  for (let row = from; row <= to; row++) {
    const fragments = splitRow(row, firstColumn, usedColumns, cellAt, merges, covered)
    if (skipRows.has(row)) {
      continue
    }

    const rowImages = (imagesByRow.get(row) ?? [])
      .slice()
      .sort((a, b) => a.column - b.column)
    const cells = fragments.map((fragment, fragmentIndex) => {
      const style = (fragment.cell?.style ?? {}) as any
      // Las imagenes de este fragmento.
      //
      // Se toman **todas** las que caen dentro, no solo la primera: los
      // pictogramas del permiso de trabajo van varios por casilla. Y las que
      // caen en una columna tapada por una combinacion vertical, que no tiene
      // fragmento propio, se recogen en el fragmento inmediatamente anterior:
      // asi conservan su sitio en el orden de lectura, que es lo que da sentido
      // a una rejilla de 28 pictogramas.
      const isLast = fragment === fragments[fragments.length - 1]
      const nextFrom = isLast ? Number.MAX_SAFE_INTEGER : fragments[fragmentIndex + 1].from
      const images = rowImages
        .filter(entry => entry.column >= fragment.from && entry.column < nextFrom)
        .map(entry => entry.image)
      const width = widths
        .slice(fragment.from - 1, fragment.from - 1 + fragment.span)
        .reduce((sum, value) => sum + value, 0)

      return {
        id: `${row}-${fragment.from}`,
        // Porcentaje del ancho de la fila. Se redondea a dos decimales: mas
        // precision no se aprecia y engorda el fichero sin motivo.
        width: Math.round((width / totalWidth) * 10000) / 100,
        // El ancho real, que hace falta para saber si un rotulo cabe. No viaja
        // al modelo: se descarta en cuanto se ha usado.
        widthMm: width,
        fontMm: fontMm(style),
        wrap: !!style.wrapText,
        content: images.length > 0
          // Una casilla con pictograma suele traer tambien su rotulo debajo.
          ? { kind: 'image', images, ...(textOf(fragment.cell) ? { text: textOf(fragment.cell) } : {}) }
          : contentOf(fragment.cell, cellByRef),
        ...(style.bold ? { bold: true } : {}),
        ...(style.horizontal && style.horizontal !== 'left'
          ? { align: style.horizontal === 'right' ? 'right' : 'center' }
          : {}),
        ...(style.fill ? { fill: true } : {}),
        // Solo llevan recuadro las celdas que lo traen en la hoja. Ponerlo en
        // todas convertiria el documento en una cuadricula.
        ...(Array.isArray(style.borders) && style.borders.length > 0
          ? {}
          : { boxed: false }),
      }
    })

    // Se funden los huecos contiguos que no llevan nada: ni texto, ni recuadro,
    // ni fondo. En el permiso de trabajo eran mas de mil celdas vacias, una por
    // cada posicion suelta de la hoja, y no aportan nada: un hueco de cuatro
    // columnas es el mismo espacio en blanco que cuatro huecos de una.
    const merged: any[] = []
    for (const cell of cells) {
      const hueco = cell.content.kind === 'blank' && !cell.fill && cell.boxed === false
      const previo = merged[merged.length - 1]
      const previoHueco = previo &&
        previo.content.kind === 'blank' && !previo.fill && previo.boxed === false
      if (hueco && previoHueco) {
        previo.width = Math.round((previo.width + cell.width) * 100) / 100
        previo.widthMm += cell.widthMm
        continue
      }
      merged.push(cell)
    }

    spill(merged)
    for (const cell of merged) {
      delete cell.widthMm
      delete cell.fontMm
      delete cell.wrap
    }

    const conContenido = merged.some(
      cell => cell.content.kind !== 'blank' || cell.fill || cell.boxed !== false
    )
    if (!conContenido && rowImages.length === 0) {
      continue
    }
    if (!conContenido) {
      // La fila solo trae imagenes; sus celdas vacias no aportan nada.
      merged.length = 0
    }

    const heightMm = heightByRow.get(row) ?? sheet.defaultRowMm
    rows.push({
      id: `f${row}`,
      // Fila de la hoja de la que sale. Se usa para repartir las filas
      // alrededor de la lista de personal; sacarla del `id` con `slice` daba
      // `NaN` en las filas de imagenes sueltas, que se llaman `f33i`, y esas
      // filas se perdian al repartir.
      sourceRow: row,
      cells: merged,
      ...(heightMm > 0 ? { minHeightMm: Math.round(heightMm * 100) / 100 } : {}),
    })

    // Imagenes que no encontraron celda donde ir.
    //
    // Ocurre en las filas que una combinacion vertical tapa por completo: no
    // producen ningun fragmento, asi que no hay donde anclarlas. Se les da una
    // fila propia en su sitio, que es preferible a perderlas: los pictogramas
    // del permiso de trabajo son contenido normativo.
    const colocadas = new Set(
      merged
        .filter((cell: any) => cell.content.kind === 'image')
        .flatMap((cell: any) => cell.content.images.map((image: any) => image.sha1))
    )
    const sueltas = rowImages
      .map(entry => entry.image)
      .filter(image => !colocadas.has(image.sha1))

    // Solo queda suelta una imagen si la fila no produjo ningun fragmento, que
    // pasa cuando una combinacion vertical la tapa entera.
    if (sueltas.length > 0) {
      rows.push({
        id: `f${row}i`,
        sourceRow: row,
        cells: [{
          id: `${row}-img`,
          width: 100,
          content: { kind: 'image', images: sueltas },
          boxed: false,
        }],
      })
    }
  }

  return rows
}

/**
 * Agrupa las filas en secciones.
 *
 * Una fila que es una sola celda a todo lo ancho, con texto y en negrita o con
 * fondo, es un titulo de bloque en estas plantillas: `INFORMACIÓN GENERAL`,
 * `EQUIPO DE PROTECCIÓN PERSONAL`. Se usa como cabecera de la seccion y las
 * filas que le siguen cuelgan de ella. Es lo que da al documento la estructura
 * que en Excel solo se intuye por el formato.
 */
/**
 * Si un texto va practicamente todo en mayusculas.
 *
 * Es lo que separa un titulo de bloque de una pregunta del cuestionario. En
 * estos formatos los titulos son `SECCIÓN IV: PLAN DE EMERGENCIA`,
 * `OPERACIONES`, `TRABAJO EN ALTURA`; las preguntas van en minusculas y muchas
 * quedan solas en su fila porque sus casillas de respuesta estan en blanco.
 */
function mostlyUpperCase(text: string): boolean {
  const letters = [...text].filter(ch => /\p{L}/u.test(ch))
  if (letters.length < 3) {
    return false
  }
  const upper = letters.filter(ch => ch === ch.toUpperCase()).length
  return upper / letters.length >= 0.7
}

/**
 * Una cabecera de seccion numerada: `SECCION I: DESCRIPCION DEL TRABAJO`.
 *
 * El permiso de trabajo las numera del I al VIII y es su indice real. Se
 * reconocen por el rotulo y no por el formato porque comparten fila con su
 * aclaracion —`(llenado por el Ejecutante)`— y la regla del titulo suelto no
 * las veia.
 */
const SECTION_HEADING = /^\s*SECCI[OÓ]N\s+[IVXLCDM]+[ :.]/i

/** El texto de una celda, si lo tiene. */
function cellText(cell: any): string {
  return cell?.content?.kind === 'text' ? String(cell.content.text).trim() : ''
}

/**
 * Si una fila es un titulo suelto: una unica celda con texto, corta y
 * destacada. Es lo que separa `TRABAJO EN ALTURA` de una pregunta del
 * cuestionario, que lleva al lado sus casillas de respuesta.
 */
function loneText(row: any): string {
  const conContenido = row.cells.filter((cell: any) => cell.content.kind !== 'blank')
  return conContenido.length === 1 ? cellText(conContenido[0]) : ''
}

function loneTitle(row: any): string {
  const conContenido = row.cells.filter((cell: any) => cell.content.kind !== 'blank')
  const text = loneText(row)
  // Un rotulo al que la hoja le da la banda entera es una cabecera aunque no
  // vaya en negrita ni con fondo. `RESPONSABLE DEL REGISTRO:` de la charla de
  // granel y `ANTES DEL INICIO DEL TRABAJO` del permiso son eso: los mismos
  // titulos que las otras plantillas si destacan, sin destacar. Los membretes
  // que tambien ocupan la banda entera ya los aparta `bannerLabels`.
  const destacada = conContenido.length === 1 &&
    (conContenido[0].bold || conContenido[0].fill || conContenido[0].width >= 99.5)
  return text.length > 2 && text.length <= 80 && destacada && mostlyUpperCase(text)
    ? text
    : ''
}

/**
 * Clave con la que se comparan dos rotulos.
 *
 * Sin tildes, en mayusculas y con los espacios colapsados: el permiso repite
 * su membrete escrito `EL DIA` arriba y `EL DÍA` abajo, y comparando el texto
 * tal cual salian dos rotulos distintos.
 */
function labelKey(text: string): string {
  return text
    .normalize('NFD')
    // `\p{M}` son las marcas diacriticas que deja `NFD` al separarlas.
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Los rotulos que salen mas de una vez en el documento: son membretes, no
 * titulos.
 *
 * El permiso de trabajo se imprime en dos hojas y repite en cada una
 * `ESTE PERMISO QUEDA CANCELADO AL PRESENTARSE UNA EMERGENCIA` y
 * `VALIDO PARA: EL DIA - HORA - EQUIPO Y TRABAJOS INDICADOS`. Los dos cumplian
 * la regla del titulo suelto y partian el documento por donde no tocaba: la
 * seccion que abrian no era una seccion, y las ocho de verdad quedaban dentro
 * de un mismo bloque sin nombre.
 *
 * Se cuentan sobre el documento entero y no sobre cada tramo: la lista de
 * personal parte el permiso en dos, y cada mitad veia una sola aparicion.
 */
function bannerLabels(rows: any[]): Set<string> {
  // Se cuentan todas las filas de un solo texto, lleven o no el formato de un
  // titulo: el permiso escribe su membrete en negrita en una hoja y sin negrita
  // en la otra, y exigiendo el formato solo se veia una de las dos.
  const veces = new Map<string, number>()
  for (const row of rows) {
    const text = loneText(row)
    if (text) {
      const key = labelKey(text)
      veces.set(key, (veces.get(key) ?? 0) + 1)
    }
  }
  return new Set([...veces].filter(([, count]) => count > 1).map(([key]) => key))
}

function groupIntoSections(rows: any[], prefix: string, banners: Set<string>): any[] {
  // `sourceRow` solo sirve para repartir; el modelo no lo lleva.
  rows = rows.map(({ sourceRow, ...row }) => row)

  const sections: any[] = []
  let current: any = null

  const start = (title: string | undefined) => {
    current = {
      kind: 'rows',
      id: `${prefix}-${sections.length + 1}`,
      ...(title ? { title } : {}),
      rows: [],
    }
    sections.push(current)
  }

  for (const row of rows) {
    const conContenido = row.cells.filter((cell: any) => cell.content.kind !== 'blank')
    const heading = conContenido.find((cell: any) => SECTION_HEADING.test(cellText(cell)))

    if (heading) {
      start(cellText(heading))
      // Lo que acompana al titulo en su fila sigue siendo contenido del
      // formato: `(llenado por el Ejecutante)` dice quien rellena la seccion.
      const resto = row.cells.filter((cell: any) => cell !== heading)
      if (resto.some((cell: any) => cell.content.kind !== 'blank')) {
        current.rows.push({ ...row, cells: rebalance(resto) })
      }
      continue
    }

    const title = loneTitle(row)
    if (title && !banners.has(labelKey(title))) {
      start(title)
      continue
    }

    if (!current) {
      start(undefined)
    }
    current.rows.push(row)
  }

  // Una seccion que se queda sin filas es un titulo con su espacio debajo para
  // escribir: `OBSERVACIONES DE AUDITORIA` es eso. Se le da una fila en blanco
  // en vez de repetir el rotulo, que ya esta en el titulo.
  for (const section of sections) {
    if (section.rows.length === 0) {
      section.rows.push({
        id: `${section.id}-1`,
        cells: [{ id: `${section.id}-1a`, width: 100, content: { kind: 'blank' } }],
        minHeightMm: 12,
      })
    }
  }

  return sections
}

/** Devuelve unos anchos que vuelven a sumar 100 tras quitar una celda. */
function rebalance(cells: any[]): any[] {
  const total = cells.reduce((sum, cell) => sum + cell.width, 0) || 1
  let assigned = 0
  return cells.map((cell, index) => {
    const width = index === cells.length - 1
      ? Math.round((100 - assigned) * 100) / 100
      : Math.round((cell.width / total) * 10000) / 100
    assigned += width
    return { ...cell, width }
  })
}

/**
 * Fila de la hoja que lleva los rotulos de las columnas de personal.
 *
 * Suele ser la de encima de la lista (asistencia 7, ATS 22, PTS 98), pero en la
 * charla la cabecera es la primera fila del bloque (27). Se reconoce por tener
 * un rotulo escrito en la columna del nombre.
 */
function personHeaderRow(sheet: Sheet, block: PersonBlock): number {
  const nameColumn = block.lanes[0].nombre
  const first = Math.min(...block.rows)
  for (const row of [first - 1, first]) {
    const label = sheet.cells.find(
      cell => cell.row === row && cell.column === nameColumn && cell.type === 's' && !cell.formula
    )
    if (label && String(label.value ?? '').trim()) {
      return row
    }
  }
  return 0
}

/** Texto de un rotulo sin los espacios de relleno que la plantilla usa para centrar. */
function cleanLabel(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * La tabla de personal de una hoja.
 *
 * Las columnas salen **de la fila de cabecera de la hoja original**, en su
 * orden, con su rotulo y su ancho. Antes se declaraban aqui a mano: la
 * asistencia imprimia la cabecera original de 12 columnas y, debajo, otra de 9
 * que no casaba con ella (le faltaban FIRMA INGRESO, FIRMA TIEMPO DE
 * REFRIGERIO, FIRMA SALIDA y HORAS EXTRAS), y la charla ponia el cargo antes que
 * el nombre cuando la hoja lo pone despues.
 *
 * Que columna lleva que dato lo dice el bloque del motor (`lanes`), que ya sabe
 * en que letra va el nombre, el DNI o la hora. Una columna de la cabecera que
 * el bloque no rellena queda en blanco para escribir a mano. La primera que se
 * llama "Firma" recibe la firma registrada; ver `signature` en el modelo.
 *
 * El ATS y el permiso imprimen dos personas por fila. El documento generado
 * lista una por fila con las columnas de la primera mitad: el orden de lectura
 * (01..20 y luego 21..40) es el mismo.
 */
function personTable(block: PersonBlock, sheet: Sheet, merges: Map<string, MergeInfo>, widths: number[]) {
  const lane = block.lanes[0]
  const headerRow = personHeaderRow(sheet, block)
  const laneColumns = (candidate: PersonLane) =>
    Object.values(candidate).filter(Boolean).map(letter => columnToNumber(letter as string))
  const start = Math.min(...laneColumns(lane))
  const end = block.lanes[1] ? Math.min(...laneColumns(block.lanes[1])) - 1 : widths.length

  const sourceOf = new Map<number, string>()
  const fields: Array<[keyof PersonLane, string]> = [
    ['numero', 'numero'],
    ['cargo', 'cargo'],
    ['nombre', 'nombre'],
    ['documento', 'documento'],
    ['horaIngreso', 'horaIngreso'],
    ['horaSalida', 'horaSalida'],
  ]
  for (const [field, source] of fields) {
    if (lane[field]) sourceOf.set(columnToNumber(lane[field] as string), source)
  }

  const headers = sheet.cells
    .filter(cell => cell.row === headerRow && cell.type === 's' && !cell.formula && cleanLabel(cell.value))
    .map(cell => ({ column: columnToNumber(cell.column), label: cleanLabel(cell.value) }))
    .filter(header => header.column >= start && header.column <= end)
    .sort((a, b) => a.column - b.column)

  const columns: any[] = []
  const usedIds = new Set<string>()
  let signatureTaken = false
  headers.forEach((header, index) => {
    const merge = merges.get(`${headerRow}|${header.column}`)
    const next = headers[index + 1]?.column ?? end + 1
    const right = Math.min(merge?.right ?? next - 1, next - 1, end)
    let widthMm = 0
    for (let column = header.column; column <= right; column++) {
      widthMm += widths[column - 1] ?? 0
    }
    const source = sourceOf.get(header.column) ?? 'firma'
    const isSignature = !sourceOf.has(header.column) && /firma/i.test(header.label)
    const signature = isSignature && !signatureTaken
    signatureTaken = signatureTaken || signature

    // La columna de la firma registrada conserva el id `firma` en todos los
    // documentos: es el que ya llevan las definiciones publicadas.
    let id = signature
      ? 'firma'
      : source === 'firma'
        ? slug(header.label) || `columna-${index + 1}`
        : source
    while (usedIds.has(id)) id = `${id}-${index + 1}`
    usedIds.add(id)

    columns.push({
      id,
      label: header.label,
      source,
      widthMm: Math.round(widthMm * 100) / 100,
      ...(source === 'nombre' || source === 'cargo' ? {} : { align: 'center' }),
      ...(signature ? { signature: true } : {}),
    })
  })

  if (!columns.some(column => column.source === 'nombre')) {
    throw new Error(`${sheet.name}: la cabecera de personal (fila ${headerRow}) no trae la columna del nombre`)
  }

  // Capacidad real del bloque en la plantilla: sus huecos por lane.
  const capacity = block.rows.length * block.lanes.length

  return {
    kind: 'table',
    id: 'personal',
    title: 'PERSONAL',
    columns,
    leadingRows: [
      {
        id: 'jefe-cubierta',
        cargo: 'JEFE DE CUBIERTA',
        nameSource: 'jefeCubierta',
        documentSource: 'jefeCubierta',
      },
    ],
    minRows: capacity,
    rowsPerPage: capacity,
  }
}

function buildDocument(sheet: Sheet, block: PersonBlock | undefined, seriesId: string) {
  const merges = parseMerges(sheet)

  // El extremo real de la hoja. Las combinaciones cuentan: el permiso de
  // trabajo tiene celdas que llegan a la columna 30 cuando la ultima con
  // contenido es la 26.
  let usedColumns = Math.max(
    1,
    ...sheet.cells.map(cell => columnToNumber(cell.column)),
    ...(sheet.images ?? []).map(image => image.from.column),
    ...(sheet.merges ?? []).map(merge => columnToNumber(merge.to.column))
  )
  let lastRow = Math.max(
    1,
    ...sheet.cells.map(cell => cell.row),
    ...(sheet.images ?? []).map(image => image.from.row),
    ...(sheet.merges ?? []).map(merge => merge.to.row)
  )

  // El area de impresion manda sobre el extremo de la hoja.
  //
  // El permiso de trabajo declara `$A$1:$AA$122`, y sin embargo tiene
  // combinaciones que llegan a la columna 37. Esas once columnas de mas miden
  // 192 mm, la mitad del documento, y salian como una casilla vacia del 33 %
  // al final de cada fila: el contenido quedaba comprimido en dos tercios de
  // la hoja y todo parecia desordenado. La hoja ya dice donde acaba el
  // documento; basta con hacerle caso.
  const area = printRange(sheet)
  if (area) {
    usedColumns = Math.min(usedColumns, area.column)
    lastRow = Math.min(lastRow, area.row)
  }

  // Y las columnas de los extremos que no llevan nada tampoco son documento.
  //
  // Son los margenes que la plantilla deja a izquierda y derecha. Dentro se
  // respetan, porque separan bloques; en los bordes solo anaden una casilla
  // vacia a cada una de las 104 filas del permiso.
  const firstColumn = trimStart(sheet, usedColumns, lastRow)
  usedColumns = trimEnd(sheet, usedColumns, lastRow, firstColumn)

  const meta = documentMeta(sheet.cells)
  const title = documentTitle(sheet.cells, sheet.name)
  const widths = columnWidths(sheet, usedColumns)

  const skip = new Set<number>()
  let firstPerson = 0
  let lastPerson = 0
  if (block) {
    firstPerson = Math.min(...block.rows)
    lastPerson = Math.max(...block.rows)
    // La banda entera de la lista la sustituye la tabla de personal: dentro hay
    // datos de la nombrada de ejemplo y cabeceras de columna repetidas.
    for (let row = firstPerson; row <= lastPerson; row++) {
      skip.add(row)
    }
    // Y su fila de cabecera: la reimprime la tabla, con esos mismos rotulos.
    // Dejarla tambien como fila la duplicaba encima de la tabla.
    const headerRow = personHeaderRow(sheet, block)
    if (headerRow) {
      skip.add(headerRow)
    }
  }

  const allRows = buildRows(sheet, merges, 1, lastRow, firstColumn, usedColumns, skip, widths)

  const banners = bannerLabels(allRows)

  if (!block) {
    const soloFilas = groupIntoSections(allRows, 'b', banners)
    applySignatureCells(soloFilas, seriesId, sheet.name)
    return { sections: soloFilas, title, meta }
  }

  // Las filas se reparten alrededor de la lista de personal, conservando el
  // orden de la hoja: lo de arriba, la lista, y lo de abajo.
  const above = allRows.filter(row => row.sourceRow < firstPerson)
  const below = allRows.filter(row => row.sourceRow > lastPerson)

  const sections: any[] = [
    ...groupIntoSections(above, 'a', banners),
    personTable(block, sheet, merges, widths),
    ...groupIntoSections(below, 'c', banners),
  ]

  applySignatureCells(sections, seriesId, sheet.name)

  return { sections, title, meta }
}

/**
 * Convierte en casilla de firma el hueco que cada responsable tiene en su fila.
 *
 * Se hace despues de construir las filas y no dentro de `contentOf` porque la
 * decision necesita ver la fila entera —de que responsable es— y el documento,
 * y `contentOf` solo ve la celda.
 *
 * Si un responsable declarado no aparece, se avisa. Es la senal de que el
 * cliente movio algo en su plantilla: la firma dejaria de imprimirse sin que
 * nadie lo notara, que es exactamente lo que no puede pasar.
 */
function applySignatureCells(sections: any[], documentId: string, sheetName: string) {
  const wanted = SIGNATURE_CELLS[documentId]
  if (!wanted) {
    return
  }
  const pendientes = new Set(wanted.sources)

  for (const section of sections) {
    if (section.kind !== 'rows') {
      continue
    }
    for (const row of section.rows) {
      // De que responsable es esta fila. Sin dato de responsable, la fila no
      // recibe firma: es lo que mantiene la del supervisor fuera de la casilla
      // del inspector.
      const dato = row.cells.find(
        (cell: any) =>
          cell.content.kind === 'data' && wanted.sources.includes(cell.content.source)
      )
      if (!dato) {
        continue
      }
      // La casilla de la columna donde el documento pone su cabecera FIRMA. La
      // columna sale del identificador (`<fila>-<columna>`), que es lo unico
      // que queda de la hoja una vez agrupadas las secciones: `sourceRow` se
      // descarta ahi porque el modelo no lleva coordenadas.
      //
      // Y sigue en blanco: si ya llevara algo escrito, taparlo perderia un dato.
      const hueco = row.cells.find(
        (cell: any) =>
          Number(String(cell.id).split('-')[1]) === wanted.column &&
          cell.content.kind === 'blank'
      )
      if (!hueco) {
        continue
      }
      pendientes.delete(dato.content.source)
      hueco.content = { kind: 'signature', source: dato.content.source }
    }
  }

  for (const source of pendientes) {
    console.warn(
      `  ${sheetName}: no se encontro la casilla de firma de "${source}" en la columna ` +
      `${wanted.column}; la firma de ese responsable no se imprimira.`
    )
  }
}

// --- imagenes -----------------------------------------------------------------

function extractAssets(): number {
  fs.mkdirSync(ASSETS_DIR, { recursive: true })
  const written = new Set<string>()

  for (const template of FORMAT_TEMPLATES) {
    const workbook = readWorkbook(path.join(TEMPLATES_DIR, template.file))
    for (const sheet of workbook.sheets) {
      for (const image of sheet.images ?? []) {
        if (written.has(image.sha1)) {
          continue
        }
        const source = workbook.media.get(image.sha1)
        if (!source) {
          continue
        }
        fs.writeFileSync(
          path.join(ASSETS_DIR, `${image.sha1}.${image.extension}`),
          Buffer.from(source.bytes)
        )
        written.add(image.sha1)
      }
    }
  }
  return written.size
}

// --- salida --------------------------------------------------------------------

/** Serie por documento. Cada uno lleva la suya, con su contador propio. */
function seriesFor(documentId: string) {
  // Prefijos legibles y distintos entre si. El permiso conserva serie global
  // porque ya tiene correlativos vivos repartidos: pasarla a anual reiniciaria
  // la cuenta y repetiria numeros ya firmados.
  const PREFIXES: Record<string, { prefix: string; scope: 'year' | 'global' }> = {
    asistencia: { prefix: 'AST', scope: 'year' },
    charla: { prefix: 'CHA', scope: 'year' },
    pts: { prefix: 'PTS', scope: 'global' },
    ats: { prefix: 'ATS', scope: 'year' },
  }
  const known = PREFIXES[documentId]
  return {
    id: documentId,
    prefix: known?.prefix ?? documentId.slice(0, 3).toUpperCase(),
    scope: known?.scope ?? 'year',
    pad: 4,
  }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const assets = extractAssets()
  const summary: string[] = []

  for (const template of FORMAT_TEMPLATES) {
    const workbook = readWorkbook(path.join(TEMPLATES_DIR, template.file))
    const blockBySheet = new Map<string, PersonBlock>()
    for (const block of template.blocks) {
      if (!blockBySheet.has(block.sheet)) {
        blockBySheet.set(block.sheet, block)
      }
    }

    // Los cuatro documentos, en el orden de `DOCUMENTS`, no en el que las
    // hojas aparezcan en el libro: ese orden cambia de una plantilla a otra
    // (en mercaderia la inspeccion va la segunda) y el formato emitido tiene
    // que salir siempre igual.
    const documents: any[] = []
    for (const wanted of DOCUMENTS) {
      const sheet = workbook.sheets.find(
        candidate => !EXCLUDED[candidate.name] && wanted.match.test(candidate.name)
      )
      if (!sheet) {
        console.warn(`  ${template.id}: no se encontro hoja para "${wanted.id}"`)
        continue
      }
      const { sections, meta } = buildDocument(sheet, blockBySheet.get(sheet.name), wanted.id)
      documents.push({
        // `id` estable y comun a las tres plantillas; el nombre de la hoja
        // cambia con la carga y no sirve de identificador.
        id: wanted.id,
        name: sheet.name,
        label: wanted.label,
        orientation: sheet.pageSetup?.orientation === 'landscape' ? 'landscape' : 'portrait',
        // Una hoja por cada salto de pagina manual de la plantilla, mas la primera.
        printPages: (sheet.rowBreaks ?? []).length + 1,
        ...(meta.code ? { documentCode: meta.code } : {}),
        ...(meta.version ? { documentVersion: meta.version } : {}),
        ...(meta.date ? { documentDate: meta.date } : {}),
        numbering: { kind: 'own', series: seriesFor(wanted.id) },
        sections,
      })
    }

    const definition = {
      formatType: template.id,
      label: template.label,
      version: 1,
      documents,
    }
    const file = path.join(OUT_DIR, `${template.id}.json`)
    fs.writeFileSync(file, JSON.stringify(definition, null, 1))

    let rows = 0
    let cells = 0
    let images = 0
    for (const doc of documents) {
      for (const section of doc.sections as any[]) {
        for (const row of section.rows ?? []) {
          rows++
          cells += row.cells.length
          images += row.cells.filter((cell: any) => cell.content.kind === 'image').length
        }
      }
    }
    summary.push(
      `${template.id.padEnd(20)} documentos=${String(documents.length).padStart(2)}` +
      `  filas=${String(rows).padStart(4)}  celdas=${String(cells).padStart(5)}` +
      `  imagenes=${String(images).padStart(3)}`
    )
  }

  console.log(summary.join('\n'))
  console.log(`\nImagenes en la biblioteca: ${assets}`)
  console.log(`Definiciones             : ${OUT_DIR}`)
}

main()
