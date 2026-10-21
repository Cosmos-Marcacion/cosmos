import * as path from 'path'
import { DocumentBuilder } from './document.builder'
import { FormatDefinition } from './document-model'
import { SEED_DEFINITIONS } from './definitions/seed'
import { FormatData } from '../format-data.service'
import { readWorkbook, Workbook, columnToNumber } from '../../../../tools/format-inspector/xlsx-read'
import { FORMAT_TEMPLATES } from '../format-templates.config'

/**
 * Cobertura de los **datos**, que es la otra mitad de `label-coverage.spec.ts`.
 *
 * Aquella comprueba que no falte ningun rotulo preimpreso. Esta comprueba lo
 * contrario: que los huecos donde va la jornada sean huecos y no texto.
 *
 * Hace falta porque el fallo que cubre no se ve. Las plantillas se guardaron
 * con una nombrada de ejemplo dentro, y las celdas que el motor legacy rellena
 * por formula (`=GLOBAL!B4`) viajan en el `.xlsx` con su **valor cacheado**: la
 * fecha `46248`, el codigo `0830`, y el nombre y el DNI de una persona real. Al
 * generar la definicion desde la plantilla, ese valor se guardaba como texto
 * fijo. El documento salia con todos sus rotulos, con su maquetacion y con sus
 * imagenes, y con los datos de otra jornada: exactamente el formato que parece
 * correcto y no lo es.
 *
 * Se comprueban tres cosas:
 *
 * 1. Que cada celda que la plantilla ata a `GLOBAL` sea en la definicion una
 *    casilla de dato o de verificacion, atada al campo que le toca.
 * 2. Que ninguna definicion lleve escrito el valor de ejemplo de esas celdas.
 * 3. Que el documento construido imprima los datos de **esta** nombrada.
 */

const TEMPLATES_DIR = path.join(__dirname, '..', '..', '..', '..', 'templates')

/**
 * Que campo de la jornada vive en cada celda de `GLOBAL`.
 *
 * Se declara aqui y no se importa del generador a proposito, igual que la lista
 * de hojas descartadas: una prueba que lee el mismo mapa que el codigo que
 * vigila no comprueba nada. Sale de `format.service.ts`, que es quien escribe
 * esas celdas en el motor legacy.
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

const GLOBAL_REFERENCE = /'?GLOBAL'?!\$?([A-Z]+)\$?(\d+)/i

const workbooks = new Map<string, Workbook>()
function workbookOf(file: string): Workbook {
  if (!workbooks.has(file)) {
    workbooks.set(file, readWorkbook(path.join(TEMPLATES_DIR, file)))
  }
  return workbooks.get(file) as Workbook
}

/**
 * Filas de personal de una hoja, que no se emiten.
 *
 * Lo que la plantilla repite ahi es la cabecera de su segunda pagina impresa,
 * con sus tres casillas de jornada. El motor v2 pagina por su cuenta y reimprime
 * la cabecera entera, asi que esas copias no tienen que estar: estarian dos
 * veces. Son las unicas celdas atadas a `GLOBAL` que la definicion no lleva.
 */
function personRows(templateId: string, sheetName: string): Set<number> {
  const template = FORMAT_TEMPLATES.find(t => t.id === templateId)
  const rows = new Set<number>()
  for (const block of template?.blocks ?? []) {
    if (block.sheet !== sheetName) {
      continue
    }
    for (let row = Math.min(...block.rows); row <= Math.max(...block.rows); row++) {
      rows.add(row)
    }
  }
  return rows
}

/** Las celdas que la hoja ata a un campo de la jornada, fuera de la lista. */
function boundCells(templateId: string, file: string, sheetName: string) {
  const sheet = workbookOf(file).sheets.find(s => s.name === sheetName)
  if (!sheet) {
    throw new Error(`La hoja "${sheetName}" no esta en ${file}`)
  }
  const skip = personRows(templateId, sheetName)
  const bound: { ref: string; id: string; source: string; cached: string }[] = []
  for (const cell of sheet.cells) {
    if (!cell.formula || skip.has(cell.row)) {
      continue
    }
    const match = GLOBAL_REFERENCE.exec(cell.formula)
    if (!match) {
      continue
    }
    const field = GLOBAL_SOURCES[`${match[1].toUpperCase()}${match[2]}`]
    if (!field) {
      continue
    }
    bound.push({
      ref: cell.ref,
      // El generador nombra cada casilla `<fila>-<columna>` con la columna en
      // que empieza, que para estas es la suya: todas son la esquina de su
      // combinacion.
      id: `${cell.row}-${columnToNumber(cell.column)}`,
      source: field.source,
      cached: String(cell.value ?? '').trim(),
    })
  }
  return bound
}

