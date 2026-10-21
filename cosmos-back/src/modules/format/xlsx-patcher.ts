import { unzipSync, zipSync } from 'fflate'

/**
 * Escritura sobre una plantilla .xlsx sin pasar por una libreria de hojas de
 * calculo.
 *
 * El motivo es de fidelidad. Las plantillas de Cosmos llevan casi 3 MB de
 * imagenes, 1500 celdas combinadas, 160 formulas y anchos de columna afinados
 * para impresion. Cargarlas y volver a serializarlas con ExcelJS falla de
 * entrada (revienta al escribir la validacion `F16:XFD16` de la hoja de
 * asistencia, porque intenta codificar la columna 16385) y, aun sorteando eso,
 * el ida y vuelta pierde elementos.
 *
 * Aqui se abre el zip, se reescribe unicamente el XML necesario y se vuelve a
 * comprimir. Todo lo demas viaja intacto byte a byte.
 *
 * Ademas de escribir celdas, sabe **anadir paginas**: clonar el rango de filas
 * de una pagina impresa (cabecera, lista y pie) al final de la hoja, con sus
 * combinaciones, alturas, estilos e imagenes. Es lo que permite que una
 * nombrada de cualquier tamano quepa en un formato cuya plantilla trae un
 * numero fijo de huecos.
 *
 * Se anade siempre **al final**: ninguna referencia existente se desplaza, que
 * es lo que hace inviable insertar filas en medio de estas plantillas.
 */

export type CellValue = string | number | Date | null

export interface SheetEdits {
  /** Valores por referencia de celda, por ejemplo `{ B3: 'MN COSMOS' }`. */
  cells?: Record<string, CellValue>
  /** Formulas por referencia, sin el `=` inicial. `null` deja la celda vacia. */
  formulas?: Record<string, string | null>
}

/** Ediciones por nombre de hoja. */
export type WorkbookEdits = Record<string, SheetEdits>

const COL_RE = /^([A-Z]+)(\d+)$/

function columnToNumber(col: string): number {
  let n = 0
  for (const ch of col) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n
}

function splitRef(ref: string): { col: string; colNum: number; row: number } {
  const m = COL_RE.exec(ref.toUpperCase())
  if (!m) {
    throw new Error(`Referencia de celda invalida: ${ref}`)
  }
  return { col: m[1], colNum: columnToNumber(m[1]), row: Number(m[2]) }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_all, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
}

/** Cadenas de `xl/sharedStrings.xml`, en el orden en que las indexan las celdas. */
function parseSharedStrings(xml: string): string[] {
  const items = xml.match(/<si\b[^>]*(?:\/>|>[\s\S]*?<\/si>)/g) ?? []
  return items.map(item => {
    // Una cadena con formato se parte en varios <r><t>; el texto es la suma.
    const parts = item.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? []
    return parts.map(p => unescapeXml(p.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/, '$1'))).join('')
  })
}

/**
 * Texto que muestra una celda, sea cadena compartida, cadena en linea o valor
 * suelto. Devuelve cadena vacia para las celdas vacias y para las que solo
 * llevan formula, que no tienen texto propio.
 */
function readCellText(sheetXml: string, ref: string, sharedStrings: string[]): string {
  const upper = ref.toUpperCase()
  const cell = new RegExp(`<c r="${upper}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`).exec(sheetXml)?.[0]
  if (!cell || cell.endsWith('/>')) {
    return ''
  }
  const type = /<c r="[^"]+"[^>]*\st="([^"]+)"/.exec(cell)?.[1]
  if (type === 'inlineStr') {
    const parts = cell.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? []
    return parts.map(p => unescapeXml(p.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/, '$1'))).join('')
  }
  const raw = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1]
  if (raw === undefined) {
    return ''
  }
  if (type === 's') {
    return sharedStrings[Number(raw)] ?? ''
  }
  return unescapeXml(raw)
}

