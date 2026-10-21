import * as ExcelJS from 'exceljs'
import { DocumentBuilder } from './document.builder'
import { XlsxRenderer } from './xlsx.renderer'
import { FormatDefinition } from './document-model'
import { ASISTENCIA_DOCUMENT } from './definitions/asistencia.definition'
import { CHARLA_DOCUMENT } from './definitions/charla.definition'
import { INGLES_DOCUMENT } from './definitions/ingles.definition'
import { FormatData } from '../format-data.service'
import { mmToExcelWidth, fitColumns } from './a4-grid'

/**
 * El renderizador de Excel, comprobado **abriendo el libro que produce**.
 *
 * Comparar bytes no diria nada util: lo que hay que demostrar es que el fichero
 * se puede abrir, que lleva una hoja por documento y que los datos estan en su
 * sitio. Un `.xlsx` corrupto se abre igual de mal con cualquier comparacion de
 * buffers, y Excel no dice que parte esta mal.
 */

function person(nombres: string, cargo: string, documento: string) {
  return {
    cargo,
    nombres,
    documento,
    horaIngreso: '07:05',
    horaSalida: '15:02',
  }
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
    person('RAMIREZ OLAYA JORGE', 'ESTIBADOR', '03474793'),
    person('CALDERON IPANAQUE JESUS', 'ESTIBADOR', '03474794'),
    person('ORDINOLA LOPEZ JOSE', 'TARJADOR', '03474795'),
  ],
} as any

const DEFINITION: FormatDefinition = {
  formatType: 'GRANEL',
  label: 'Granel',
  version: 3,
  documents: [ASISTENCIA_DOCUMENT, CHARLA_DOCUMENT, INGLES_DOCUMENT],
}

const NUMBERS = new Map([
  ['asistencia', 'AST-2025-0042'],
  ['charla', 'CHA-2025-0042'],
  ['ingles', 'SSL-2025-0042'],
])

