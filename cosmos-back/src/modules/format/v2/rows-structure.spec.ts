import * as path from 'path'
import { SEED_DEFINITIONS } from './definitions/seed'
import { readWorkbook, Workbook, columnToNumber } from '../../../../tools/format-inspector/xlsx-read'
import { FORMAT_TEMPLATES } from '../format-templates.config'

/**
 * La estructura de secciones, filas y columnas.
 *
 * El modelo anterior reproducia la rejilla de Excel con coordenadas: cada
 * casilla llevaba `fila`, `columna` y `colSpan`, y sobre esa rejilla ya
 * construida se colocaba el contenido. Este no: un documento es una lista de
 * secciones, cada seccion una lista de filas y cada fila un reparto en columnas
 * por porcentaje. No hay coordenadas.
 *
 * Lo que hay que demostrar cambia con el modelo. Ya no es "cada celda esta en
 * su fila y su columna" sino:
 *
 * 1. Que las columnas de cada fila repartan el ancho entero.
 * 2. Que el **orden** de las filas sea el de la hoja original.
 * 3. Que las secciones agrupen por los titulos que la hoja ya trae.
 * 4. Que no queden filas vacias ni secciones sin filas.
 */

const TEMPLATES_DIR = path.join(__dirname, '..', '..', '..', '..', 'templates')

const workbooks = new Map<string, Workbook>()
function workbookOf(file: string): Workbook {
  if (!workbooks.has(file)) {
    workbooks.set(file, readWorkbook(path.join(TEMPLATES_DIR, file)))
  }
  return workbooks.get(file) as Workbook
}

/** Quita acentos, colapsa espacios y pasa a minusculas. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Los textos de la hoja, en orden de lectura: fila y luego columna. */
function sheetTextsInOrder(file: string, sheetName: string): string[] {
  const sheet = workbookOf(file).sheets.find(s => s.name === sheetName)
  return (sheet?.cells ?? [])
    .filter(cell => String(cell.value ?? '').trim())
    .slice()
    .sort((a, b) => a.row - b.row || columnToNumber(a.column) - columnToNumber(b.column))
    .map(cell => normalize(String(cell.value)))
}

/** Los textos del documento generado, en el orden en que se pintan. */
function documentTextsInOrder(document: any): string[] {
  const texts: string[] = []
  for (const section of document.sections) {
    if (section.kind !== 'rows') {
      continue
    }
    if (section.title) {
      texts.push(normalize(section.title))
    }
    for (const row of section.rows) {
      for (const cell of row.cells) {
        const content = cell.content
        const text = content.kind === 'text'
          ? content.text
          : content.kind === 'image'
            ? content.text ?? ''
            : ''
        if (text.trim()) {
          texts.push(normalize(text))
        }
      }
    }
  }
  return texts
}