/**
 * Fecha a numero de serie de Excel. El sistema de fechas de 1900 arrastra el
 * bug historico del 29 de febrero de 1900, de ahi el desfase de 25569 dias
 * respecto de la epoca Unix.
 */
function toExcelSerial(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return utc / 86400000 + 25569
}

/** Extrae los atributos de una etiqueta `<c ...>`, conservando el estilo. */
function attributesWithoutType(rawAttrs: string): string {
  return rawAttrs.replace(/\s+t="[^"]*"/g, '')
}

function buildCell(ref: string, attrs: string, value: CellValue, formula?: string | null): string {
  const clean = attributesWithoutType(attrs)

  if (formula !== undefined) {
    if (formula === null) {
      // Celda vacia conservando el estilo: asi se neutraliza un #REF! sin
      // alterar bordes ni relleno.
      return `<c r="${ref}"${clean}/>`
    }
    return `<c r="${ref}"${clean}><f>${escapeXml(formula)}</f></c>`
  }

  if (value === null || value === undefined || value === '') {
    return `<c r="${ref}"${clean}/>`
  }
  if (value instanceof Date) {
    return `<c r="${ref}"${clean}><v>${toExcelSerial(value)}</v></c>`
  }
  if (typeof value === 'number') {
    return `<c r="${ref}"${clean}><v>${value}</v></c>`
  }
  return `<c r="${ref}"${clean} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`
}

/** Reescribe una celda existente o la inserta en su posicion dentro de la fila. */
function writeCell(sheetXml: string, ref: string, value: CellValue, formula?: string | null): string {
  const upper = ref.toUpperCase()
  const existing = new RegExp(`<c r="${upper}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`)
  const found = existing.exec(sheetXml)
  if (found) {
    const attrs = found[0].match(new RegExp(`<c r="${upper}"([^>]*?)(?:/>|>)`))?.[1] ?? ''
    return sheetXml.slice(0, found.index) + buildCell(upper, attrs, value, formula) + sheetXml.slice(found.index + found[0].length)
  }

  // La celda no existe en el XML: hay que insertarla en su fila respetando el
  // orden de columnas, que Excel exige.
  const { row, colNum } = splitRef(upper)
  const rowRe = new RegExp(`<row[^>]*\\sr="${row}"[^>]*?(/>|>[\\s\\S]*?</row>)`)
  const rowMatch = rowRe.exec(sheetXml)
  if (!rowMatch) {
    throw new Error(`La fila ${row} no existe en la hoja; no se puede escribir ${ref}`)
  }
  const rowXml = rowMatch[0]
  const newCell = buildCell(upper, '', value, formula)

  if (rowXml.endsWith('/>')) {
    // Fila declarada sin celdas
    const opened = rowXml.slice(0, -2) + '>' + newCell + '</row>'
    return sheetXml.slice(0, rowMatch.index) + opened + sheetXml.slice(rowMatch.index + rowXml.length)
  }

  const cellRefs = [...rowXml.matchAll(/<c r="([A-Z]+)\d+"/g)]
  let insertAt = rowXml.lastIndexOf('</row>')
  for (const m of cellRefs) {
    if (columnToNumber(m[1]) > colNum) {
      insertAt = m.index as number
      break
    }
  }
  const patchedRow = rowXml.slice(0, insertAt) + newCell + rowXml.slice(insertAt)
  return sheetXml.slice(0, rowMatch.index) + patchedRow + sheetXml.slice(rowMatch.index + rowXml.length)
}

/**
 * Elimina las validaciones de datos cuya lista de origen quedo apuntando a
 * `#REF!`. Son desplegables que se rompieron al editar la plantilla; como todas
 * esas celdas las escribe la plataforma, el desplegable ya no aporta nada y en
 * cambio hace que Excel avise de contenido ilegible al abrir el archivo.
 */
