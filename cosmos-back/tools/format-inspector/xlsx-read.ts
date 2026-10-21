/**
 * Lectura estructurada de una plantilla `.xlsx`.
 *
 * No es un motor de hojas de calculo: es un extractor. Abre el zip, lee el XML
 * y devuelve lo que hace falta para **volver a construir** el documento en otro
 * medio: que dice cada celda, como esta formateada, donde estan las
 * combinaciones, que anchos y altos tiene la rejilla, y donde va cada imagen.
 *
 * Existe porque el motor v2 no rellena la plantilla del cliente, la sustituye.
 * Para sustituirla sin perder nada primero hay que inventariar lo que lleva
 * dentro, y eso son 817 rotulos y 41 imagenes repartidos en tres libros.
 *
 * Se lee en crudo, con expresiones regulares sobre el XML, por el mismo motivo
 * que `src/modules/format/xlsx-patcher.ts`: las librerias de hojas de calculo
 * tropiezan con estas plantillas concretas. Aqui ademas solo se lee, nunca se
 * escribe, asi que no hay riesgo de perder nada por el camino.
 */

import { unzipSync } from 'fflate'
import * as fs from 'fs'

/** EMU por pixel a 96 ppp. Es la unidad en la que Office ancla los dibujos. */
const EMU_PER_PX = 9525

/** Ancho en pixeles del digito de la fuente por defecto (Calibri 11). */
const MAX_DIGIT_WIDTH = 7

const PX_TO_MM = 25.4 / 96
const PT_TO_MM = 25.4 / 72

const decoder = new TextDecoder()

// --- tipos -------------------------------------------------------------------

/** Como se ve una celda: lo minimo para reproducir su jerarquia visual. */
export interface CellStyle {
  bold: boolean
  italic: boolean
  /** Tamano de fuente en puntos. */
  size: number | null
  fontName: string | null
  /** Color de la fuente en `RRGGBB`, si es explicito. */
  color: string | null
  /** Color de relleno en `RRGGBB`, si lo hay. */
  fill: string | null
  horizontal: string | null
  vertical: string | null
  wrapText: boolean
  /** Codigo de formato numerico, por ejemplo `dd/mm/yyyy`. */
  numFmt: string | null
  /** Lados con borde, por ejemplo `['top','left']`. */
  borders: string[]
}

export interface Cell {
  ref: string
  column: string
  row: number
  /** `s` texto, `n` numero, `b` booleano, `e` error, `d` fecha ISO. */
  type: 's' | 'n' | 'b' | 'e' | 'd'
  value: string | number | boolean
  /** Formula sin el `=` inicial, cuando la celda la lleva. */
  formula?: string
  style: CellStyle
}

export interface MergedRange {
  ref: string
  from: { column: string; row: number }
  to: { column: string; row: number }
}

export interface ColumnWidth {
  min: number
  max: number
  /** Ancho en unidades de Excel. */
  width: number
  px: number
  mm: number
  hidden: boolean
}

export interface RowHeight {
  row: number
  /** Alto en puntos. */
  height: number
  mm: number
  hidden: boolean
}

/**
 * Recorte de la imagen de origen, en tanto por ciento desde cada lado.
 *
 * No es un detalle menor: varias plantillas usan una sola imagen grande como
 * hoja de pictogramas y sacan cada icono recortandola. Sin esto, la biblioteca
 * de recursos tendria un solo recurso donde el documento muestra ocho iconos
 * distintos.
 */
export interface CropBox {
  left: number
  top: number
  right: number
  bottom: number
}

export interface SheetImage {
  /** Nombre de la parte dentro del zip, por ejemplo `xl/media/image3.png`. */
  part: string
  /** SHA-1 del contenido. Es la clave de la biblioteca de recursos. */
  sha1: string
  extension: string
  bytes: number
  /** Celda de la esquina superior izquierda, en base 1. */
  from: { column: number; row: number }
  /** Celda de la esquina inferior derecha, cuando el ancla es de dos celdas. */
  to: { column: number; row: number } | null
  widthPx: number | null
  heightPx: number | null
  widthMm: number | null
  heightMm: number | null
  /** `twoCell` se estira con la rejilla, `oneCell` y `absolute` no. */
  anchor: 'twoCell' | 'oneCell' | 'absolute'
  /** Recorte sobre la imagen de origen, si lo lleva. */
  crop: CropBox | null
  /**
   * `true` cuando el anclaje agrupa varias imagenes. Todas comparten la celda
   * de anclaje, asi que su posicion fina esta en `offsetEmu`.
   */
  grouped: boolean
  /** Desplazamiento propio dentro del grupo, en EMU. */
  offsetEmu: { x: number; y: number } | null
}

