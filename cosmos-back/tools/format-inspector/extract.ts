/**
 * Inventario de las plantillas de formato. Fase 0 del plan de formatos v2.
 *
 * Lee los tres `.xlsx` de `templates/` y deja en `tools/format-inspector/out/`
 * todo lo que hace falta para volver a construir esos documentos sin perder
 * nada: cada rotulo con su posicion y su formato, la rejilla de cada hoja, las
 * combinaciones, la configuracion de impresion y la biblioteca de imagenes
 * deduplicada.
 *
 * Es una herramienta de desarrollo, no parte del servicio. No se despliega y no
 * la importa nadie de `src/`.
 *
 *   npm run format:inspect
 *
 * La salida esta ignorada por git a proposito: se regenera desde las plantillas
 * en cualquier momento y pesa cerca de 3 MB por las imagenes.
 */

import * as fs from 'fs'
import * as path from 'path'
import { readWorkbook, Sheet, Workbook, columnToNumber } from './xlsx-read'

const TEMPLATES_DIR = path.join(process.cwd(), 'templates')
const OUT_DIR = path.join(process.cwd(), 'tools', 'format-inspector', 'out')
const ASSETS_DIR = path.join(OUT_DIR, 'assets')

/** Donde aparece un rotulo: plantilla, hoja y celda. */
interface LabelUse {
  template: string
  sheet: string
  ref: string
}

interface LabelEntry {
  text: string
  /** Identificador propuesto para el modelo de documento. */
  suggestedId: string
  uses: LabelUse[]
  templates: string[]
}

/** Primera y ultima marca diacritica combinante que deja `NFD`. */
const COMBINING_FROM = 0x0300
const COMBINING_TO = 0x036f

/** Quita los acentos que `NFD` separa: `INGLÉS` queda en `INGLES`. */
function stripDiacritics(text: string): string {
  return [...text.normalize('NFD')]
    .filter(ch => {
      const code = ch.codePointAt(0) ?? 0
      return code < COMBINING_FROM || code > COMBINING_TO
    })
    .join('')
}