function dropBrokenDataValidations(sheetXml: string): string {
  let xml = sheetXml
  for (const tag of ['x14:dataValidation', 'dataValidation']) {
    const re = new RegExp(`<${tag}\\b[^>]*(?:/>|>[\\s\\S]*?</${tag}>)`, 'g')
    xml = xml.replace(re, match => (match.includes('#REF!') ? '' : match))
  }
  // Los contenedores llevan un `count` que debe cuadrar con lo que queda.
  xml = xml.replace(/<(x14:dataValidations|dataValidations)([^>]*?)count="\d+"([^>]*)>([\s\S]*?)<\/\1>/g,
    (_all, tag, before, after, body) => {
      const n = (body.match(new RegExp(`<${tag.replace('s', '')}\\b`, 'g')) ?? []).length
      return n === 0 ? '' : `<${tag}${before}count="${n}"${after}>${body}</${tag}>`
    })
  return xml
}

/**
 * Vacia las celdas cuya formula quedo rota: las que apuntan a `#REF!` y las que
 * enlazan a otro libro (`[1]ASISTENCIA!C50`), que en estas plantillas son
 * restos de la hoja de la que se copiaron. Excel las muestra como error o con
 * un valor congelado que nadie puede explicar.
 *
 * El estilo de la celda se conserva, asi que bordes y relleno no cambian.
 */
function clearBrokenFormulas(sheetXml: string): string {
  return sheetXml.replace(
    /<c r="([A-Z]+\d+)"([^>]*?)>\s*<f[^>]*>([\s\S]*?)<\/f>(?:\s*<v>[\s\S]*?<\/v>)?\s*<\/c>/g,
    (all, ref, attrs, formula) => {
      const broken = formula.includes('#REF!') || /\[\d+\]/.test(formula)
      return broken ? `<c r="${ref}"${attributesWithoutType(attrs)}/>` : all
    }
  )
}

/**
 * Borra el resultado guardado de las formulas, dejando solo la formula.
 *
 * La plantilla trae 130 celdas con el valor de la ultima vez que el cliente la
 * grabo, y de ellas cuelgan **todas** las cabeceras impresas: nave, fecha,
 * jornada, supervisores y N.o de ATS llegan a cada hoja por formula desde
 * `GLOBAL`. Excel las recalcula al abrir porque el libro va marcado con
 * `fullCalcOnLoad`, pero un convertidor a PDF no tiene por que hacerle caso:
 * LibreOffice trae "no recalcular nunca" como opcion por defecto para ficheros
 * de Excel, y entonces el PDF sale con los datos de ejemplo de la plantilla sin
 * avisar de nada.
 *
 * Una formula sin resultado guardado no deja alternativa: cualquier motor tiene
 * que calcularla para pintar algo. Asi el PDF depende de la formula y no de la
 * configuracion de quien lo genera.
 *
 * No afecta al `.xlsx`: Excel iba a recalcular igualmente.
 */
function dropCachedFormulaValues(sheetXml: string): string {
  return sheetXml.replace(
    /(<c\b[^>]*>\s*<f\b[^>]*(?:\/>|>[\s\S]*?<\/f>))\s*<v>[\s\S]*?<\/v>/g,
    '$1'
  )
}

/**
 * Descarta `xl/calcChain.xml` del paquete.
 *
 * Esa parte es una cache: el orden en que Excel recalculo las formulas la
 * ultima vez que el cliente grabo la plantilla. No es dato, y llega obsoleta a
 * la salida por dos motivos que son justo lo que hace este modulo: los nombres
 * de los firmantes y las cabeceras se escriben como valor literal sobre celdas
 * que en la plantilla eran formula, y `clearBrokenFormulas` retira las formulas
 * rotas. La cadena se queda apuntando a celdas que ya no tienen `<f>` y Excel
 * lo detecta al abrir: "Hemos encontrado un problema con el contenido", y
 * quita la parte el solo.
 *
 * En las plantillas actuales quedaban asi 28 de 79 entradas (ETHANOL), 95 de
 * 161 (GRANEL) y 166 de 246 (MERCADERIA GENERAL).
 *
 * Reconstruirla seria trabajo tirado: el libro sale con `fullCalcOnLoad`, asi
 * que Excel recalcula todo al abrir y rehace la cadena por su cuenta. Hay que
 * quitar tambien su `Override` en `[Content_Types].xml` y su relacion en
 * `xl/_rels/workbook.xml.rels`, porque una referencia a una parte que no existe
 * dispara la misma reparacion.
 */
