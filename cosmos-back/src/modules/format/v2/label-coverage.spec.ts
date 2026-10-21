import * as fs from 'fs'
import * as path from 'path'
import { DocumentBuilder } from './document.builder'
import {
  DocumentDefinition,
  FormatDefinition,
  ResolvedSection,
} from './document-model'
import { SEED_DEFINITIONS } from './definitions/seed'
import { FormatData } from '../format-data.service'
import { readWorkbook, Workbook } from '../../../../tools/format-inspector/xlsx-read'
import { FORMAT_TEMPLATES } from '../format-templates.config'
import { assetPath } from './asset-library'

/**
 * Cobertura: que al pasar las plantillas al motor nuevo no se pierda nada.
 *
 * Es la mitigacion del riesgo R2 del informe de factibilidad, y la unica red de
 * seguridad real que existe aqui. Un rotulo que se pierde **no da error**: sale
 * un formato que parece correcto y no lo es, y eso solo se descubre cuando
 * alguien audita el registro meses despues.
 *
 * Se comprueban cuatro cosas, hoja por hoja y plantilla por plantilla:
 *
 * 1. Que exista un documento por cada hoja imprimible.
 * 2. Que ningun rotulo preimpreso de la hoja falte en el documento.
 * 3. Que esten todas las imagenes, y **en el mismo orden**.
 * 4. Que cada imagen referida exista en la biblioteca de recursos.
 *
 * La comparacion normaliza espacios y acentos porque las plantillas los usan
 * para maquetar: `"APELLIDOS        Y        NOMBRES"` y `"APELLIDOS Y
 * NOMBRES"` son el mismo rotulo.
 */

const TEMPLATES_DIR = path.join(__dirname, '..', '..', '..', '..', 'templates')

/**
 * Hojas de las plantillas que **no** se emiten, con su motivo.
 *
 * Es la misma lista que aplica `tools/format-inspector/generate.ts`, repetida
 * aqui a proposito: si el generador dejara de emitir una hoja por accidente, la
 * prueba que lee su propia lista no lo veria. Al declararla por separado, quitar
 * un documento obliga a decirlo en los dos sitios.
 *
 * El alcance acordado son cuatro documentos por tipo: asistencia, charla,
 * permiso de trabajo y ATS.
 */
const EXCLUDED: Record<string, string> = {
  GLOBAL: 'origen de las formulas de la plantilla',
  GENERAL: 'lista para los desplegables; no se imprime',
  'VESSEL INSPECTION': 'fuera del alcance de cuatro documentos por tipo',
  // Con la errata, en la plantilla de containero.
  'VESSEL INPECTION': 'fuera del alcance de cuatro documentos por tipo',
  'INGLÉS': 'fuera del alcance de cuatro documentos por tipo',
  'SS01-F167. PTS (3C)': 'segunda copia del mismo permiso',
  'ATS DESPACHO': 'segundo ATS de mercaderia general y big bag',
}

/** Los cuatro documentos, en el orden en que se emiten. */
const EXPECTED_DOCUMENTS = ['asistencia', 'charla', 'pts', 'ats']

/** Quita acentos, colapsa espacios y pasa a minusculas. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const workbooks = new Map<string, Workbook>()
function workbookOf(file: string): Workbook {
  if (!workbooks.has(file)) {
    workbooks.set(file, readWorkbook(path.join(TEMPLATES_DIR, file)))
  }
  return workbooks.get(file) as Workbook
}

/**
 * Filas de una hoja que contienen personal, no rotulos.
 *
 * Las plantillas se guardaron con una nombrada de ejemplo dentro, asi que esas
 * filas traen nombres, documentos y cargos escritos. Son datos de aquella
 * jornada, no rotulos del formato. Que filas son lo declara
 * `format-templates.config.ts`, que es lo mismo que usa el motor legacy para
 * escribir ahi: reusarlo evita que las dos ideas de "donde va el personal" se
 * separen.
 */
