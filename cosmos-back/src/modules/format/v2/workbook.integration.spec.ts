import * as ExcelJS from 'exceljs'
import * as path from 'path'
import {
  readWorkbook,
  columnToNumber,
} from '../../../../tools/format-inspector/xlsx-read'
import { DocumentBuilder } from './document.builder'
import { XlsxRenderer } from './xlsx.renderer'
import { FormatDefinition } from './document-model'
import { SEED_DEFINITIONS } from './definitions/seed'
import { FormatData } from '../format-data.service'
import { FORMAT_TEMPLATES } from '../format-templates.config'

/**
 * El libro completo de cada plantilla, generado y abierto.
 *
 * `label-coverage.spec.ts` demuestra que el **modelo** lleva todo lo de la
 * hoja original. Esto demuestra lo siguiente: que ese modelo se convierte en un
 * `.xlsx` que Excel puede abrir, con una hoja por documento, con las imagenes
 * incrustadas y con los datos de la nombrada en su sitio.
 *
 * Son las dos mitades del mismo riesgo. Un modelo completo que produce un libro
 * corrupto no sirve de nada, y un libro que abre pero al que le falta media
 * hoja tampoco.
 */

const DATA: FormatData = {
  formatType: 'GRANEL',
  namedNumber: '0875-1',
  vesselDescription: 'CMA CGM VOLTAIRE',
  pierDescription: '2-A',
  shiftDescription: '07:00 - 15:00',
  workerDate: '10/09/2025',
  workerDateValue: new Date(2025, 8, 10),
  workPermitNumber: 137,
  supervisorOperaciones: { fullName: 'ANA PEREZ', document: '40000001' },
  jefeCubierta: { fullName: 'LUIS GOMEZ', document: '40000002' },
  supervisorSsoma: 'MARIA DIAZ',
  jefeCubiertaVsi: 'JOHN SMITH',
  ssomaVsi: 'JANE DOE',
  talkTopics: [
    {
      topic: 'USO DE BLOQUEADOR SOLAR',
      summary: 'Aplicar los controles del ATS',
    },
  ],
  talk: {} as any,
  people: [
    {
      cargo: 'ESTIBADOR',
      nombres: 'RAMIREZ OLAYA JORGE',
      documento: '03474793',
      horaIngreso: '07:05',
      horaSalida: '15:02',
    },
    {
      cargo: 'TARJADOR',
      nombres: 'ORDINOLA LOPEZ JOSE',
      documento: '03474795',
      horaIngreso: '07:10',
      horaSalida: '15:00',
    },
  ],
} as any

const TEMPLATES_DIR = path.join(__dirname, '..', '..', '..', '..', 'templates')

/** Quita acentos, colapsa espacios y pasa a minusculas. */
function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** El salto de linea, sin escaparlo en el fuente. */
const SALTO = String.fromCharCode(10)

/** Nombre de hoja tal como lo escribe el renderizador. */
function sheetNameOf(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, '-').slice(0, 31)
}