describe('XlsxRenderer', () => {
  const builder = new DocumentBuilder()
  const renderer = new XlsxRenderer()

  let workbook: ExcelJS.Workbook

  beforeAll(async () => {
    const format = builder.build(DEFINITION, DATA, NUMBERS)
    const buffer = await renderer.render(format)
    workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as any)
    // Componer y volver a leer un libro tarda mas de los 5 s por defecto de
    // jest cuando la suite entera corre a la vez.
  }, 120000)

  it('el libro se abre y trae una hoja por documento', () => {
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual([
      'ASISTENCIA',
      'CHARLA',
      'INGLÉS',
    ])
  })

  const textOf = (sheetName: string): string => {
    const sheet = workbook.getWorksheet(sheetName) as ExcelJS.Worksheet
    const parts: string[] = []
    sheet.eachRow(row => {
      row.eachCell({ includeEmpty: false }, cell => {
        const value = cell.value
        if (typeof value === 'string') {
          parts.push(value)
        } else if (
          value &&
          typeof value === 'object' &&
          'richText' in (value as any)
        ) {
          parts.push(
            (value as any).richText.map((run: any) => run.text).join('')
          )
        } else if (value !== null && value !== undefined) {
          parts.push(String(value))
        }
      })
    })
    return parts.join('\n')
  }

  it('la cabecera lleva codigo, version y numero del documento', () => {
    const text = textOf('ASISTENCIA')
    expect(text).toContain('ASISTENCIA DE PERSONAL PAITA')
    expect(text).toContain('PD03-R97')
    expect(text).toContain('AST-2025-0042')
  })

  it('cada documento imprime su propio numero, no el del vecino', () => {
    expect(textOf('CHARLA')).toContain('CHA-2025-0042')
    expect(textOf('CHARLA')).not.toContain('AST-2025-0042')
    expect(textOf('INGLÉS')).toContain('SSL-2025-0042')
  })

  it('los datos de la nombrada estan en la hoja', () => {
    const text = textOf('ASISTENCIA')
    expect(text).toContain('CMA CGM VOLTAIRE')
    expect(text).toContain('2-A')
    expect(text).toContain('10/09/2025')
  })

  it('el personal sale con su cargo, documento y marcaciones', () => {
    const text = textOf('ASISTENCIA')
    expect(text).toContain('RAMIREZ OLAYA JORGE')
    expect(text).toContain('03474793')
    expect(text).toContain('07:05')
    expect(text).toContain('15:02')
  })

  it('el jefe de cubierta encabeza la lista', () => {
    const sheet = workbook.getWorksheet('ASISTENCIA') as ExcelJS.Worksheet
    const rows: string[] = []
    sheet.eachRow(row =>
      rows.push(row.values ? JSON.stringify(row.values) : '')
    )
    const jefe = rows.findIndex(row => row.includes('LUIS GOMEZ'))
    const primero = rows.findIndex(row => row.includes('RAMIREZ OLAYA JORGE'))
    expect(jefe).toBeGreaterThan(-1)
    expect(jefe).toBeLessThan(primero)
  })

  it('la casilla del turno sale marcada, y solo esa', () => {
    const text = textOf('ASISTENCIA')
    expect(text).toContain('07:00 / 15:00 HRS.')
    expect(text).toContain('23:00 / 07:00 HRS.')
    // Una sola X en toda la seccion de jornada.
    const sheet = workbook.getWorksheet('ASISTENCIA') as ExcelJS.Worksheet
    let marks = 0
    sheet.eachRow(row => {
      row.eachCell({ includeEmpty: false }, cell => {
        if (cell.value === 'X') {
          marks++
        }
      })
    })
    expect(marks).toBe(1)
  })

  it('la hoja de ingles lleva su columna preimpresa', () => {
    const text = textOf('INGLÉS')
    expect(text).toContain('FOREMAN')
    expect(text).toContain('STEVEDORE')
    expect(text).toContain("SHIFT'S STEVEDORES LIST")
  })

  it('la orientacion de cada hoja es la declarada', () => {
    expect(workbook.getWorksheet('ASISTENCIA')?.pageSetup.orientation).toBe(
      'landscape'
    )
    expect(workbook.getWorksheet('INGLÉS')?.pageSetup.orientation).toBe(
      'portrait'
    )
  })

  it('la cabecera de la tabla se repite en cada pagina impresa', () => {
    // Es lo que la plantilla conseguia intercalando cabeceras entre las filas.
    expect(
      workbook.getWorksheet('ASISTENCIA')?.pageSetup.printTitlesRow
    ).toMatch(/^\d+:\d+$/)
  })

  it('la hoja cabe a lo ancho de una pagina', () => {
    const setup = workbook.getWorksheet('ASISTENCIA')?.pageSetup as any
    expect(setup.fitToWidth).toBe(1)
    // Y a lo alto, en las hojas de la plantilla original por cada pagina de la
    // lista de personal. Con `0` una hoja de 60 filas se partia en tres y solo
    // la primera llevaba la cabecera del documento.
    expect(setup.fitToHeight).toBeGreaterThanOrEqual(1)
  })

  it('todas las columnas de la rejilla tienen el mismo ancho', () => {
    const sheet = workbook.getWorksheet('ASISTENCIA') as ExcelJS.Worksheet
    const widths = new Set<number>()
    for (let i = 1; i <= 24; i++) {
      widths.add(sheet.getColumn(i).width as number)
    }
    expect(widths.size).toBe(1)
  })

  it('un documento sin numero no imprime la etiqueta', async () => {
    const sinNumero: FormatDefinition = {
      ...DEFINITION,
      documents: [{ ...INGLES_DOCUMENT, numbering: { kind: 'none' } }],
    }
    const buffer = await renderer.render(
      builder.build(sinNumero, DATA, new Map())
    )
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(buffer as any)

    const sheet = book.getWorksheet('INGLÉS') as ExcelJS.Worksheet
    let text = ''
    sheet.eachRow(row => {
      row.eachCell({ includeEmpty: false }, cell => {
        text += typeof cell.value === 'string' ? cell.value : ''
      })
    })
    expect(text).not.toContain('N°: ')
  })

  // --- firmas registradas ----------------------------------------------------

  /** Un PNG de 1x1 valido, que es cuanto necesita ExcelJS para anclar. */
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  )

  /** Una definicion de una hoja con una casilla de firma y una lista. */
  const CON_FIRMA: FormatDefinition = {
    ...DEFINITION,
    documents: [
      {
        id: 'firmas',
        name: 'FIRMAS',
        orientation: 'portrait',
        numbering: { kind: 'none' },
        sections: [
          {
            kind: 'rows',
            id: 's1',
            rows: [
              {
                id: 'f1',
                cells: [
                  {
                    id: 'f1-a',
                    width: 60,
                    content: { kind: 'text', text: 'Responsable' },
                  },
                  {
                    id: 'f1-b',
                    width: 40,
                    content: { kind: 'signature', source: 'jefeCubierta' },
                  },
                ],
              },
            ],
          },
          {
            kind: 'table',
            id: 'personal',
            rowsPerPage: 20,
            columns: [
              { id: 'nombre', label: 'NOMBRE', source: 'nombre', widthMm: 70 },
              {
                id: 'firma',
                label: 'FIRMA',
                source: 'firma',
                widthMm: 30,
                signature: true,
              },
            ],
          },
        ],
      },
    ],
  } as FormatDefinition

  /** Los datos de arriba, con firma para el jefe y para la primera persona. */
  const CON_URL: FormatData = {
    ...DATA,
    jefeCubierta: { ...DATA.jefeCubierta, signature: 'https://s3/jefe.png' },
    people: [
      { ...DATA.people[0], signature: 'https://s3/uno.png' },
      { ...DATA.people[1] },
      { ...DATA.people[2] },
    ],
  } as FormatData

  async function libroConFirmas(bytes: Map<string, Buffer>) {
    const buffer = await renderer.render(
      builder.build(CON_FIRMA, CON_URL, new Map()),
      bytes
    )
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(buffer as any)
    return book
  }

  it('dibuja la firma del responsable y la de cada persona de la lista', async () => {
    const book = await libroConFirmas(
      new Map([
        ['https://s3/jefe.png', PNG],
        ['https://s3/uno.png', PNG],
      ])
    )
    const sheet = book.getWorksheet('FIRMAS') as ExcelJS.Worksheet
    // La del responsable y la de la primera persona; las otras dos no tienen.
    expect(sheet.getImages()).toHaveLength(2)
  }, 120000)

  it('una firma que no se pudo descargar deja el hueco, sin romper el libro', async () => {
    // Es lo que evita que un fallo de red impida emitir el formato de la
    // jornada. El libro tiene que abrirse igual.
    const book = await libroConFirmas(new Map())
    const sheet = book.getWorksheet('FIRMAS') as ExcelJS.Worksheet
    expect(sheet.getImages()).toHaveLength(0)
    expect(sheet.rowCount).toBeGreaterThan(1)
  }, 120000)

  it('la casilla de firma no escribe la URL sobre el papel', async () => {
    // Sin imagen, escribir el texto resuelto dejaria una direccion de S3
    // impresa en la columna de firmas.
    const book = await libroConFirmas(new Map())
    const sheet = book.getWorksheet('FIRMAS') as ExcelJS.Worksheet
    let text = ''
    sheet.eachRow(row => {
      row.eachCell({ includeEmpty: false }, cell => {
        text += typeof cell.value === 'string' ? cell.value : ''
      })
    })
    expect(text).not.toContain('https://')
  }, 120000)
})