function dropCalcChain(files: Record<string, Uint8Array>): void {
  if (!files['xl/calcChain.xml']) {
    return
  }
  delete files['xl/calcChain.xml']

  const decoder = new TextDecoder('utf-8')
  const encoder = new TextEncoder()

  const contentTypes = files['[Content_Types].xml']
  if (contentTypes) {
    const xml = decoder
      .decode(contentTypes)
      .replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/g, '')
    files['[Content_Types].xml'] = encoder.encode(xml)
  }

  const relsPath = 'xl/_rels/workbook.xml.rels'
  const rels = files[relsPath]
  if (rels) {
    const xml = decoder.decode(rels).replace(/<Relationship[^>]*calcChain[^>]*\/>/g, '')
    files[relsPath] = encoder.encode(xml)
  }
}

function forceFullRecalc(workbookXml: string): string {
  if (/<calcPr[^>]*\/>/.test(workbookXml)) {
    return workbookXml.replace(/<calcPr[^>]*\/>/, '<calcPr calcId="191029" fullCalcOnLoad="1"/>')
  }
  return workbookXml.replace('</workbook>', '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>')
}

/** Mapa nombre de hoja -> ruta de su XML, resuelto por relaciones del libro. */
function resolveSheetPaths(files: Record<string, Uint8Array>): Record<string, string> {
  const decoder = new TextDecoder('utf-8')
  const workbookXml = decoder.decode(files['xl/workbook.xml'])
  const relsXml = decoder.decode(files['xl/_rels/workbook.xml.rels'])

  const relTargets: Record<string, string> = {}
  for (const m of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
    relTargets[m[1]] = m[2]
  }

  const paths: Record<string, string> = {}
  for (const m of workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)) {
    const name = m[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
    const target = relTargets[m[2]]
    if (target) {
      paths[name] = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
    }
  }
  return paths
}

/** Ultima fila declarada en la hoja. */
export function lastRowOf(sheetXml: string): number {
  let last = 0
  for (const m of sheetXml.matchAll(/<row[^>]*\sr="(\d+)"/g)) {
    const row = Number(m[1])
    if (row > last) {
      last = row
    }
  }
  return last
}

/** Desplaza las referencias de fila de un fragmento de XML de filas. */
function shiftRowXml(rowXml: string, offset: number): string {
  return rowXml
    .replace(/<row([^>]*?)\sr="(\d+)"/g, (_all, attrs, r) => `<row${attrs} r="${Number(r) + offset}"`)
    .replace(/<c r="([A-Z]+)(\d+)"/g, (_all, col, r) => `<c r="${col}${Number(r) + offset}"`)
}

/**
 * Reasigna los grupos de formula compartida de una copia.
 *
 * Una formula compartida tiene una unica celda ancla (la que lleva `ref`) y el
 * resto del grupo la referencia por `si`. Clonar el bloque tal cual deja ocho
 * anclas con el mismo `si`, y Excel da el libro por corrupto. Cada copia recibe
 * su propio grupo, con el rango desplazado igual que las filas.
 */
function remapSharedFormulas(
  rowXml: string,
  offset: number,
  assign: (oldSi: string) => number
): string {
  return rowXml.replace(/<f\b[^>]*?\/?>/g, tag => {
    let out = tag.replace(/\ssi="(\d+)"/, (_all, si) => ` si="${assign(si)}"`)
    out = out.replace(/\sref="([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?"/, (_all, c1, r1, c2, r2) =>
      c2
        ? ` ref="${c1}${Number(r1) + offset}:${c2}${Number(r2) + offset}"`
        : ` ref="${c1}${Number(r1) + offset}"`)
    return out
  })
}