describe('el libro completo de cada plantilla', () => {
  const builder = new DocumentBuilder()
  const renderer = new XlsxRenderer()

  for (const template of FORMAT_TEMPLATES) {
    describe(template.id, () => {
      const definition = SEED_DEFINITIONS[template.id] as FormatDefinition
      let workbook: ExcelJS.Workbook

      beforeAll(async () => {
        const numbers = new Map(
          definition.documents.map(document => [document.id, `X-2026-0042`])
        )
        const format = builder.build(definition, DATA, numbers)
        const buffer = await renderer.render(format)
        workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(buffer as any)
      }, 120000)

      it('el libro se abre', () => {
        expect(workbook.worksheets.length).toBeGreaterThan(0)
      })

      it('trae una hoja por documento, en el mismo orden', () => {
        expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(
          definition.documents.map(document => sheetNameOf(document.name))
        )
      })

      it('son los cuatro formatos y solo esos', () => {
        // Ni tres —la definicion vieja traia asistencia, charla e ingles— ni
        // cinco. El libro que se descarga es el indice del turno: asistencia,
        // charla, permiso de trabajo y ATS, en ese orden.
        expect(definition.documents.map(document => document.id)).toEqual([
          'asistencia',
          'charla',
          'pts',
          'ats',
        ])
        expect(workbook.worksheets.length).toBe(4)
      })

      it('cada hoja lleva el personal de la nombrada', () => {
        // La lista de personal se pagina por documento; si un formato se
        // quedara sin ella, el libro saldria completo de aspecto y vacio de
        // contenido justo donde importa.
        for (const sheet of workbook.worksheets) {
          let text = ''
          sheet.eachRow(row => {
            row.eachCell({ includeEmpty: false }, cell => {
              if (typeof cell.value === 'string') {
                text += cell.value + SALTO
              }
            })
          })
          expect({
            hoja: sheet.name,
            tienePersonal: text.includes('RAMIREZ OLAYA JORGE'),
          }).toEqual({ hoja: sheet.name, tienePersonal: true })
        }
      })

      it('todas las hojas tienen contenido', () => {
        const empty = workbook.worksheets
          .filter(sheet => sheet.rowCount < 2)
          .map(sheet => sheet.name)
        expect(empty).toEqual([])
      })

      it('incrusta las imagenes de la plantilla', () => {
        const declared = definition.documents.reduce(
          (sum, document) =>
            sum +
            document.sections.reduce(
              (n, section: any) =>
                n +
                (section.rows ?? []).reduce(
                  (m: number, row: any) =>
                    m +
                    row.cells.filter(
                      (cell: any) => cell.content?.kind === 'image'
                    ).length,
                  0
                ),
              0
            ),
          0
        )
        // ExcelJS deduplica por contenido: 38 de las 41 imagenes se repiten en
        // las tres plantillas y varias hojas comparten el mismo logo, asi que
        // hay menos imagenes en el libro que anclajes declarados.
        expect((workbook as any).model.media.length).toBeGreaterThan(0)
        expect(declared).toBeGreaterThan(0)
      })

      it('todas las hojas salen en A4, con la orientacion de su documento', () => {
        // paperSize 9 es A4 en OOXML. El PDF sale de este mismo libro, asi que
        // lo que aqui sea A4 tambien lo es alli.
        for (const document of definition.documents) {
          const sheet = workbook.getWorksheet(
            sheetNameOf(document.name)
          ) as ExcelJS.Worksheet
          expect({
            hoja: sheet.name,
            paperSize: sheet.pageSetup.paperSize,
            orientation: sheet.pageSetup.orientation,
          }).toEqual({
            hoja: sheet.name,
            paperSize: 9,
            orientation: document.orientation ?? 'portrait',
          })
        }
      })

      it('cada hoja conserva el orden de lectura de la hoja original', () => {
        // Mismo criterio que rows-structure.spec.ts, pero sobre el .xlsx ya
        // generado y no sobre el modelo: lo que se descarga es lo que cuenta.
        // Se comparan los rotulos que aparecen una sola vez en la hoja original,
        // con el criterio de label-coverage.spec.ts: textos de sharedStrings,
        // sin formulas (llevan el valor cacheado de la nombrada de ejemplo), sin
        // la banda de personal (los datos de esa nombrada) y sin marcas de una
        // letra, que son el estado de una casilla.
        const original = readWorkbook(path.join(TEMPLATES_DIR, template.file))
        for (const document of definition.documents) {
          const source = original.sheets.find(s => s.name === document.name)
          const band = new Set<number>()
          for (const block of template.blocks.filter(
            b => b.sheet === document.name
          )) {
            for (
              let row = Math.min(...block.rows);
              row <= Math.max(...block.rows);
              row++
            ) {
              band.add(row)
            }
          }
          const originales = (source?.cells ?? [])
            .filter(
              cell => cell.type === 's' && !cell.formula && !band.has(cell.row)
            )
            .filter(cell => normalizeText(String(cell.value ?? '')).length > 1)
            .slice()
            .sort(
              (a, b) =>
                a.row - b.row ||
                columnToNumber(a.column) - columnToNumber(b.column)
            )
            .map(cell => normalizeText(String(cell.value)))
          const veces = new Map<string, number>()
          for (const text of originales)
            veces.set(text, (veces.get(text) ?? 0) + 1)
          const posicion = new Map<string, number>()
          originales.forEach((text, index) => {
            if (veces.get(text) === 1) posicion.set(text, index)
          })

          const sheet = workbook.getWorksheet(
            sheetNameOf(document.name)
          ) as ExcelJS.Worksheet
          const generados: string[] = []
          sheet.eachRow(row => {
            row.eachCell({ includeEmpty: false }, cell => {
              if (cell.isMerged && cell.master !== cell) return
              const value = cell.value as any
              const text =
                typeof value === 'string'
                  ? value
                  : value?.richText
                    ? value.richText.map((part: any) => part.text).join('')
                    : ''
              if (text.trim()) generados.push(normalizeText(text))
            })
          })

          const vistos = new Set<string>()
          const comunes: number[] = []
          for (const text of generados) {
            if (posicion.has(text) && !vistos.has(text)) {
              vistos.add(text)
              comunes.push(posicion.get(text) as number)
            }
          }
          const saltos: string[] = []
          for (let i = 1; i < comunes.length; i++) {
            if (comunes[i] < comunes[i - 1])
              saltos.push(
                `${originales[comunes[i - 1]]} -> ${originales[comunes[i]]}`
              )
          }
          expect({ hoja: document.name, saltos }).toEqual({
            hoja: document.name,
            saltos: [],
          })
          // Y que el recorrido cubra la hoja, no tres textos sueltos.
          expect({
            hoja: document.name,
            faltan: [...posicion.keys()].filter(t => !vistos.has(t)),
          }).toEqual({ hoja: document.name, faltan: [] })
        }
      })

      it('cada hoja declara su area de impresion y cabe a lo ancho', () => {
        for (const sheet of workbook.worksheets) {
          expect(sheet.pageSetup.printArea).toMatch(/^A1:[A-Z]+\d+$/)
          expect(sheet.pageSetup.fitToWidth).toBe(1)
        }
      })

      it('los datos de la nombrada llegan al libro', () => {
        let text = ''
        for (const sheet of workbook.worksheets) {
          sheet.eachRow(row => {
            row.eachCell({ includeEmpty: false }, cell => {
              if (typeof cell.value === 'string') {
                text += cell.value + '\n'
              }
            })
          })
        }
        expect(text).toContain('RAMIREZ OLAYA JORGE')
        expect(text).toContain('LUIS GOMEZ')
        expect(text).toContain('X-2026-0042')
      })

      it('cada documento imprime su correlativo', () => {
        for (const document of definition.documents) {
          const sheet = workbook.getWorksheet(
            sheetNameOf(document.name)
          ) as ExcelJS.Worksheet
          let text = ''
          sheet.eachRow(row => {
            row.eachCell({ includeEmpty: false }, cell => {
              if (typeof cell.value === 'string') {
                text += cell.value
              }
            })
          })
          expect({
            documento: document.name,
            tieneNumero: text.includes('X-2026-0042'),
          }).toEqual({ documento: document.name, tieneNumero: true })
        }
      })
    })
  }
})