function personRows(templateId: string, sheetName: string): Set<number> {
  const template = FORMAT_TEMPLATES.find(t => t.id === templateId)
  const rows = new Set<number>()
  for (const block of template?.blocks ?? []) {
    if (block.sheet !== sheetName) {
      continue
    }
    // Se descarta la **banda entera**, de la primera a la ultima fila del
    // bloque, no solo las filas declaradas. Dentro de la banda todo es o bien
    // la lista (datos de la nombrada de ejemplo) o bien la cabecera de columnas
    // repetida para que cada pagina impresa la lleve, y esa cabecera la
    // reimprime la tabla por su cuenta. La hoja de asistencia de GRANEL tiene
    // ademas alguna fila de personal que el bloque no declara, con su cargo de
    // ejemplo escrito dentro.
    const first = Math.min(...block.rows)
    const last = Math.max(...block.rows)
    for (let row = first; row <= last; row++) {
      rows.add(row)
    }
  }
  return rows
}

function sheetLabels(templateId: string, file: string, sheetName: string): string[] {
  const sheet = workbookOf(file).sheets.find(s => s.name === sheetName)
  if (!sheet) {
    throw new Error(`La hoja "${sheetName}" no esta en ${file}`)
  }

  const dataRows = personRows(templateId, sheetName)
  const labels = new Set<string>()
  for (const cell of sheet.cells) {
    // `t="s"` son los textos de `sharedStrings`, donde viven los rotulos. Los
    // numeros y las formulas no lo son.
    if (cell.type !== 's' || dataRows.has(cell.row)) {
      continue
    }
    // Una celda con formula no lleva rotulo: lleva el **valor cacheado** de la
    // nombrada con la que se guardo el libro. Exigir que ese valor salga en el
    // documento es exigir que se imprima la fecha, el codigo y el nombre y DNI
    // de aquella jornada. Que esas celdas esten, y esten atadas a su campo, lo
    // comprueba `data-coverage.spec.ts`.
    if (cell.formula) {
      continue
    }
    const text = normalize(String(cell.value ?? ''))
    // Las marcas de una sola letra (la `X` de una casilla) no son rotulos que
    // cubrir: son el estado de la casilla.
    if (text.length > 1) {
      labels.add(text)
    }
  }
  return [...labels]
}

/** Imagenes de una hoja, en su orden de lectura. */
function sheetImages(file: string, sheetName: string): string[] {
  const sheet = workbookOf(file).sheets.find(s => s.name === sheetName)
  return (sheet?.images ?? [])
    .slice()
    .sort((a, b) => a.from.row - b.from.row || a.from.column - b.from.column)
    .map(image => image.sha1)
}

/** Todos los textos que el documento generado pone sobre el papel. */
function documentTexts(sections: ResolvedSection[], documentNumber: string): string[] {
  const texts: string[] = [documentNumber]
  for (const section of sections) {
    if ('title' in section && section.title) {
      texts.push(section.title)
    }
    switch (section.kind) {
      case 'header':
        texts.push(section.title)
        if (section.documentCode) texts.push(`Código: ${section.documentCode}`)
        if (section.documentVersion) texts.push(`Versión: ${section.documentVersion}`)
        if (section.documentDate) texts.push(`Fecha: ${section.documentDate}`)
        if (section.pages !== null) texts.push(`Página: 1 de ${section.pages}`)
        section.fields.forEach(field => texts.push(field.label, field.value))
        break
      case 'fields':
        section.fields.forEach(field => texts.push(field.label, field.value))
        break
      case 'checklist':
        section.items.forEach(item => texts.push(item.label))
        break
      case 'table':
        section.columns.forEach(column => texts.push(column.label))
        section.rows.forEach(row => row.forEach(cell => texts.push(cell)))
        break
      case 'rows':
        section.rows.forEach(row =>
          row.cells.forEach(cell => texts.push(cell.text))
        )
        break
      case 'signatures':
        section.slots.forEach(slot => texts.push(slot.label, slot.name))
        break
    }
  }
  return texts.map(normalize).filter(Boolean)
}

/** Imagenes del documento generado, en el orden en que las declara. */
function documentImages(sections: ResolvedSection[]): string[] {
  const images: string[] = []
  for (const section of sections) {
    if (section.kind !== 'rows') {
      continue
    }
    for (const row of section.rows) {
      for (const cell of row.cells) {
        for (const image of cell.images ?? []) {
          images.push(image.sha1)
        }
      }
    }
  }
  return images
}