/**
 * Clona `times` veces el rango de filas `[from, to]` al final de la hoja.
 *
 * Devuelve el desplazamiento aplicado a cada copia, para que quien llama sepa
 * en que fila cayo cada hueco de la pagina anadida.
 */
export function appendPages(
  sheetXml: string,
  from: number,
  to: number,
  times: number
): { xml: string; offsets: number[] } {
  if (times <= 0) {
    return { xml: sheetXml, offsets: [] }
  }

  const height = to - from + 1
  const sourceRows: string[] = []
  for (const m of sheetXml.matchAll(/<row[^>]*\sr="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)) {
    const row = Number(m[1])
    if (row >= from && row <= to) {
      sourceRows.push(m[0])
    }
  }
  if (sourceRows.length === 0) {
    throw new Error(`La hoja no tiene filas en el rango ${from}..${to}`)
  }

  const sourceMerges: string[] = []
  for (const m of sheetXml.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g)) {
    const top = Number(m[2])
    const bottom = Number(m[4])
    if (top >= from && bottom <= to) {
      sourceMerges.push(m[0])
    }
  }

  // Cada copia estrena grupos de formula compartida, a partir del ultimo usado.
  let nextSi = 0
  for (const m of sheetXml.matchAll(/<f[^>]*\ssi="(\d+)"/g)) {
    nextSi = Math.max(nextSi, Number(m[1]) + 1)
  }

  const base = lastRowOf(sheetXml)
  const offsets: number[] = []
  const newRows: string[] = []
  const newMerges: string[] = []

  for (let page = 0; page < times; page++) {
    const offset = base + 1 + page * height - from
    offsets.push(offset)

    const groups = new Map<string, number>()
    const assign = (oldSi: string): number => {
      if (!groups.has(oldSi)) {
        groups.set(oldSi, nextSi++)
      }
      return groups.get(oldSi)!
    }

    for (const row of sourceRows) {
      newRows.push(remapSharedFormulas(shiftRowXml(row, offset), offset, assign))
    }
    for (const merge of sourceMerges) {
      newMerges.push(
        merge.replace(/ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/, (_a, c1, r1, c2, r2) =>
          `ref="${c1}${Number(r1) + offset}:${c2}${Number(r2) + offset}"`)
      )
    }
  }

  let xml = sheetXml.replace('</sheetData>', newRows.join('') + '</sheetData>')

  if (newMerges.length > 0) {
    if (/<mergeCells[^>]*>/.test(xml)) {
      xml = xml.replace(/<mergeCells([^>]*)count="(\d+)"([^>]*)>/, (_a, before, count, after) =>
        `<mergeCells${before}count="${Number(count) + newMerges.length}"${after}>`)
      xml = xml.replace('</mergeCells>', newMerges.join('') + '</mergeCells>')
    } else {
      // Una hoja sin combinaciones necesita el contenedor, que va justo despues
      // de `sheetData` segun el esquema.
      xml = xml.replace('</sheetData>',
        `</sheetData><mergeCells count="${newMerges.length}">${newMerges.join('')}</mergeCells>`)
    }
  }

  const newLast = base + times * height
  xml = xml.replace(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/, (_a, c1, r1, c2) =>
    `<dimension ref="${c1}${r1}:${c2}${newLast}"/>`)

  return { xml, offsets }
}

/**
 * Clona los anclajes de imagen que caen dentro del rango de la pagina, para que
 * las paginas anadidas lleven los mismos logos y sellos que la original.
 *
 * Cada forma clonada recibe un identificador nuevo. Repetir el `id` de un
 * `cNvPr` es justo lo que hace que Excel avise de "contenido ilegible" y repare
 * el libro; al repararlo se lleva por delante los dibujos y las hojas quedan
 * en gris.
 *
 * Los anclajes usan filas base cero, de ahi el `- 1` al comparar.
 */