describe('rejilla A4', () => {
  it('convierte milimetros a la unidad de ancho de Excel', () => {
    // 25,4 mm son 96 px, y Excel mide `(px - 5) / 7` caracteres.
    expect(mmToExcelWidth(25.4)).toBeCloseTo((96 - 5) / 7, 1)
  })

  it('nunca devuelve un ancho de cero', () => {
    expect(mmToExcelWidth(0.1)).toBeGreaterThanOrEqual(1)
  })

  it('reparte el ancho disponible en proporcion', () => {
    const fitted = fitColumns([10, 20, 30], 120)
    expect(fitted).toEqual([20, 40, 60])
    expect(fitted.reduce((sum, width) => sum + width, 0)).toBeCloseTo(120)
  })

  it('ocultar una columna reparte su hueco entre las demas', () => {
    // Es lo que evita que editar la definicion desde el maestro deje la tabla
    // corta y descuadrada a la derecha.
    const conTodas = fitColumns([10, 20, 30], 120)
    const sinLaPrimera = fitColumns([20, 30], 120)
    expect(sinLaPrimera.reduce((sum, width) => sum + width, 0)).toBeCloseTo(120)
    expect(sinLaPrimera[0]).toBeGreaterThan(conTodas[1])
  })

  it('tolera una lista de anchos a cero', () => {
    expect(fitColumns([0, 0], 100)).toEqual([50, 50])
  })
})