const DATA: FormatData = {
  formatType: 'GRANEL',
  namedNumber: '0875-1',
  vesselDescription: 'CMA CGM VOLTAIRE',
  pierDescription: '2-A',
  shiftDescription: '07:00 - 15:00',
  workerDate: '10/09/2025',
  workerDateValue: new Date(2025, 8, 10),
  workPermitNumber: 137,
  supervisorOperaciones: { fullName: 'ZZSUPOPZZ', document: '40000001' },
  jefeCubierta: { fullName: 'ZZJEFEZZ', document: '40000002' },
  supervisorSsoma: 'ZZSSOMAZZ',
  jefeCubiertaVsi: 'ZZJCVSIZZ',
  ssomaVsi: 'ZZSSVSIZZ',
  talkTopics: [{ topic: 'ZZTEMAZZ', summary: 'ZZRESUMENZZ' }],
  talk: {} as any,
  // Valores largos y distintivos: con datos de una o dos letras, la comparacion
  // por inclusion daria por cubierto cualquier rotulo que los contenga.
  people: [{
    cargo: 'ZZCARGOZZ', nombres: 'ZZNOMBREZZ', documento: 'ZZDOCZZ',
    horaIngreso: '07:05', horaSalida: '15:02',
  }],
} as any

const MIN_MATCH = 6

function render(definition: FormatDefinition, document: DocumentDefinition) {
  const single: FormatDefinition = { ...definition, documents: [document] }
  const built = new DocumentBuilder().build(
    single, DATA, new Map([[document.id, 'X-2025-0001']])
  )
  return built.documents[0]
}

describe('cobertura de las plantillas en el motor v2', () => {
  for (const template of FORMAT_TEMPLATES) {
    describe(template.id, () => {
      const definition = SEED_DEFINITIONS[template.id]

      /** Las hojas que sostienen los cuatro documentos emitidos. */
      const emittedSheets = definition.documents.map(document => document.name)

      it('la plantilla esta en el repositorio', () => {
        expect(fs.existsSync(path.join(TEMPLATES_DIR, template.file))).toBe(true)
      })

      it('emite los cuatro documentos, en orden', () => {
        expect(definition.documents.map(document => document.id))
          .toEqual(EXPECTED_DOCUMENTS)
      })

      it('cada documento apunta a una hoja real de la plantilla', () => {
        const sheets = workbookOf(template.file).sheets.map(sheet => sheet.name)
        for (const name of emittedSheets) {
          expect({ hoja: name, existe: sheets.includes(name) })
            .toEqual({ hoja: name, existe: true })
        }
      })

      it('toda hoja de la plantilla se emite o esta descartada con motivo', () => {
        // Sin esto, una hoja podria dejar de emitirse sin que nadie lo notara,
        // que es lo que paso con VESSEL INSPECTION y el ingles por estar
        // marcadas como ocultas en Excel.
        const sinExplicar = workbookOf(template.file).sheets
          .map(sheet => sheet.name)
          .filter(name => !emittedSheets.includes(name) && !EXCLUDED[name])
        expect(sinExplicar).toEqual([])
      })

      for (const sheetName of emittedSheets) {
        describe(sheetName, () => {
          const document = () =>
            definition.documents.find(d => d.name === sheetName) as DocumentDefinition

          it('no pierde ningun rotulo de la hoja original', () => {
            const built = render(definition, document())
            const generated = documentTexts(built.sections, built.number)

            const missing = sheetLabels(template.id, template.file, sheetName)
              .filter(label =>
                !generated.some(text =>
                  text === label ||
                  (label.length >= MIN_MATCH && text.includes(label)) ||
                  (text.length >= MIN_MATCH && label.includes(text))
                )
              )

            // Se listan para que el aviso diga que falta, no solo cuantos.
            expect({ sheet: sheetName, missing }).toEqual({ sheet: sheetName, missing: [] })
          })

          it('lleva todas las imagenes, en el mismo orden', () => {
            expect(documentImages(render(definition, document()).sections))
              .toEqual(sheetImages(template.file, sheetName))
          })

          it('cada imagen esta en la biblioteca de recursos', () => {
            const faltan = documentImages(render(definition, document()).sections)
              .filter(sha1 => !assetPath(sha1))
            // Sin el fichero, el pictograma no sale y el formato omite un dato
            // normativo. `npm run format:generate` los extrae.
            expect(faltan).toEqual([])
          })
        })
      }
    })
  }
})
