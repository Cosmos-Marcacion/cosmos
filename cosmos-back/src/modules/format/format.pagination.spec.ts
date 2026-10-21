import { unzipSync } from 'fflate'
import { FormatService } from './format.service'
import { FormatDataService } from './format-data.service'
import { FORMAT_TEMPLATES, blockCapacity } from './format-templates.config'
import * as path from 'path'
import { readWorkbook } from '../../../tools/format-inspector/xlsx-read'

/**
 * La nombrada mas grande del historico tiene 49 personas y las plantillas traen
 * entre 16 y 73 huecos repartidos de forma distinta en cada hoja: la asistencia
 * admite 60, el permiso de trabajo 16 y el ATS 40. Cuando no cabe, el formato
 * anade paginas.
 *
 * Aqui se comprueba la invariante que importa, que no es en que fila cae cada
 * persona sino que **todas aparecen una sola vez en todas las hojas** y que el
 * libro resultante sigue siendo valido para Excel.
 */

const decoder = new TextDecoder('utf-8')

const JEFE = 'HIDALGO CASTILLO DARWIN JAVIER'

function buildService(count: number, formatType: string) {
  const named = {
    staff_transmission_id: 2856,
    staff_vessel_id: 2884,
    vessel_description: 'CMA CGM VOLTAIRE',
    voyage_number: '0DVMSN1MA',
    location_id: 'PEPAI - TPE',
    worker_date: '10/09/2025',
    shift_description: '07:00 - 15:00',
    pier_description: '2-A',
    berth_description: '',
    staff_vessel_number: '0875-1',
    listStaffDetail: Array.from({ length: count }, (_, i) => ({
      staff_id: 5000 + i,
      personal_id: String(10000000 + i),
      last_name: `AP${i + 1}`,
      mother_last_name: `AM${i + 1}`,
      first_name: `NOMBRE${i + 1}`,
      staff_role_type_description: 'ESTIBADOR',
      order_number: i + 1,
    })),
  }

  const namedRecord = {
    findOne: async () => ({
      staffTransmissionId: 2856,
      formatType,
      jefeCubierta: { fullName: JEFE, document: '74355639' },
      supervisorOperaciones: { fullName: 'MORAN PERALTA CARLOS', document: '42213311' },
      supervisorSsoma: { fullName: 'POLO TOMOSADA TOMAS', document: '' },
      talkTopics: [],
      generatedFormats: [],
    }),
    addGeneratedFormat: async () => { },
    ensureWorkPermitNumber: async () => 1,
  } as any
  const data = new FormatDataService(
    { getNameds: async () => ({ listStaff: [named] }) } as any,
    namedRecord,
    { getEmployeesByIds: async () => [], findSignaturesByDocuments: async () => new Map() } as any,
    { getEntriesByEmployeeIds: async () => [] } as any,
    { findAllGlobal: async () => [{ _id: { toString: () => 'p1' }, order: 1 }] } as any
  )
  return new FormatService(data, namedRecord, { fromXlsx: async (xlsx: Buffer) => xlsx } as any)
}

/** Hojas del libro, con su XML ya decodificado. */
function sheetsOf(buffer: Buffer): { name: string; xml: string }[] {
  const files = unzipSync(new Uint8Array(buffer))
  const wb = decoder.decode(files['xl/workbook.xml'])
  const relsXml = decoder.decode(files['xl/_rels/workbook.xml.rels'])
  const rels: Record<string, string> = {}
  for (const m of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
    rels[m[1]] = m[2]
  }
  const out: { name: string; xml: string }[] = []
  for (const m of wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)) {
    const target = rels[m[2]]
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
    out.push({ name: m[1].replace(/&amp;/g, '&'), xml: decoder.decode(files[path]) })
  }
  return out
}

/**
 * Textos escritos en una hoja. El patron exige un espacio tras la `t` porque
 * `<t[^>]*>` tambien casaria con `<tabColor .../>` y se comeria media hoja.
 */