export interface PageSetup {
  paperSize: number | null
  orientation: string | null
  /** Escala de impresion en porcentaje, cuando no se ajusta a pagina. */
  scale: number | null
  fitToWidth: number | null
  fitToHeight: number | null
  /** `true` si la hoja usa ajuste a pagina en vez de escala fija. */
  fitToPage: boolean
  margins: Record<string, number> | null
}

export interface Sheet {
  name: string
  /** Posicion en el libro, en base 1. */
  index: number
  /** Parte del zip que la contiene. */
  part: string
  /** `hidden` o `veryHidden` si la hoja no se ve. */
  state: string
  dimension: string | null
  printArea: string | null
  cells: Cell[]
  merges: MergedRange[]
  columns: ColumnWidth[]
  rows: RowHeight[]
  /**
   * Ancho de una columna que la hoja no declara, en milimetros.
   *
   * Sale de `sheetFormatPr/@defaultColWidth`. No es un detalle menor: el ATS
   * deja siete columnas sin declarar, y darles un ancho inventado desplaza
   * lateralmente todo lo que va a su derecha.
   */
  defaultColumnMm: number
  /** Alto de una fila que la hoja no declara, en milimetros. */
  defaultRowMm: number
  images: SheetImage[]
  pageSetup: PageSetup
  /** Saltos de pagina horizontales declarados a mano. */
  rowBreaks: number[]
  dataValidations: { ref: string; type: string | null; formula: string | null }[]
}

export interface Workbook {
  file: string
  sheets: Sheet[]
  /** Nombres definidos del libro, sin los `_xlnm.Print_Area`. */
  definedNames: { name: string; value: string; sheetIndex: number | null }[]
  /** Recursos por SHA-1, con el contenido para poder volcarlos a disco. */
  media: Map<string, { extension: string; bytes: Uint8Array }>
}

// --- utilidades de referencia ------------------------------------------------

export function columnToNumber(column: string): number {
  let n = 0
  for (const ch of column.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n
}

export function numberToColumn(n: number): string {
  let s = ''
  let rest = n
  while (rest > 0) {
    const mod = (rest - 1) % 26
    s = String.fromCharCode(65 + mod) + s
    rest = Math.floor((rest - mod) / 26)
  }
  return s
}

function splitRef(ref: string): { column: string; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase())
  if (!m) {
    throw new Error(`Referencia de celda invalida: ${ref}`)
  }
  return { column: m[1], row: Number(m[2]) }
}

// --- utilidades de XML -------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeXml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16))
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(Number(entity.slice(1)))
    }
    return ENTITIES[entity] ?? whole
  })
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag)
  return m ? decodeXml(m[1]) : null
}

function numAttr(tag: string, name: string): number | null {
  const raw = attr(tag, name)
  return raw === null || raw === '' ? null : Number(raw)
}

function boolAttr(tag: string, name: string): boolean {
  const raw = attr(tag, name)
  return raw === '1' || raw === 'true'
}

/** Texto plano de un `<si>` o de un `<is>`, concatenando sus `<t>`. */
function richText(xml: string): string {
  const parts = [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => decodeXml(m[1]))
  return parts.join('')
}

/** Codigos de formato numerico incorporados que nos interesa distinguir. */
const BUILTIN_NUM_FMT: Record<number, string> = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00',
  9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy',
  18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss',
  22: 'dd/mm/yyyy h:mm', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0',
  49: '@',
}

// --- estilos -----------------------------------------------------------------

interface StyleTables {
  /** Estilo resuelto por indice de `cellXfs`. */
  byIndex: CellStyle[]
}