/** Las casillas de la definicion, por su identificador. */
function cellsById(document: any): Map<string, any> {
  const index = new Map<string, any>()
  for (const section of document.sections) {
    if (section.kind !== 'rows') {
      continue
    }
    for (const row of section.rows) {
      for (const cell of row.cells) {
        index.set(cell.id, cell)
      }
    }
  }
  return index
}

/**
 * Una nombrada con valores largos y distintivos.
 *
 * Con `1` o `A` la comprobacion de que el dato sale impreso la cumpliria
 * cualquier rotulo que lleve esa letra dentro.
 */
const DATA: FormatData = {
  formatType: 'GRANEL',
  namedNumber: 'ZZCODIGOZZ',
  vesselDescription: 'ZZNAVEZZ',
  pierDescription: 'ZZMUELLEZZ',
  shiftDescription: '07:00 - 15:00',
  workerDate: '10/09/2025',
  workerDateValue: new Date(2025, 8, 10),
  workPermitNumber: 137,
  supervisorOperaciones: { fullName: 'ZZSUPOPZZ', document: '40000001' },
  jefeCubierta: { fullName: 'ZZJEFEZZ', document: '40000002' },
  supervisorSsoma: 'ZZSSOMAZZ',
  jefeCubiertaVsi: 'ZZJCVSIZZ',
  ssomaVsi: 'ZZSSVSIZZ',
  talkTopics: [{ topic: 'ZZTEMAUNOZZ', summary: 'ZZRESUMENUNOZZ' }],
  talk: {} as any,
  people: [{
    cargo: 'ZZCARGOZZ', nombres: 'ZZNOMBREZZ', documento: 'ZZDOCZZ',
    horaIngreso: '07:05', horaSalida: '15:02',
  }],
} as any

/** Lo que debe salir impreso por cada campo, con la nombrada de arriba. */
const EXPECTED: Record<string, string> = {
  nave: 'ZZNAVEZZ',
  muelle: 'ZZMUELLEZZ',
  fecha: '10/09/2025',
  jornada: '1',
  turno: '07:00',
  codigoNombrada: 'ZZCODIGOZZ',
  supervisorOperaciones: 'ZZSUPOPZZ - 40000001',
  jefeCubierta: 'ZZJEFEZZ - 40000002',
  supervisorSsoma: 'ZZSSOMAZZ',
  jefeCubiertaVsi: 'ZZJCVSIZZ',
  ssomaVsi: 'ZZSSVSIZZ',
  temaCharla1: 'ZZTEMAUNOZZ',
  resumenCharla1: 'ZZRESUMENUNOZZ',
  // La nombrada de prueba trae un solo tema; el segundo y el tercero salen en
  // blanco, que es justo lo que tienen que hacer.
  temaCharla2: '',
  temaCharla3: '',
  resumenCharla2: '',
  resumenCharla3: '',
}

function render(definition: FormatDefinition, document: any) {
  const single: FormatDefinition = { ...definition, documents: [document] }
  return new DocumentBuilder()
    .build(single, DATA, new Map([[document.id, 'X-2025-0001']]))
    .documents[0]
}