function textsOf(xml: string): string[] {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => m[1])
}

const ROW_RE = /<row[^>]*\sr="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g
const columnNumber = (col: string) =>
  [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)

/** Lo que Excel considera ilegible: filas o columnas desordenadas, merges descuadrados. */
function structuralProblems(buffer: Buffer): string[] {
  const problems: string[] = []

  for (const { name, xml } of sheetsOf(buffer)) {
    const rows: number[] = []
    for (const m of xml.matchAll(ROW_RE)) {
      rows.push(Number(m[1]))
    }

    if (new Set(rows).size !== rows.length) {
      problems.push(`${name}: filas duplicadas`)
    }
    for (let i = 1; i < rows.length; i++) {
      if (rows[i] <= rows[i - 1]) {
        problems.push(`${name}: filas fuera de orden en ${rows[i - 1]} -> ${rows[i]}`)
        break
      }
    }

    for (const rowMatch of xml.matchAll(ROW_RE)) {
      const row = Number(rowMatch[1])
      let previous = 0
      let broken = false
      for (const cell of (rowMatch[2] ?? '').matchAll(/<c r="([A-Z]+)(\d+)"/g)) {
        if (Number(cell[2]) !== row) {
          problems.push(`${name}: celda ${cell[1]}${cell[2]} dentro de la fila ${row}`)
          broken = true
          break
        }
        const column = columnNumber(cell[1])
        if (column <= previous) {
          problems.push(`${name}: columnas fuera de orden en la fila ${row}`)
          broken = true
          break
        }
        previous = column
      }
      if (broken) break
    }

    const declared = Number(/<mergeCells[^>]*count="(\d+)"/.exec(xml)?.[1] ?? -1)
    const merges = [...xml.matchAll(/<mergeCell ref="[A-Z]+\d+:[A-Z]+\d+"\/>/g)]
    if (declared >= 0 && declared !== merges.length) {
      problems.push(`${name}: mergeCells count=${declared} pero hay ${merges.length}`)
    }
    if (new Set(merges.map(m => m[0])).size !== merges.length) {
      problems.push(`${name}: combinaciones repetidas`)
    }

    const dimension = /<dimension ref="[A-Z]+\d+:[A-Z]+(\d+)"\/>/.exec(xml)
    if (dimension && Number(dimension[1]) < Math.max(0, ...rows)) {
      problems.push(`${name}: la dimension no llega a la ultima fila`)
    }
  }

  return problems
}

/** Ultima fila del area de impresion de cada hoja. */
function printAreas(buffer: Buffer): Record<string, number> {
  const files = unzipSync(new Uint8Array(buffer))
  const wb = decoder.decode(files['xl/workbook.xml'])
  const out: Record<string, number> = {}
  for (const m of wb.matchAll(/<definedName name="_xlnm\.Print_Area"[^>]*>([^<]*)<\/definedName>/g)) {
    const ref = m[1]
    const sheet = ref.split('!')[0].replace(/^'|'$/g, '').replace(/''/g, "'")
    out[sheet] = Number(/\$(\d+)\s*$/.exec(ref)?.[1] ?? 0)
  }
  return out
}

// --------------------------------------------------------------------------