function parseStyles(xml: string | null): StyleTables {
  const empty: CellStyle = {
    bold: false, italic: false, size: null, fontName: null, color: null,
    fill: null, horizontal: null, vertical: null, wrapText: false,
    numFmt: null, borders: [],
  }
  if (!xml) {
    return { byIndex: [] }
  }

  const numFmts: Record<number, string> = { ...BUILTIN_NUM_FMT }
  for (const m of xml.matchAll(/<numFmt\b[^>]*\/>/g)) {
    const id = numAttr(m[0], 'numFmtId')
    const code = attr(m[0], 'formatCode')
    if (id !== null && code !== null) {
      numFmts[id] = code
    }
  }

  const fontsBlock = /<fonts\b[^>]*>([\s\S]*?)<\/fonts>/.exec(xml)?.[1] ?? ''
  const fonts = [...fontsBlock.matchAll(/<font>([\s\S]*?)<\/font>/g)].map(m => {
    const f = m[1]
    return {
      bold: /<b\s*\/>|<b>/.test(f),
      italic: /<i\s*\/>|<i>/.test(f),
      size: numAttr(/<sz\b[^>]*\/>/.exec(f)?.[0] ?? '', 'val'),
      name: attr(/<(?:rFont|name)\b[^>]*\/>/.exec(f)?.[0] ?? '', 'val'),
      color: attr(/<color\b[^>]*\/>/.exec(f)?.[0] ?? '', 'rgb')?.slice(-6) ?? null,
    }
  })

  const fillsBlock = /<fills\b[^>]*>([\s\S]*?)<\/fills>/.exec(xml)?.[1] ?? ''
  const fills = [...fillsBlock.matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map(m => {
    const pattern = /<patternFill\b[^>]*patternType="([^"]*)"/.exec(m[1])?.[1] ?? 'none'
    if (pattern === 'none') {
      return null
    }
    const fg = attr(/<fgColor\b[^>]*\/>/.exec(m[1])?.[0] ?? '', 'rgb')
    return fg ? fg.slice(-6) : null
  })

  const bordersBlock = /<borders\b[^>]*>([\s\S]*?)<\/borders>/.exec(xml)?.[1] ?? ''
  const borders = [...bordersBlock.matchAll(/<border\b[^>]*>([\s\S]*?)<\/border>/g)].map(m => {
    const sides: string[] = []
    for (const side of ['left', 'right', 'top', 'bottom', 'diagonal']) {
      const tag = new RegExp(`<${side}\\b[^>]*(?:\\/>|>[\\s\\S]*?<\\/${side}>)`).exec(m[1])?.[0] ?? ''
      if (tag && /style="/.test(tag)) {
        sides.push(side)
      }
    }
    return sides
  })

  const cellXfsBlock = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? ''
  const byIndex = [...cellXfsBlock.matchAll(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g)].map(m => {
    const tag = m[0]
    const font = fonts[numAttr(tag, 'fontId') ?? 0]
    const fill = fills[numAttr(tag, 'fillId') ?? 0]
    const border = borders[numAttr(tag, 'borderId') ?? 0]
    const numFmtId = numAttr(tag, 'numFmtId')
    const alignment = /<alignment\b[^>]*\/>/.exec(tag)?.[0] ?? ''
    return {
      bold: font?.bold ?? false,
      italic: font?.italic ?? false,
      size: font?.size ?? null,
      fontName: font?.name ?? null,
      color: font?.color ?? null,
      fill: fill ?? null,
      horizontal: attr(alignment, 'horizontal'),
      vertical: attr(alignment, 'vertical'),
      wrapText: boolAttr(alignment, 'wrapText'),
      numFmt: numFmtId === null ? null : (numFmts[numFmtId] ?? null),
      borders: border ?? [],
    } satisfies CellStyle
  })

  return { byIndex: byIndex.length ? byIndex : [empty] }
}

// --- dibujos e imagenes ------------------------------------------------------

function sha1(bytes: Uint8Array): string {
  // `require` en linea para no arrastrar `crypto` al arbol de tipos publico.
  const crypto = require('crypto') as typeof import('crypto')
  return crypto.createHash('sha1').update(bytes).digest('hex')
}

/**
 * Imagenes de un dibujo.
 *
 * Un anclaje puede llevar **mas de una** imagen: las plantillas agrupan los
 * pictogramas de EPP en un solo grupo dentro del mismo anclaje. Por eso se
 * recorre cada `<xdr:pic>` y no solo el primer `<a:blip>` del anclaje, que era
 * lo que dejaba fuera imagenes sin dar ningun error.
 */