/** `SUPERVISOR DE OPERACIONES` a `supervisor-de-operaciones`. */
function slugify(text: string): string {
  return stripDiacritics(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sin-texto'
}

function templateKey(file: string): string {
  return path.basename(file, '.xlsx').replace(/^FORMATOS /, '')
}

/**
 * Resumen de la rejilla de una hoja en milimetros.
 *
 * Es el dato que decide la rejilla A4 compartida entre el renderizador HTML y
 * el de Excel: si el ancho util de la hoja no cabe en el papel, la plantilla
 * confia en la escala de impresion y hay que reproducir esa decision, no el
 * ancho en bruto.
 */
function gridSummary(sheet: Sheet) {
  const usedColumns = sheet.cells.reduce((max, c) => Math.max(max, columnToNumber(c.column)), 0)
  const usedRows = sheet.cells.reduce((max, c) => Math.max(max, c.row), 0)

  let widthMm = 0
  for (const col of sheet.columns) {
    if (col.hidden) {
      continue
    }
    const from = col.min
    const to = Math.min(col.max, usedColumns)
    if (to >= from) {
      widthMm += col.mm * (to - from + 1)
    }
  }

  return {
    usedColumns,
    usedRows,
    /** Ancho de las columnas con dato, en milimetros y sin escalar. */
    usedWidthMm: Number(widthMm.toFixed(1)),
    /** A4 vertical menos margenes de 10 mm por lado. */
    fitsA4Portrait: widthMm <= 190,
    fitsA4Landscape: widthMm <= 277,
  }
}

function inventoryOf(workbook: Workbook) {
  return {
    template: templateKey(workbook.file),
    file: path.basename(workbook.file),
    definedNames: workbook.definedNames,
    sheets: workbook.sheets.map(sheet => ({
      name: sheet.name,
      index: sheet.index,
      state: sheet.state,
      dimension: sheet.dimension,
      printArea: sheet.printArea,
      pageSetup: sheet.pageSetup,
      rowBreaks: sheet.rowBreaks,
      grid: gridSummary(sheet),
      counts: {
        cells: sheet.cells.length,
        labels: sheet.cells.filter(c => c.type === 's' && !c.formula).length,
        computedTexts: sheet.cells.filter(c => c.type === 's' && c.formula).length,
        numbers: sheet.cells.filter(c => c.type === 'n').length,
        formulas: sheet.cells.filter(c => c.formula).length,
        merges: sheet.merges.length,
        images: sheet.images.length,
        dataValidations: sheet.dataValidations.length,
      },
      columns: sheet.columns,
      rows: sheet.rows,
      merges: sheet.merges.map(m => m.ref),
      dataValidations: sheet.dataValidations,
      images: sheet.images,
      cells: sheet.cells,
    })),
  }
}

function buildLabelCatalog(workbooks: Workbook[]): LabelEntry[] {
  const byText = new Map<string, LabelEntry>()

  for (const workbook of workbooks) {
    const template = templateKey(workbook.file)
    for (const sheet of workbook.sheets) {
      for (const cell of sheet.cells) {
        // Un texto calculado por formula no es un rotulo, es un valor: lo pone
        // la propia hoja a partir de `GLOBAL`. Contarlo inflaba el catalogo y
        // habria mandado a revision textos que nadie tiene que redactar.
        if (cell.type !== 's' || cell.formula) {
          continue
        }
        const text = String(cell.value).trim()
        if (!text) {
          continue
        }
        let entry = byText.get(text)
        if (!entry) {
          entry = { text, suggestedId: slugify(text), uses: [], templates: [] }
          byText.set(text, entry)
        }
        entry.uses.push({ template, sheet: sheet.name, ref: cell.ref })
        if (!entry.templates.includes(template)) {
          entry.templates.push(template)
        }
      }
    }
  }

  // Un mismo texto en varias hojas es un rotulo compartido: se ordena por
  // alcance para que la revision empiece por lo que mas se reutiliza.
  return [...byText.values()].sort((a, b) =>
    b.templates.length - a.templates.length || b.uses.length - a.uses.length
  )
}

/**
 * Cuantos rotulos comparten dos hojas, en tanto por ciento.
 *
 * Es lo que dice si dos hojas son dos documentos o el mismo documento con
 * variantes, que es la decision que fija cuantos documentos hay que maquetar.
 */
function overlap(a: Set<string>, b: Set<string>): { percent: number; common: number } {
  let common = 0
  for (const text of a) {
    if (b.has(text)) {
      common++
    }
  }
  const union = a.size + b.size - common
  return { percent: union ? Math.round((common / union) * 100) : 0, common }
}

function writeSummary(workbooks: Workbook[], labels: LabelEntry[], assetCount: number, assetBytes: number) {
  const lines: string[] = []
  lines.push('# Inventario de plantillas de formato')
  lines.push('')
  lines.push('Generado por `npm run format:inspect`. No editar a mano.')
  lines.push('')
  lines.push(`Plantillas leidas: ${workbooks.length}`)
  lines.push(`Rotulos distintos en el conjunto: ${labels.length}`)
  lines.push(`Imagenes distintas: ${assetCount} (${(assetBytes / 1048576).toFixed(2)} MB)`)
  lines.push('')

  const inThree = labels.filter(l => l.templates.length === 3).length
  const inTwo = labels.filter(l => l.templates.length === 2).length
  const inOne = labels.filter(l => l.templates.length === 1).length
  lines.push(`Reparto: ${inThree} en las tres plantillas, ${inTwo} en dos, ${inOne} en una sola.`)
  lines.push('')

  lines.push('## Hojas')
  lines.push('')
  lines.push('| Plantilla | Hoja | Rotulos | Formulas | Combinaciones | Imagenes | Ancho util | Cabe en A4 | Escala |')
  lines.push('|---|---|---|---|---|---|---|---|---|')
  for (const workbook of workbooks) {
    const template = templateKey(workbook.file)
    for (const sheet of workbook.sheets) {
      const grid = gridSummary(sheet)
      const fit = grid.fitsA4Portrait ? 'vertical'
        : grid.fitsA4Landscape ? 'apaisado' : 'no'
      const scale = sheet.pageSetup.fitToPage
        ? `ajuste ${sheet.pageSetup.fitToWidth ?? '?'}x${sheet.pageSetup.fitToHeight ?? '?'}`
        : sheet.pageSetup.scale
          ? `${sheet.pageSetup.scale}%`
          : '-'
      lines.push([
        template,
        sheet.name,
        sheet.cells.filter(c => c.type === 's' && !c.formula).length,
        sheet.cells.filter(c => c.formula).length,
        sheet.merges.length,
        sheet.images.length,
        `${grid.usedWidthMm} mm`,
        fit,
        scale,
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
  }
  lines.push('')

  // Solapamiento entre hojas del mismo nombre logico, para agrupar documentos.
  const sets = new Map<string, Set<string>>()
  for (const workbook of workbooks) {
    const template = templateKey(workbook.file)
    for (const sheet of workbook.sheets) {
      sets.set(
        `${template}::${sheet.name}`,
        new Set(sheet.cells.filter(c => c.type === 's' && !c.formula).map(c => String(c.value).trim()).filter(Boolean))
      )
    }
  }

  lines.push('## Solapamiento entre hojas')
  lines.push('')
  lines.push('Por encima del 90% son la misma hoja; entre 60% y 90%, variantes del mismo documento.')
  lines.push('')
  lines.push('| Hoja A | Hoja B | Solapamiento | Rotulos comunes |')
  lines.push('|---|---|---|---|')
  const keys = [...sets.keys()]
  const pairs: { a: string; b: string; percent: number; common: number }[] = []
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const result = overlap(sets.get(keys[i])!, sets.get(keys[j])!)
      if (result.percent >= 45) {
        pairs.push({ a: keys[i], b: keys[j], ...result })
      }
    }
  }
  for (const pair of pairs.sort((x, y) => y.percent - x.percent)) {
    lines.push(`| ${pair.a} | ${pair.b} | ${pair.percent}% | ${pair.common} |`)
  }
  lines.push('')

  lines.push('## Imagenes por hoja')
  lines.push('')
  lines.push('| Plantilla | Hoja | Imagen | Ancla | Tamano |')
  lines.push('|---|---|---|---|---|')
  for (const workbook of workbooks) {
    const template = templateKey(workbook.file)
    for (const sheet of workbook.sheets) {
      for (const image of sheet.images) {
        lines.push(`| ${template} | ${sheet.name} | ${image.sha1.slice(0, 8)} | fila ${image.from.row}, col ${image.from.column} | ${image.widthPx ?? '?'}x${image.heightPx ?? '?'} px |`)
      }
    }
  }
  lines.push('')

  return lines.join('\n')
}

function main() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    throw new Error(`No existe ${TEMPLATES_DIR}. Ejecuta desde la raiz de cosmos-back.`)
  }

  const files = fs.readdirSync(TEMPLATES_DIR)
    .filter(f => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .sort()

  if (files.length === 0) {
    throw new Error(`No hay plantillas .xlsx en ${TEMPLATES_DIR}`)
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(ASSETS_DIR, { recursive: true })

  const workbooks = files.map(f => readWorkbook(path.join(TEMPLATES_DIR, f)))

  // --- inventario por plantilla
  for (const workbook of workbooks) {
    const key = templateKey(workbook.file)
    fs.writeFileSync(
      path.join(OUT_DIR, `${key}.inventory.json`),
      JSON.stringify(inventoryOf(workbook), null, 2)
    )
  }

  // --- biblioteca de imagenes, deduplicada por contenido
  const assets = new Map<string, { extension: string; bytes: Uint8Array }>()
  for (const workbook of workbooks) {
    for (const [digest, asset] of workbook.media) {
      if (!assets.has(digest)) {
        assets.set(digest, asset)
      }
    }
  }

  const usage = new Map<string, { template: string; sheet: string; row: number; column: number }[]>()
  for (const workbook of workbooks) {
    const template = templateKey(workbook.file)
    for (const sheet of workbook.sheets) {
      for (const image of sheet.images) {
        const list = usage.get(image.sha1) ?? []
        list.push({ template, sheet: sheet.name, row: image.from.row, column: image.from.column })
        usage.set(image.sha1, list)
      }
    }
  }

  let assetBytes = 0
  const assetIndex: unknown[] = []
  for (const [digest, asset] of assets) {
    const name = `${digest}.${asset.extension}`
    fs.writeFileSync(path.join(ASSETS_DIR, name), asset.bytes)
    assetBytes += asset.bytes.length
    assetIndex.push({
      sha1: digest,
      file: name,
      extension: asset.extension,
      bytes: asset.bytes.length,
      uses: usage.get(digest) ?? [],
    })
  }
  fs.writeFileSync(path.join(ASSETS_DIR, 'index.json'), JSON.stringify(assetIndex, null, 2))

  // --- catalogo de rotulos
  const labels = buildLabelCatalog(workbooks)
  fs.writeFileSync(path.join(OUT_DIR, 'labels.json'), JSON.stringify(labels, null, 2))

  fs.writeFileSync(path.join(OUT_DIR, 'RESUMEN.md'), writeSummary(workbooks, labels, assets.size, assetBytes))

  console.log(`Plantillas leidas      : ${workbooks.length}`)
  console.log(`Hojas                  : ${workbooks.reduce((n, w) => n + w.sheets.length, 0)}`)
  console.log(`Celdas con dato        : ${workbooks.reduce((n, w) => n + w.sheets.reduce((m, s) => m + s.cells.length, 0), 0)}`)
  console.log(`Rotulos distintos      : ${labels.length}`)
  console.log(`Imagenes distintas     : ${assets.size} (${(assetBytes / 1048576).toFixed(2)} MB)`)
  console.log(`Salida                 : ${path.relative(process.cwd(), OUT_DIR)}`)
}

main()