describe('estructura de filas y columnas', () => {
  for (const template of FORMAT_TEMPLATES) {
    describe(template.id, () => {
      const definition = SEED_DEFINITIONS[template.id]

      for (const document of definition.documents) {
        const sections = document.sections.filter((s: any) => s.kind === 'rows') as any[]
        if (sections.length === 0) {
          continue
        }

        describe(document.name, () => {
          it('las columnas de cada fila reparten el ancho entero', () => {
            // Una fila cuyas columnas no suman 100 sale corta o se desborda, y
            // eso no se ve hasta imprimir.
            const malas: any[] = []
            for (const section of sections) {
              for (const row of section.rows) {
                const total = row.cells.reduce(
                  (sum: number, cell: any) => sum + cell.width, 0
                )
                if (Math.abs(total - 100) > 1) {
                  malas.push({ fila: row.id, suma: Math.round(total) })
                }
              }
            }
            expect(malas).toEqual([])
          })

          it('ninguna columna tiene ancho cero o negativo', () => {
            const malas: string[] = []
            for (const section of sections) {
              for (const row of section.rows) {
                for (const cell of row.cells) {
                  if (!(cell.width > 0)) {
                    malas.push(cell.id)
                  }
                }
              }
            }
            expect(malas).toEqual([])
          })

          it('no hay filas sin columnas', () => {
            const vacias: string[] = []
            for (const section of sections) {
              for (const row of section.rows) {
                if (row.cells.length === 0) {
                  vacias.push(row.id)
                }
              }
            }
            expect(vacias).toEqual([])
          })

          it('no hay secciones sin filas', () => {
            expect(sections.filter(section => section.rows.length === 0)).toEqual([])
          })

          it('cada fila y cada columna tienen id propio', () => {
            const rowIds = new Set<string>()
            const repetidos: string[] = []
            for (const section of sections) {
              for (const row of section.rows) {
                if (rowIds.has(row.id)) {
                  repetidos.push(row.id)
                }
                rowIds.add(row.id)

                const cellIds = new Set<string>()
                for (const cell of row.cells) {
                  if (cellIds.has(cell.id)) {
                    repetidos.push(cell.id)
                  }
                  cellIds.add(cell.id)
                }
              }
            }
            expect(repetidos).toEqual([])
          })

          it('conserva el orden de lectura de la hoja', () => {
            // Es lo que hace que el documento se entienda: un ATS con las
            // secciones desordenadas lleva la misma informacion y no sirve.
            //
            // Se comparan solo los textos que aparecen **una vez** en la hoja.
            // Los repetidos ("SI", "NO", "Firma") salen decenas de veces y no
            // dicen nada del orden: mapearlos a su primera aparicion hace que
            // cada repeticion parezca un salto hacia atras, y esa medida daba
            // un 17% de desorden donde no lo hay.
            const originales = sheetTextsInOrder(template.file, document.name)

            const veces = new Map<string, number>()
            for (const text of originales) {
              veces.set(text, (veces.get(text) ?? 0) + 1)
            }
            const posicion = new Map<string, number>()
            originales.forEach((text, index) => {
              if (veces.get(text) === 1) {
                posicion.set(text, index)
              }
            })

            const vistos = new Set<string>()
            const comunes: number[] = []
            for (const text of documentTextsInOrder(document)) {
              if (posicion.has(text) && !vistos.has(text)) {
                vistos.add(text)
                comunes.push(posicion.get(text) as number)
              }
            }

            const saltos: string[] = []
            for (let i = 1; i < comunes.length; i++) {
              if (comunes[i] < comunes[i - 1]) {
                saltos.push(`${comunes[i - 1]} -> ${comunes[i]}`)
              }
            }
            expect({ hoja: document.name, saltos }).toEqual({ hoja: document.name, saltos: [] })
          })

          it('no arrastra una columna muerta al final de cada fila', () => {
            // El permiso de trabajo tiene combinaciones que llegan a la columna
            // 37 aunque su area de impresion acabe en la 27. Esas once columnas
            // de mas miden 192 mm, la mitad del documento, y salian como una
            // casilla vacia del 33 % al final de **cada** fila: el contenido
            // quedaba comprimido en dos tercios de la hoja.
            //
            // Que un ancho concreto se repita al final de casi todas las filas
            // es la firma de ese fallo. Alguna fila acaba en blanco de verdad
            // —donde se escribe a mano—, pero no la mayoria con la misma medida.
            const colas = new Map<number, number>()
            let filas = 0
            for (const section of sections) {
              for (const row of section.rows) {
                filas += 1
                const ultima = row.cells[row.cells.length - 1]
                if (ultima?.content.kind === 'blank') {
                  const ancho = Math.round(ultima.width)
                  colas.set(ancho, (colas.get(ancho) ?? 0) + 1)
                }
              }
            }
            const repetida = Math.max(0, ...colas.values())
            expect({
              hoja: document.name,
              proporcion: repetida / filas < 0.5,
            }).toEqual({ hoja: document.name, proporcion: true })
          })

          it('las secciones toman su titulo de la propia hoja', () => {
            // El ATS trae `SECCIÓN I: DESCRIPCIÓN DEL TRABAJO` y demas escritos
            // en una fila a todo lo ancho; de ahi salen las secciones.
            const conTitulo = sections.filter(section => section.title)
            expect({
              hoja: document.name,
              titulos: conTitulo.length > 0 || sections.length === 1,
            }).toEqual({ hoja: document.name, titulos: true })
          })
        })
      }
    })
  }

  it('el permiso de trabajo se parte en sus ocho secciones numeradas', () => {
    // Es su indice: la hoja las numera de la I a la VIII. Antes las ocho
    // quedaban dentro de un mismo bloque sin nombre, porque el titulo comparte
    // fila con su aclaracion —`(llenado por el Ejecutante)`— y la regla del
    // titulo suelto no lo veia.
    for (const template of FORMAT_TEMPLATES) {
      const pts = SEED_DEFINITIONS[template.id].documents.find(d => d.id === 'pts') as any
      const titulos = pts.sections
        .filter((section: any) => section.kind === 'rows' && section.title)
        .map((section: any) => section.title as string)

      const numeradas = titulos
        .filter(title => /^SECCI[OÓ]N\s+[IVX]+[ :.]/i.test(title))
        .map(title => (title.match(/^SECCI[OÓ]N\s+([IVX]+)/i) as RegExpMatchArray)[1].toUpperCase())

      expect({ plantilla: template.id, secciones: numeradas }).toEqual({
        plantilla: template.id,
        secciones: ['I', 'II', 'III', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'],
      })
    }
  })

  it('un membrete repetido no abre seccion', () => {
    // `ESTE PERMISO QUEDA CANCELADO AL PRESENTARSE UNA EMERGENCIA` y
    // `VALIDO PARA: EL DIA...` salen una vez por hoja impresa: son el membrete
    // del documento, no un titulo. Cumplian la regla del titulo suelto y
    // partian el permiso por donde no tocaba.
    for (const template of FORMAT_TEMPLATES) {
      const pts = SEED_DEFINITIONS[template.id].documents.find(d => d.id === 'pts') as any
      const titulos = pts.sections
        .filter((section: any) => section.title)
        .map((section: any) => section.title as string)

      const membretes = titulos.filter(title =>
        /ESTE PERMISO QUEDA CANCELADO|VALIDO PARA/i.test(title)
      )
      expect({ plantilla: template.id, membretes }).toEqual({
        plantilla: template.id,
        membretes: [],
      })
    }
  })

  it('un rotulo se derrama sobre el hueco de al lado, como en Excel', () => {
    // `Empresa Ejecutante:` esta en una columna de 15 mm con las dos de su
    // derecha vacias, y en la hoja se lee entero porque Excel lo derrama. Sin
    // eso salia en una casilla del 4 % y se leia una letra por linea.
    const pts = SEED_DEFINITIONS['ETHANOL'].documents.find(d => d.id === 'pts') as any
    const celda = pts.sections
      .filter((section: any) => section.kind === 'rows')
      .flatMap((section: any) => section.rows)
      .flatMap((row: any) => row.cells)
      .find((cell: any) =>
        cell.content.kind === 'text' && cell.content.text.startsWith('Empresa Ejecutante')
      )

    expect(celda).toBeDefined()
    expect(celda.width).toBeGreaterThan(10)
  })

  it('el ATS se parte en las secciones que la hoja declara', () => {
    const ats = SEED_DEFINITIONS['GRANEL'].documents.find(d => d.id === 'ats') as any
    const titulos = ats.sections
      .filter((section: any) => section.kind === 'rows' && section.title)
      .map((section: any) => section.title)

    // Los titulos que la hoja declara como tales: una fila cuyo unico
    // contenido es un texto corto en mayusculas y destacado.
    expect(titulos.some((title: string) => /SECCI[OÓ]N I:/i.test(title))).toBe(true)
    expect(titulos.some((title: string) => /SECCI[OÓ]N III:/i.test(title))).toBe(true)
    expect(titulos.some((title: string) => /SECCI[OÓ]N VIII:/i.test(title))).toBe(true)
  })
})