export function appendDrawingAnchors(
  drawingXml: string,
  from: number,
  to: number,
  offsets: number[]
): string {
  if (offsets.length === 0) {
    return drawingXml
  }

  let nextId = 1
  for (const m of drawingXml.matchAll(/<xdr:cNvPr[^>]*\sid="(\d+)"/g)) {
    nextId = Math.max(nextId, Number(m[1]) + 1)
  }

  const anchorRe = /<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)[^>]*>[\s\S]*?<\/xdr:\1>/g
  const sources: string[] = []

  for (const match of drawingXml.matchAll(anchorRe)) {
    const anchor = match[0]
    const fromRow = Number(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(anchor)?.[1] ?? NaN)
    if (!Number.isNaN(fromRow) && fromRow >= from - 1 && fromRow <= to - 1) {
      sources.push(anchor)
    }
  }

  if (sources.length === 0) {
    return drawingXml
  }

  const clones: string[] = []
  for (const offset of offsets) {
    for (const anchor of sources) {
      // El identificador y el nombre se renumeran juntos, con el mismo
      // contador, para que ambos queden unicos en la hoja de dibujo.
      const ids: number[] = []
      const shifted = anchor
        .replace(/<xdr:row>(\d+)<\/xdr:row>/g, (_a, r) => `<xdr:row>${Number(r) + offset}</xdr:row>`)
        .replace(/(<xdr:cNvPr[^>]*\sid=")(\d+)(")/g, (_a, before, _id, after) => {
          const id = nextId++
          ids.push(id)
          return `${before}${id}${after}`
        })

      let shape = 0
      clones.push(
        shifted.replace(/(<xdr:cNvPr[^>]*\sname=")([^"]*)(")/g, (_a, before, name, after) =>
          `${before}${name} (${ids[shape++] ?? nextId++})${after}`)
      )
    }
  }

  return drawingXml.replace('</xdr:wsDr>', clones.join('') + '</xdr:wsDr>')
}

/**
 * Extiende el area de impresion de una hoja hasta `lastRow`.
 *
 * Solo crece: si la plantilla ya imprimia mas abajo se respeta, porque ahi
 * suele estar el pie de firmas.
 */
export function extendPrintArea(workbookXml: string, sheetName: string, lastRow: number): string {
  const quoted = sheetName.includes(' ') || sheetName.includes('.') || sheetName.includes('-')
  const label = quoted ? `'${sheetName.replace(/'/g, "''")}'` : sheetName

  return workbookXml.replace(
    /<definedName name="_xlnm\.Print_Area"([^>]*)>([^<]*)<\/definedName>/g,
    (all, attrs, ref) => {
      const belongs = ref.startsWith(`${label}!`) || ref.startsWith(`${sheetName}!`)
      if (!belongs) {
        return all
      }
      // La ultima fila del rango es lo unico que cambia; el resto de la
      // referencia (hoja y columnas) se conserva tal cual.
      const grown = ref.replace(/\$(\d+)\s*$/, (_a: string, current: string) =>
        `$${Math.max(Number(current), lastRow)}`)
      return `<definedName name="_xlnm.Print_Area"${attrs}>${grown}</definedName>`
    }
  )
}

/**
 * Deja que una hoja pagine libremente a lo alto.
 *
 * Las hojas de asistencia y charla llevan `fitToPage="1"` y no declaran
 * `fitToHeight`, que por especificacion vale 1. Mientras la hoja ocupa su
 * pagina original eso es justo lo que el cliente quiere: la lista entera en una
 * hoja, al 31% en granel. Pero en cuanto se anaden paginas, el area de
 * impresion pasa de 83 a 166 filas o mas y ese "una pagina de alto" las
 * comprime todas en una sola: la segunda pagina de personal sale ilegible.
 *
 * Solo se toca cuando la hoja ha paginado de verdad, para no alterar la salida
 * de las nombradas que caben en su pagina, que son la mayoria.
 *
 * `fitToWidth="0"` significa "tan ancho como haga falta". Si al liberar tambien
 * el alto quedan ambos automaticos, no queda nada que gobierne la escala, asi
 * que se apaga `fitToPage` y manda el `scale` que la plantilla trae afinado.
 */
