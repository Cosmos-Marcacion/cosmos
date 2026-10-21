import * as fs from 'fs'
import * as path from 'path'
import { unzipSync } from 'fflate'
import { patchWorkbook, listSheets, WorkbookEdits } from './xlsx-patcher'

/**
 * El valor de estas pruebas es demostrar que la plantilla sale intacta: si el
 * generador pierde una imagen, una celda combinada o un ancho de columna, el
 * formato impreso deja de ser valido para el cliente.
 */

const TEMPLATES = path.join(process.cwd(), 'templates')
const GRANEL = path.join(TEMPLATES, 'FORMATOS GRANEL.xlsx')
const ETHANOL = path.join(TEMPLATES, 'FORMATOS ETHANOL.xlsx')

/** Metricas estructurales leidas del propio zip y del XML, sin librerias. */
function fingerprint(buffer: Buffer) {
  const files = unzipSync(new Uint8Array(buffer))
  const decoder = new TextDecoder('utf-8')
  const names = Object.keys(files)

  const media = names.filter(n => n.startsWith('xl/media/'))
  const mediaBytes = media.reduce((acc, n) => acc + files[n].length, 0)

  let merges = 0
  let formulas = 0
  let colWidths = 0
  let drawings = 0
  for (const n of names) {
    if (n.startsWith('xl/worksheets/sheet') && n.endsWith('.xml')) {
      const xml = decoder.decode(files[n])
      merges += (xml.match(/<mergeCell /g) ?? []).length
      formulas += (xml.match(/<f[ >]/g) ?? []).length
      colWidths += (xml.match(/<col [^>]*width="/g) ?? []).length
      drawings += (xml.match(/<drawing /g) ?? []).length
    }
  }
  return { partes: names.length, media: media.length, mediaBytes, merges, formulas, colWidths, drawings }
}

function readCell(buffer: Buffer, sheetFile: string, ref: string): string | null {
  const files = unzipSync(new Uint8Array(buffer))
  const xml = new TextDecoder('utf-8').decode(files[sheetFile])
  const m = new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(xml)
  return m ? (m[1] ?? '') : null
}

describe('XlsxPatcher', () => {
  const original = fs.readFileSync(GRANEL)

  it('lee los nombres de hoja de la plantilla', () => {
    expect(listSheets(original)).toEqual([
      'GLOBAL', 'ASISTENCIA', 'CHARLA', 'ATS GRANEL', 'VESSEL INSPECTION',
      'SS01-F167. PTS', 'SS01-F167. PTS (3C)', 'INGLÉS', 'GENERAL',
    ])
  })

  it('conserva intacta toda la estructura de la plantilla', () => {
    const edits: WorkbookEdits = {
      GLOBAL: { cells: { B3: 'MN PRUEBA', B5: 'MUELLE 2-A', B18: '0875-1' } },
      ASISTENCIA: { cells: { C9: 'APELLIDO NOMBRE', E9: '99887766' } },
    }
    const salida = patchWorkbook(original, edits)

    const antes = fingerprint(original)
    const despues = fingerprint(salida)

    // Una parte menos: `xl/calcChain.xml` se descarta a proposito. Es la cache
    // de orden de recalculo de la plantilla y quedaria apuntando a celdas que
    // ya no tienen formula, que es lo que hacia que Excel reparase el fichero
    // al abrirlo. Ver `dropCalcChain`.
    expect(despues.partes).toBe(antes.partes - 1)
    expect(despues.media).toBe(antes.media)
    expect(despues.mediaBytes).toBe(antes.mediaBytes)
    expect(despues.merges).toBe(antes.merges)
    // Las formulas rotas de origen (#REF! y enlaces a un libro que ya no
    // existe) se vacian al guardar, asi que el recuento baja a proposito.
    expect(despues.formulas).toBeLessThan(antes.formulas)
    expect(despues.formulas).toBeGreaterThan(antes.formulas - 20)
    expect(despues.colWidths).toBe(antes.colWidths)
    expect(despues.drawings).toBe(antes.drawings)
  })

  it('escribe cadenas, numeros y fechas con el tipo correcto', () => {
    const salida = patchWorkbook(original, {
      GLOBAL: { cells: { B3: 'MN COSMOS', B6: 2, B4: new Date(2026, 7, 22) } },
    })
    const b3 = readCell(salida, 'xl/worksheets/sheet1.xml', 'B3')
    const b6 = readCell(salida, 'xl/worksheets/sheet1.xml', 'B6')
    const b4 = readCell(salida, 'xl/worksheets/sheet1.xml', 'B4')

    expect(b3).toContain('<t xml:space="preserve">MN COSMOS</t>')
    expect(b6).toContain('<v>2</v>')
    // 22/08/2026 en el sistema de fechas de 1900
    expect(b4).toContain('<v>46256</v>')
  })

  it('escapa los caracteres especiales de XML', () => {
    const salida = patchWorkbook(original, {
      GLOBAL: { cells: { B3: 'GRUAS & CARGA <PAITA>' } },
    })
    const b3 = readCell(salida, 'xl/worksheets/sheet1.xml', 'B3')
    expect(b3).toContain('GRUAS &amp; CARGA &lt;PAITA&gt;')
    expect(b3).not.toContain('<PAITA>')
  })

  it('conserva el estilo de la celda al reescribirla', () => {
    const estiloOriginal = /<c r="B3"([^>]*)/.exec(
      new TextDecoder().decode(unzipSync(new Uint8Array(original))['xl/worksheets/sheet1.xml'])
    )?.[1]
    const salida = patchWorkbook(original, { GLOBAL: { cells: { B3: 'OTRO' } } })
    const xml = new TextDecoder().decode(unzipSync(new Uint8Array(salida))['xl/worksheets/sheet1.xml'])
    const estiloNuevo = /<c r="B3"([^>]*)/.exec(xml)?.[1]

    const s = (a?: string) => /\ss="(\d+)"/.exec(a ?? '')?.[1]
    expect(s(estiloNuevo)).toBe(s(estiloOriginal))
  })

  it('inserta una celda que no existia respetando el orden de columnas', () => {
    // F9 (HORA INGRESO) esta vacia en la plantilla
    const salida = patchWorkbook(original, { ASISTENCIA: { cells: { F9: '07:15' } } })
    const files = unzipSync(new Uint8Array(salida))
    const xml = new TextDecoder().decode(files['xl/worksheets/sheet2.xml'])
    const fila = /<row[^>]*\sr="9"[^>]*>([\s\S]*?)<\/row>/.exec(xml)?.[1] ?? ''
    const columnas = [...fila.matchAll(/<c r="([A-Z]+)9"/g)].map(m => m[1])

    expect(columnas).toContain('F')
    const orden = columnas.map(c => c.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0))
    expect(orden).toEqual([...orden].sort((a, b) => a - b))
  })

  it('neutraliza una formula rota dejando la celda vacia y con su estilo', () => {
    const salida = patchWorkbook(original, { CHARLA: { formulas: { B28: null, H28: null } } })
    const files = unzipSync(new Uint8Array(salida))
    const xml = new TextDecoder().decode(files['xl/worksheets/sheet3.xml'])

    expect(xml).not.toContain('ASISTENCIA!#REF!')
    expect(/<c r="B28"[^>]*\/>/.test(xml)).toBe(true)
  })

  it('descarta calcChain y las dos referencias que lo nombran', () => {
    // La plantilla si lo trae; si dejara de traerlo, este test se volveria
    // vacio sin avisar.
    expect(unzipSync(new Uint8Array(original))['xl/calcChain.xml']).toBeDefined()

    const salida = patchWorkbook(original, { GLOBAL: { cells: { B3: 'X' } } })
    const files = unzipSync(new Uint8Array(salida))
    const dec = new TextDecoder()

    expect(files['xl/calcChain.xml']).toBeUndefined()
    // Una referencia a una parte que no existe dispara la misma reparacion que
    // se intenta evitar, asi que hay que quitar las dos.
    expect(dec.decode(files['[Content_Types].xml'])).not.toContain('calcChain')
    expect(dec.decode(files['xl/_rels/workbook.xml.rels'])).not.toContain('calcChain')
  })

  it('marca el libro para que Excel recalcule al abrirlo', () => {
    const salida = patchWorkbook(original, { GLOBAL: { cells: { B3: 'X' } } })
    const files = unzipSync(new Uint8Array(salida))
    const wbXml = new TextDecoder().decode(files['xl/workbook.xml'])
    expect(wbXml).toContain('fullCalcOnLoad="1"')
  })

  it('avisa si se pide una hoja que la plantilla no tiene', () => {
    expect(() => patchWorkbook(original, { NOEXISTE: { cells: { A1: 'x' } } }))
      .toThrow(/no tiene una hoja llamada "NOEXISTE"/)
  })

  it('funciona igual sobre la plantilla de ethanol, con otros nombres de hoja', () => {
    const ethanol = fs.readFileSync(ETHANOL)
    expect(listSheets(ethanol)).toContain('PD03-R97 ASIST.')

    const salida = patchWorkbook(ethanol, {
      'PD03-R97 ASIST.': { cells: { C9: 'TRABAJADOR ETHANOL' } },
    })
    const antes = fingerprint(ethanol)
    const despues = fingerprint(salida)
    // Una parte menos, la de `calcChain`. Ver el test de estructura de arriba.
    expect(despues.partes).toBe(antes.partes - 1)
    expect(despues.media).toBe(antes.media)
    expect(despues.mediaBytes).toBe(antes.mediaBytes)
    expect(despues.merges).toBe(antes.merges)
    expect(despues.colWidths).toBe(antes.colWidths)
    expect(despues.drawings).toBe(antes.drawings)
    expect(despues.formulas).toBeLessThan(antes.formulas)
  })
})