describe('Formato: capacidad y paginacion', () => {
  it('los huecos declarados coinciden con lo que admite cada hoja', () => {
    // Si alguien cambia un .xlsx sin actualizar la configuracion, estos numeros
    // dejan de cuadrar y el fallo sale aqui en vez de en una descarga truncada.
    const capacities = Object.fromEntries(
      FORMAT_TEMPLATES.map(t => [t.id, Object.fromEntries(t.blocks.map(b => [b.id, blockCapacity(b)]))])
    )

    expect(capacities['ETHANOL']).toEqual({
      asistencia: 16, charla: 51, 'ats:ATS ETHANOL': 40, 'pt:SS01-F167. PTS': 16, ingles: 34,
    })
    expect(capacities['GRANEL']['asistencia']).toBe(61)
    expect(capacities['MERCADERIA_GENERAL']['asistencia']).toBe(73)
    expect(capacities['CONTAINERO']['asistencia']).toBe(73)
    expect(capacities['BIG_BAG']['asistencia']).toBe(73)
  })

  /**
   * La lista de asistencia llegaba a usar la cabecera impresa de la segunda
   * pagina (`Fecha: / Version: / Codigo:`) y una fila oculta: la persona 37 de
   * mercaderia no se veia y la 38 escribia encima de la cabecera.
   *
   * Containero trae ademas filas ocultas por el cliente dentro de la lista (la
   * 20 y la 30-38). Se conservan para que las tres hojas de 73 plazas sigan
   * siendo la misma; el motor v2, que es el que se usa, reimprime la tabla y no
   * depende de que filas esten ocultas.
   */
  describe('la lista de asistencia no pisa cabeceras ni cae en filas ocultas', () => {
    const CLIENT_HIDDEN: Record<string, number[]> = {
      CONTAINERO: [20, 30, 31, 32, 33, 34, 35, 36, 37, 38],
    }
    for (const template of FORMAT_TEMPLATES) {
      it(template.id, () => {
        const block = template.blocks.find(b => b.id === 'asistencia')!
        const sheet = readWorkbook(
          path.join(process.cwd(), 'templates', template.file)
        ).sheets.find(s => s.name === block.sheet)!
        const headers = block.rows.filter(row =>
          sheet.cells.some(
            cell =>
              cell.row === row &&
              cell.type === 's' &&
              /Fecha:|Versi[oó]n:|C[oó]digo:/i.test(String(cell.value))
          )
        )
        const hidden = block.rows.filter(
          row =>
            sheet.rows.find(r => r.row === row)?.hidden &&
            !(CLIENT_HIDDEN[template.id] ?? []).includes(row)
        )
        expect({ headers, hidden }).toEqual({ headers: [], hidden: [] })
      })
    }
  })

  it.each([
    ['ETHANOL', 13],
    ['ETHANOL', 59],
    ['GRANEL', 49],
    ['MERCADERIA_GENERAL', 120],
    ['GRANEL', 200],
  ])('%s con %i trabajadores: todos aparecen en todas las hojas', async (formatType, count) => {
    const service = buildService(count as number, formatType as string)
    const result = await service.generate(2856, '10/09/2025')

    expect(result.truncated).toBe(false)
    expect(result.omitted).toEqual([])
    expect(result.staffCount).toBe((count as number) + 1)

    const expected = [JEFE, ...Array.from({ length: count as number }, (_, i) => `AP${i + 1} AM${i + 1} NOMBRE${i + 1}`)]

    for (const { name, xml } of sheetsOf(result.buffer)) {
      const texts = textsOf(xml)
      const found = expected.filter(person => texts.includes(person))
      // `GLOBAL` solo lleva al jefe de cubierta; las demas hojas no listan personal.
      if (found.length <= 1) {
        continue
      }
      expect({ hoja: name, personas: found.length }).toEqual({ hoja: name, personas: expected.length })
      for (const person of expected) {
        expect(texts.filter(t => t === person)).toHaveLength(1)
      }
    }
  }, 60000)

  it('el libro con paginas anadidas sigue siendo valido para Excel', async () => {
    const service = buildService(120, 'MERCADERIA_GENERAL')
    const { buffer } = await service.generate(2856, '10/09/2025')
    expect(structuralProblems(buffer)).toEqual([])
  }, 60000)

  it('la plantilla de partida ya es estructuralmente valida', async () => {
    // Referencia: si la comprobacion anterior fallara, esta dice si el defecto
    // lo introducimos nosotros o venia en el .xlsx.
    const service = buildService(3, 'GRANEL')
    const { buffer } = await service.generate(2856, '10/09/2025')
    expect(structuralProblems(buffer)).toEqual([])
  })

  it('extiende el area de impresion hasta la ultima persona', async () => {
    // La plantilla de granel imprimia hasta la fila 32 con la lista llegando a
    // la 83: la persona 23 se guardaba en el archivo pero no salia impresa.
    const service = buildService(49, 'GRANEL')
    const { buffer } = await service.generate(2856, '10/09/2025')
    const areas = printAreas(buffer)

    expect(areas['ASISTENCIA']).toBeGreaterThan(32)
    // Cuatro paginas de permiso de trabajo, de 122 filas cada una.
    expect(areas['SS01-F167. PTS']).toBe(489)
  }, 60000)

  it('no imprime paginas de mas cuando la nombrada es pequena', async () => {
    const service = buildService(3, 'GRANEL')
    const { buffer } = await service.generate(2856, '10/09/2025')
    const areas = printAreas(buffer)

    // Cuatro personas caben en la primera pagina de cada hoja.
    expect(areas['SS01-F167. PTS']).toBe(122)
    expect(areas['CHARLA']).toBe(78)
  })

  it('las paginas anadidas llevan sus imagenes con identificadores propios', async () => {
    // Clonar un anclaje conservando el `id` de su forma es lo que hacia que
    // Excel avisara de "contenido ilegible" y reparara el libro; al repararlo
    // se llevaba por delante los dibujos y las hojas quedaban en gris.
    const service = buildService(26, 'ETHANOL')
    const { buffer } = await service.generate(2856, '10/09/2025')
    const files = unzipSync(new Uint8Array(buffer))

    let clonadas = 0
    for (const name of Object.keys(files)) {
      if (!/^xl\/drawings\/drawing\d+\.xml$/.test(name)) {
        continue
      }
      const xml = decoder.decode(files[name])
      const ids = [...xml.matchAll(/<xdr:cNvPr[^>]*\sid="(\d+)"/g)].map(m => m[1])
      expect({ dibujo: name, formas: ids.length, distintos: new Set(ids).size })
        .toEqual({ dibujo: name, formas: ids.length, distintos: ids.length })
      clonadas += ids.length
    }
    // Si no se clonara ninguna imagen la comprobacion anterior seria vacia.
    expect(clonadas).toBeGreaterThan(0)
  }, 60000)

  it('cada pagina anadida estrena sus grupos de formula compartida', async () => {
    // Una formula compartida tiene una unica celda ancla (la que lleva `ref`).
    // Clonar la pagina tal cual dejaba ocho anclas con el mismo `si` en el
    // permiso de trabajo de mercaderia, y Excel daba el libro por corrupto.
    const service = buildService(120, 'MERCADERIA_GENERAL')
    const { buffer } = await service.generate(2856, '10/09/2025')

    let comprobadas = 0
    for (const { name, xml } of sheetsOf(buffer)) {
      const anchors = new Map<string, number>()
      for (const m of xml.matchAll(/<f\b[^>]*>/g)) {
        const si = /\ssi="(\d+)"/.exec(m[0])?.[1]
        if (si && /\sref="/.test(m[0])) {
          anchors.set(si, (anchors.get(si) ?? 0) + 1)
        }
      }
      for (const [si, count] of anchors) {
        expect({ hoja: name, grupo: si, anclas: count }).toEqual({ hoja: name, grupo: si, anclas: 1 })
        comprobadas++
      }
    }
    expect(comprobadas).toBeGreaterThan(0)
  }, 60000)

  it('informa de las paginas que ocupa el formato', async () => {
    const pequena = await buildService(10, 'GRANEL').generate(2856, '10/09/2025')
    expect(pequena.pages).toBe(1)

    // 50 personas en un permiso de trabajo de 16 huecos son cuatro paginas.
    const grande = await buildService(49, 'GRANEL').generate(2856, '10/09/2025')
    expect(grande.pages).toBe(4)
  }, 60000)
})