export function releaseVerticalFit(sheetXml: string): string {
  const fitsToPage = /<pageSetUpPr[^>]*\sfitToPage="(1|true)"/.test(sheetXml)
  if (!fitsToPage) {
    // ATS y permiso de trabajo ya paginan por `scale`; no hay nada que soltar.
    return sheetXml
  }

  const pageSetup = /<pageSetup\b[^>]*\/>/.exec(sheetXml)?.[0]
  if (!pageSetup) {
    return sheetXml
  }

  const fitToWidth = /\sfitToWidth="(\d+)"/.exec(pageSetup)?.[1] ?? '1'
  if (fitToWidth === '0') {
    return sheetXml.replace(/(<pageSetUpPr[^>]*\s)fitToPage="(?:1|true)"/, '$1fitToPage="0"')
  }

  const released = /\sfitToHeight="\d+"/.test(pageSetup)
    ? pageSetup.replace(/\sfitToHeight="\d+"/, ' fitToHeight="0"')
    : pageSetup.replace(/\/>$/, ' fitToHeight="0"/>')
  return sheetXml.replace(pageSetup, released)
}

/** Documento abierto: permite encadenar operaciones sobre un mismo libro. */
export class WorkbookDoc {
  private readonly files: Record<string, Uint8Array>
  private readonly decoder = new TextDecoder('utf-8')
  private readonly encoder = new TextEncoder()
  private readonly sheetPaths: Record<string, string>
  private readonly sheetXml: Record<string, string> = {}
  private workbookXml: string
  private sharedStrings?: string[]

  constructor(template: Buffer) {
    this.files = unzipSync(new Uint8Array(template))
    this.sheetPaths = resolveSheetPaths(this.files)
    this.workbookXml = this.decoder.decode(this.files['xl/workbook.xml'])
  }

  sheetNames(): string[] {
    return Object.keys(this.sheetPaths)
  }

  has(sheetName: string): boolean {
    return Boolean(this.sheetPaths[sheetName])
  }

  private xmlOf(sheetName: string): string {
    const path = this.sheetPaths[sheetName]
    if (!path) {
      throw new Error(`La plantilla no tiene una hoja llamada "${sheetName}"`)
    }
    if (this.sheetXml[sheetName] === undefined) {
      if (!this.files[path]) {
        throw new Error(`No se encontro el XML de la hoja "${sheetName}" (${path})`)
      }
      this.sheetXml[sheetName] = this.decoder.decode(this.files[path])
    }
    return this.sheetXml[sheetName]
  }

  lastRow(sheetName: string): number {
    return lastRowOf(this.xmlOf(sheetName))
  }

  /**
   * Texto preimpreso de una celda.
   *
   * Existe para poder escribir *encima* de las etiquetas que la plantilla trae
   * escritas: en la hoja de charla las opciones a marcar son texto dentro de
   * una celda combinada, no campos. Ver `preprinted-text.ts`.
   */
  text(sheetName: string, ref: string): string {
    if (!this.sharedStrings) {
      const raw = this.files['xl/sharedStrings.xml']
      this.sharedStrings = raw ? parseSharedStrings(this.decoder.decode(raw)) : []
    }
    return readCellText(this.xmlOf(sheetName), ref, this.sharedStrings)
  }

  set(sheetName: string, ref: string, value: CellValue): void {
    this.sheetXml[sheetName] = writeCell(this.xmlOf(sheetName), ref, value)
  }

  setFormula(sheetName: string, ref: string, formula: string | null): void {
    this.sheetXml[sheetName] = writeCell(this.xmlOf(sheetName), ref, null, formula)
  }