function parseDrawing(
  drawingXml: string,
  drawingRels: Record<string, string>,
  zip: Record<string, Uint8Array>,
  media: Map<string, { extension: string; bytes: Uint8Array }>
): SheetImage[] {
  const images: SheetImage[] = []
  const anchorRe = /<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:\1>/g

  const cellOf = (xml: string) => {
    const col = /<xdr:col>(\d+)<\/xdr:col>/.exec(xml)
    const row = /<xdr:row>(\d+)<\/xdr:row>/.exec(xml)
    return col && row ? { column: Number(col[1]) + 1, row: Number(row[1]) + 1 } : null
  }

  for (const match of drawingXml.matchAll(anchorRe)) {
    const anchorXml = match[0]
    const pics = [...anchorXml.matchAll(/<xdr:pic>[\s\S]*?<\/xdr:pic>/g)].map(m => m[0])
    if (pics.length === 0) {
      continue
    }

    const from = cellOf(/<xdr:from>([\s\S]*?)<\/xdr:from>/.exec(anchorXml)?.[1] ?? '')
    const to = cellOf(/<xdr:to>([\s\S]*?)<\/xdr:to>/.exec(anchorXml)?.[1] ?? '')
    const anchor: SheetImage['anchor'] = match[1] === 'twoCellAnchor' ? 'twoCell'
      : match[1] === 'oneCellAnchor' ? 'oneCell' : 'absolute'

    for (const picXml of pics) {
      const embed = attr(/<a:blip\b[^>]*\/?>/.exec(picXml)?.[0] ?? '', 'r:embed')
      const target = embed ? drawingRels[embed] : null
      if (!target) {
        continue
      }
      const part = ('xl/' + target.replace(/^\.\.\//, '')).replace(/\/\//g, '/')
      const bytes = zip[part]
      if (!bytes) {
        continue
      }
      const digest = sha1(bytes)
      const extension = part.split('.').pop() ?? 'bin'
      if (!media.has(digest)) {
        media.set(digest, { extension, bytes })
      }

      // El tamano propio de la imagen esta en su `<a:ext>`; el del anclaje solo
      // sirve cuando la imagen es la unica del grupo.
      const ext = /<a:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(picXml)
        ?? (pics.length === 1 ? /<a:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(anchorXml) : null)
      const widthPx = ext ? Math.round(Number(ext[1]) / EMU_PER_PX) : null
      const heightPx = ext ? Math.round(Number(ext[2]) / EMU_PER_PX) : null

      const offset = /<a:off\b[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/.exec(picXml)
      const srcRect = /<a:srcRect\b[^>]*\/?>/.exec(picXml)?.[0] ?? null
      const cropSide = (name: string) => (numAttr(srcRect ?? '', name) ?? 0) / 1000

      images.push({
        part,
        sha1: digest,
        extension,
        bytes: bytes.length,
        from: from ?? { column: 1, row: 1 },
        to,
        widthPx,
        heightPx,
        widthMm: widthPx === null ? null : Number((widthPx * PX_TO_MM).toFixed(2)),
        heightMm: heightPx === null ? null : Number((heightPx * PX_TO_MM).toFixed(2)),
        anchor,
        crop: srcRect
          ? { left: cropSide('l'), top: cropSide('t'), right: cropSide('r'), bottom: cropSide('b') }
          : null,
        grouped: pics.length > 1,
        offsetEmu: offset ? { x: Number(offset[1]), y: Number(offset[2]) } : null,
      })
    }
  }

  return images
}

// --- lectura del libro -------------------------------------------------------

function relsOf(zip: Record<string, Uint8Array>, part: string): Record<string, string> {
  const relsPart = part.replace(/^(.*)\/([^/]*)$/, '$1/_rels/$2.rels')
  const xml = zip[relsPart] ? decoder.decode(zip[relsPart]) : null
  if (!xml) {
    return {}
  }
  const map: Record<string, string> = {}
  for (const m of xml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const id = attr(m[0], 'Id')
    const target = attr(m[0], 'Target')
    if (id && target) {
      map[id] = target
    }
  }
  return map
}

export function readWorkbook(file: string): Workbook {
  const zip = unzipSync(fs.readFileSync(file)) as Record<string, Uint8Array>
  const text = (part: string) => (zip[part] ? decoder.decode(zip[part]) : null)

  const workbookXml = text('xl/workbook.xml') ?? ''
  const workbookRels = relsOf(zip, 'xl/workbook.xml')
  const styles = parseStyles(text('xl/styles.xml'))

  const sharedStrings = [
    ...(text('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g),
  ].map(m => richText(m[1]))

  // Los `_xlnm.Print_Area` van por hoja (`localSheetId`); el resto son del libro.
  const printAreas: Record<number, string> = {}
  const definedNames: Workbook['definedNames'] = []
  for (const m of workbookXml.matchAll(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g)) {
    const name = attr(m[1], 'name') ?? ''
    const local = numAttr(m[1], 'localSheetId')
    const value = decodeXml(m[2])
    if (name === '_xlnm.Print_Area' && local !== null) {
      printAreas[local] = value
    } else if (!name.startsWith('_xlnm.')) {
      definedNames.push({ name, value, sheetIndex: local === null ? null : local + 1 })
    }
  }

  const media = new Map<string, { extension: string; bytes: Uint8Array }>()
  const sheets: Sheet[] = []

  const sheetTags = [...workbookXml.matchAll(/<sheet\b[^>]*\/>/g)].map(m => m[0])
  sheetTags.forEach((tag, position) => {
    const name = attr(tag, 'name') ?? `Hoja${position + 1}`
    const rid = attr(tag, 'r:id') ?? attr(tag, 'id') ?? ''
    const target = workbookRels[rid]
    if (!target) {
      return
    }
    const part = ('xl/' + target.replace(/^\/?xl\//, '').replace(/^\.\.\//, '')).replace(/\/\//g, '/')
    const xml = text(part)
    if (xml === null) {
      return
    }

    // --- celdas
    const cells: Cell[] = []
    for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const head = m[1]
      const body = m[2] ?? ''
      const ref = attr(head, 'r')
      if (!ref) {
        continue
      }
      const styleIndex = numAttr(head, 's') ?? 0
      const style = styles.byIndex[styleIndex] ?? styles.byIndex[0]
      const rawType = attr(head, 't') ?? 'n'
      const formula = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1]
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]

      let type: Cell['type']
      let value: Cell['value']
      if (rawType === 's') {
        type = 's'
        value = sharedStrings[Number(raw ?? '-1')] ?? ''
      } else if (rawType === 'inlineStr') {
        type = 's'
        value = richText(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '')
      } else if (rawType === 'str') {
        type = 's'
        value = decodeXml(raw ?? '')
      } else if (rawType === 'b') {
        type = 'b'
        value = raw === '1'
      } else if (rawType === 'e') {
        type = 'e'
        value = decodeXml(raw ?? '')
      } else {
        type = 'n'
        value = raw === undefined ? '' : Number(raw)
      }

      // Sin valor ni formula la celda solo aporta estilo; no entra al inventario.
      if (raw === undefined && !formula && type !== 's') {
        continue
      }
      if (type === 's' && value === '' && !formula) {
        continue
      }

      const parts = splitRef(ref)
      cells.push({
        ref,
        column: parts.column,
        row: parts.row,
        type,
        value,
        ...(formula ? { formula: decodeXml(formula) } : {}),
        style,
      })
    }

    // --- combinaciones
    const merges: MergedRange[] = []
    for (const m of xml.matchAll(/<mergeCell\b[^>]*\/>/g)) {
      const ref = attr(m[0], 'ref')
      if (!ref) {
        continue
      }
      const [a, b] = ref.split(':')
      merges.push({ ref, from: splitRef(a), to: splitRef(b ?? a) })
    }

    // --- rejilla
    const columns: ColumnWidth[] = []
    for (const m of xml.matchAll(/<col\b[^>]*\/>/g)) {
      const width = numAttr(m[0], 'width') ?? 0
      const px = Math.round(width * MAX_DIGIT_WIDTH + 5)
      columns.push({
        min: numAttr(m[0], 'min') ?? 1,
        max: numAttr(m[0], 'max') ?? 1,
        width,
        px,
        mm: Number((px * PX_TO_MM).toFixed(2)),
        hidden: boolAttr(m[0], 'hidden'),
      })
    }

    const rows: RowHeight[] = []
    for (const m of xml.matchAll(/<row\b[^>]*>/g)) {
      const height = numAttr(m[0], 'ht')
      const row = numAttr(m[0], 'r')
      if (row === null || height === null) {
        continue
      }
      rows.push({
        row,
        height,
        mm: Number((height * PT_TO_MM).toFixed(2)),
        hidden: boolAttr(m[0], 'hidden'),
      })
    }

    // Anchos y altos por defecto de la hoja. Una columna o una fila sin
    // declarar no mide cero: mide esto.
    const formatTag = /<sheetFormatPr[^>]*\/?>/.exec(xml)?.[0] ?? ''
    const defaultColWidth = numAttr(formatTag, 'defaultColWidth')
      ?? numAttr(formatTag, 'baseColWidth')
      ?? 8.43
    const defaultRowHeight = numAttr(formatTag, 'defaultRowHeight') ?? 15
    const defaultColumnMm = Number(
      ((defaultColWidth * MAX_DIGIT_WIDTH + 5) * PX_TO_MM).toFixed(2)
    )
    const defaultRowMm = Number((defaultRowHeight * PT_TO_MM).toFixed(2))

    // --- impresion
    const pageSetupTag = /<pageSetup\b[^>]*\/?>/.exec(xml)?.[0] ?? ''
    const marginsTag = /<pageMargins\b[^>]*\/?>/.exec(xml)?.[0] ?? ''
    const margins = marginsTag
      ? Object.fromEntries(
        ['left', 'right', 'top', 'bottom', 'header', 'footer']
          .map(side => [side, numAttr(marginsTag, side) ?? 0])
      )
      : null

    const pageSetup: PageSetup = {
      paperSize: numAttr(pageSetupTag, 'paperSize'),
      orientation: attr(pageSetupTag, 'orientation'),
      scale: numAttr(pageSetupTag, 'scale'),
      fitToWidth: numAttr(pageSetupTag, 'fitToWidth'),
      fitToHeight: numAttr(pageSetupTag, 'fitToHeight'),
      fitToPage: /<pageSetUpPr\b[^>]*fitToPage="1"/.test(xml),
      margins,
    }

    const rowBreaks = [...xml.matchAll(/<rowBreaks\b[\s\S]*?<\/rowBreaks>/g)]
      .flatMap(block => [...block[0].matchAll(/<brk\b[^>]*\/>/g)])
      .map(m => numAttr(m[0], 'id') ?? 0)
      .filter(id => id > 0)

    const dataValidations = [...xml.matchAll(/<dataValidation\b([^>]*)(?:\/>|>([\s\S]*?)<\/dataValidation>)/g)]
      .map(m => ({
        ref: attr(m[1], 'sqref') ?? '',
        type: attr(m[1], 'type'),
        formula: /<formula1>([\s\S]*?)<\/formula1>/.exec(m[2] ?? '')?.[1] ?? null,
      }))

    // --- imagenes
    let images: SheetImage[] = []
    const drawingId = attr(/<drawing\b[^>]*\/>/.exec(xml)?.[0] ?? '', 'r:id')
    if (drawingId) {
      const sheetRels = relsOf(zip, part)
      const drawingTarget = sheetRels[drawingId]
      if (drawingTarget) {
        const drawingPart = ('xl/' + drawingTarget.replace(/^\.\.\//, '')).replace(/\/\//g, '/')
        const drawingXml = text(drawingPart)
        if (drawingXml) {
          images = parseDrawing(drawingXml, relsOf(zip, drawingPart), zip, media)
        }
      }
    }

    sheets.push({
      name,
      index: position + 1,
      part,
      state: attr(tag, 'state') ?? 'visible',
      dimension: attr(/<dimension\b[^>]*\/>/.exec(xml)?.[0] ?? '', 'ref'),
      printArea: printAreas[position] ?? null,
      cells,
      merges,
      columns,
      rows,
      defaultColumnMm,
      defaultRowMm,
      images,
      pageSetup,
      rowBreaks,
      dataValidations,
    })
  })

  return { file, sheets, definedNames, media }
}