describe('cobertura de los datos de la jornada', () => {
  for (const template of FORMAT_TEMPLATES) {
    describe(template.id, () => {
      const definition = SEED_DEFINITIONS[template.id]

      for (const document of definition.documents) {
        describe(document.name, () => {
          const bound = () => boundCells(template.id, template.file, document.name)

          it('cada hueco de la plantilla es una casilla de dato', () => {
            const index = cellsById(document)
            const malas = bound()
              .map(cell => {
                const found = index.get(cell.id)
                const kind = found?.content?.kind
                if (kind === 'data' || kind === 'check') {
                  return null
                }
                return { celda: cell.ref, campo: cell.source, es: kind ?? 'no esta' }
              })
              .filter(Boolean)
            expect({ hoja: document.name, malas }).toEqual({ hoja: document.name, malas: [] })
          })

          it('cada casilla de dato apunta al campo que la plantilla le da', () => {
            const index = cellsById(document)
            const malas = bound()
              .map(cell => {
                const content = index.get(cell.id)?.content
                const actual = content?.kind === 'data'
                  ? content.source
                  : content?.kind === 'check' ? content.when?.source : undefined
                // La casilla de verificacion mira el turno para saber cual de
                // las tres jornadas marcar; la plantilla la ata a la hora de
                // inicio, que es el mismo dato.
                const esperado = content?.kind === 'check' ? 'turno' : cell.source
                return actual === esperado
                  ? null
                  : { celda: cell.ref, esperaba: esperado, tiene: actual ?? 'nada' }
              })
              .filter(Boolean)
            expect({ hoja: document.name, malas }).toEqual({ hoja: document.name, malas: [] })
          })

          it('no lleva escrito el dato de la nombrada de ejemplo', () => {
            // El valor cacheado de la plantilla no puede aparecer como texto en
            // ninguna casilla: seria el dato de otra jornada impreso a fuego.
            const ejemplos = new Set(
              bound().map(cell => cell.cached).filter(value => value.length > 3)
            )
            const escritos: string[] = []
            for (const cell of cellsById(document).values()) {
              if (cell.content.kind !== 'text') {
                continue
              }
              const text = String(cell.content.text).trim()
              if (ejemplos.has(text)) {
                escritos.push(`${cell.id}: "${text.slice(0, 40)}"`)
              }
            }
            expect({ hoja: document.name, escritos })
              .toEqual({ hoja: document.name, escritos: [] })
          })

          it('el documento construido imprime los datos de esta nombrada', () => {
            const built = render(definition, document)
            const printed = new Map<string, string>()
            for (const section of built.sections) {
              if (section.kind !== 'rows') {
                continue
              }
              for (const row of section.rows) {
                for (const cell of row.cells) {
                  if (cell.kind === 'data') {
                    printed.set(cell.id, cell.text)
                  }
                }
              }
            }

            const index = cellsById(document)
            const malas = bound()
              .filter(cell => index.get(cell.id)?.content?.kind === 'data')
              .map(cell => {
                const value = printed.get(cell.id)
                const esperado = EXPECTED[cell.source]
                return value === esperado
                  ? null
                  : { celda: cell.ref, campo: cell.source, esperaba: esperado, salio: value }
              })
              .filter(Boolean)
            expect({ hoja: document.name, malas }).toEqual({ hoja: document.name, malas: [] })
          })
        })
      }
    })
  }

  describe('casillas de firma', () => {
    /**
     * Que responsable firma en cada documento.
     *
     * Se declara aqui, y no se importa del generador, por lo mismo que la lista
     * de hojas descartadas: una prueba que lee el mismo mapa que el codigo que
     * vigila no comprueba nada.
     *
     * El orden importa: en el permiso firma primero el Responsable del Area (el
     * supervisor) y luego el Responsable del Trabajo (el jefe de cubierta); en
     * el ATS es al reves, porque el Ejecutante es el jefe y el Autorizante el
     * supervisor. Invertirlos daria un documento firmado por quien no era.
     */
    const FIRMANTES: Record<string, string[]> = {
      pts: ['supervisorOperaciones', 'jefeCubierta'],
      ats: ['jefeCubierta', 'supervisorOperaciones'],
    }

    /** Las casillas de firma de un documento, en su orden de lectura. */
    function firmasDe(document: any): { id: string; source: string }[] {
      const out: { id: string; source: string }[] = []
      for (const section of document.sections) {
        if (section.kind !== 'rows') {
          continue
        }
        for (const row of section.rows) {
          for (const cell of row.cells) {
            if (cell.content.kind === 'signature') {
              out.push({ id: cell.id, source: cell.content.source })
            }
          }
        }
      }
      return out
    }

    for (const template of FORMAT_TEMPLATES) {
      it(`${template.id}: cada responsable firma en su documento`, () => {
        const definition = SEED_DEFINITIONS[template.id]
        for (const [documentId, esperados] of Object.entries(FIRMANTES)) {
          const document = definition.documents.find(d => d.id === documentId) as any
          expect({ documento: documentId, firmantes: firmasDe(document).map(f => f.source) })
            .toEqual({ documento: documentId, firmantes: esperados })
        }
      })

      it(`${template.id}: la firma va en la fila del propio responsable`, () => {
        // Es lo que impide que la firma del supervisor acabe en la casilla
        // FIRMA del inspector, que es otra tabla y otra persona. Paso: el ATS de
        // granel tiene sus responsables dos filas mas arriba que las otras dos
        // plantillas, y con coordenadas fijas la firma caia una tabla mas abajo.
        const definition = SEED_DEFINITIONS[template.id]
        const malas: any[] = []
        for (const documentId of Object.keys(FIRMANTES)) {
          const document = definition.documents.find(d => d.id === documentId) as any
          for (const section of document.sections) {
            if (section.kind !== 'rows') {
              continue
            }
            for (const row of section.rows) {
              const firma = row.cells.find((c: any) => c.content.kind === 'signature')
              if (!firma) {
                continue
              }
              // En la misma fila tiene que estar el nombre de quien firma.
              const dato = row.cells.find(
                (c: any) => c.content.kind === 'data' && c.content.source === firma.content.source
              )
              if (!dato) {
                malas.push({ documento: documentId, fila: row.id, firma: firma.content.source })
              }
            }
          }
        }
        expect(malas).toEqual([])
      })

      it(`${template.id}: solo la columna FIRMA de la lista imprime la firma`, () => {
        // Las de refrigerio tambien usan `source: 'firma'` porque son huecos en
        // blanco, pero se rellenan con una hora. Estampar ahi la firma diria que
        // la persona firmo su entrada al refrigerio.
        const definition = SEED_DEFINITIONS[template.id]
        const marcadas: string[] = []
        for (const document of definition.documents) {
          for (const section of document.sections) {
            if (section.kind !== 'table') {
              continue
            }
            for (const column of section.columns) {
              if ((column as any).signature) {
                marcadas.push(`${document.id}/${column.id}`)
              }
            }
          }
        }
        expect(marcadas).toEqual([
          'asistencia/firma',
          'charla/firma',
          'pts/firma',
          'ats/firma',
        ])
      })
    }
  })

  it('la casilla de la jornada se marca sola con el turno de la nombrada', () => {
    // La hoja de asistencia lleva tres casillas, una por jornada, y la
    // plantilla las resuelve con `IF(GLOBAL!$B$7="15:00 HRS.","X"," ")`. Sin
    // condicion salian con la marca de la nombrada de ejemplo, y el documento
    // decia que la jornada era la de tarde cualquiera que fuese.
    for (const template of FORMAT_TEMPLATES) {
      const definition = SEED_DEFINITIONS[template.id]
      const asistencia = definition.documents.find(d => d.id === 'asistencia') as any
      const casillas = asistencia.sections
        .filter((section: any) => section.kind === 'rows')
        .flatMap((section: any) => section.rows)
        .flatMap((row: any) => row.cells)
        .filter((cell: any) => cell.content.kind === 'check')

      expect({ plantilla: template.id, casillas: casillas.length })
        .toEqual({ plantilla: template.id, casillas: 3 })

      // `DATA` es la jornada de las 07:00, o sea la primera.
      const marcadas = render(definition, asistencia).sections
        .filter((section: any) => section.kind === 'rows')
        .flatMap((section: any) => section.rows)
        .flatMap((row: any) => row.cells)
        .filter((cell: any) => cell.kind === 'check')
        .map((cell: any) => cell.checked)

      expect({ plantilla: template.id, marcadas })
        .toEqual({ plantilla: template.id, marcadas: [true, false, false] })
    }
  })
})