  /**
   * Anade `times` copias de la pagina `[from, to]` al final de la hoja, con sus
   * imagenes. Devuelve el desplazamiento de cada copia.
   */
  addPages(sheetName: string, from: number, to: number, times: number): number[] {
    const { xml, offsets } = appendPages(this.xmlOf(sheetName), from, to, times)
    this.sheetXml[sheetName] = xml

    const drawingPath = this.drawingPathOf(sheetName)
    if (drawingPath && this.files[drawingPath]) {
      const patched = appendDrawingAnchors(this.decoder.decode(this.files[drawingPath]), from, to, offsets)
      this.files[drawingPath] = this.encoder.encode(patched)
    }
    return offsets
  }

  /** Ruta del dibujo asociado a la hoja, resuelta por sus relaciones. */
  private drawingPathOf(sheetName: string): string | null {
    const sheetPath = this.sheetPaths[sheetName]
    const relId = /<drawing r:id="([^"]+)"\/>/.exec(this.xmlOf(sheetName))?.[1]
    if (!relId) {
      return null
    }
    const relsPath = sheetPath.replace(/([^/]+)$/, '_rels/$1.rels')
    if (!this.files[relsPath]) {
      return null
    }
    const rels = this.decoder.decode(this.files[relsPath])
    const target = new RegExp(`<Relationship[^>]*Id="${relId}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]
    if (!target) {
      return null
    }
    return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\.\//, '')}`
  }

  extendPrintArea(sheetName: string, lastRow: number): void {
    this.workbookXml = extendPrintArea(this.workbookXml, sheetName, lastRow)
  }

  /** Ver `releaseVerticalFit`. Se llama solo cuando la hoja ha paginado. */
  releaseVerticalFit(sheetName: string): void {
    this.sheetXml[sheetName] = releaseVerticalFit(this.xmlOf(sheetName))
  }

  /** Serializa el libro, limpiando de paso lo que Excel marcaria como ilegible. */
  save(): Buffer {
    for (const [sheetName, path] of Object.entries(this.sheetPaths)) {
      let xml = this.sheetXml[sheetName]
      if (xml === undefined) {
        const raw = this.files[path]
        if (!raw) {
          continue
        }
        xml = this.decoder.decode(raw)
        // Una hoja que no se ha tocado solo hay que reescribirla si trae algo
        // que limpiar: formulas rotas, enlaces a otro libro o formulas con el
        // resultado guardado de la plantilla.
        if (!xml.includes('#REF!') && !/<f[^>]*>[^<]*\[\d+\]/.test(xml) && !/<f\b/.test(xml)) {
          continue
        }
      }
      xml = clearBrokenFormulas(xml)
      xml = dropBrokenDataValidations(xml)
      xml = dropCachedFormulaValues(xml)
      this.files[path] = this.encoder.encode(xml)
    }

    this.files['xl/workbook.xml'] = this.encoder.encode(forceFullRecalc(this.workbookXml))
    dropCalcChain(this.files)
    return Buffer.from(zipSync(this.files, { level: 6 }))
  }
}

/**
 * Aplica ediciones sueltas sobre una plantilla. Se mantiene por comodidad para
 * los casos en los que no hace falta anadir paginas.
 */
export function patchWorkbook(template: Buffer, edits: WorkbookEdits): Buffer {
  const doc = new WorkbookDoc(template)
  for (const [sheetName, sheetEdits] of Object.entries(edits)) {
    for (const [ref, value] of Object.entries(sheetEdits.cells ?? {})) {
      doc.set(sheetName, ref, value)
    }
    for (const [ref, formula] of Object.entries(sheetEdits.formulas ?? {})) {
      doc.setFormula(sheetName, ref, formula)
    }
  }
  return doc.save()
}

/** Nombres de hoja de la plantilla, en su orden original. */
export function listSheets(template: Buffer): string[] {
  const files = unzipSync(new Uint8Array(template))
  return Object.keys(resolveSheetPaths(files))
}
