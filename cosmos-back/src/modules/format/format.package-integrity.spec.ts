import { unzipSync } from 'fflate'
import { FormatService } from './format.service'
import { FormatDataService } from './format-data.service'
import { FORMAT_TEMPLATES } from './format-templates.config'

/**
 * El libro emitido tiene que abrirse sin que Excel lo repare.
 *
 * Esta prueba nace de un fallo real: al descargar el formato desde
 * /marcaciones, Excel avisaba de "Hemos encontrado un problema con el
 * contenido" y quitaba `xl/calcChain.xml`. La causa era que ese indice viajaba
 * intacto desde la plantilla mientras las hojas se reescribian, y acababa
 * apuntando a celdas que ya no tenian formula (28 de 79 entradas en ETHANOL,
 * 95 de 161 en GRANEL, 166 de 246 en MERCADERIA GENERAL).
 *
 * El problema de fondo es que ese aviso es generico: Excel no dice que parte
 * esta mal hasta que abres el fichero de registro, y una plantilla de 100
 * partes da para muchas maneras de romperse. Por eso aqui no se comprueba el
 * caso concreto sino todo lo que Excel considera motivo de reparacion:
 * referencias a partes que no existen, partes sin tipo declarado, filas o
 * celdas fuera de orden, refs repetidas, formulas rotas y sharedStrings fuera
 * de rango.
 *
 * Se ejercita con tres tamanos de nombrada porque paginar clona filas enteras,
 * que es justo la operacion con mas margen para dejar una hoja mal ordenada.
 */

const WORKER_DATE = '10/09/2025'
const NAMED_ID = 2856

function namedWith(count: number) {
  return {
    staff_transmission_id: NAMED_ID,
    staff_vessel_id: 2884,
    vessel_description: 'CMA CGM VOLTAIRE',
    worker_date: WORKER_DATE,
    shift_description: '07:00 - 15:00',
    pier_description: '2-A',
    listStaffDetail: Array.from({ length: count }, (_, i) => ({
      staff_id: 5000 + i,
      personal_id: String(40000000 + i),
      last_name: `APELLIDO${i + 1}`,
      mother_last_name: `MATERNO${i + 1}`,
      first_name: `NOMBRE${i + 1}`,
      staff_role_type_description: 'ESTIBADOR',
      order_number: i + 1,
    })),
  }
}

function serviceFor(formatType: string, count: number): FormatService {
  const NAMED = namedWith(count)
  const EMPLOYEES = NAMED.listStaffDetail.map((d, i) => ({ _id: { toString: () => `emp-${i}` }, id: d.staff_id }))
  const namedRecord = {
    findOne: async () => ({
      staffTransmissionId: NAMED_ID,
      formatType,
      jefeCubierta: { fullName: 'HIDALGO CASTILLO DARWIN JAVIER', document: '74355639' },
      supervisorOperaciones: { fullName: 'MORAN PERALTA CARLOS', document: '42213311' },
      supervisorSsoma: { fullName: 'POLO TOMOSADA TOMAS', document: '' },
      talkTopics: [{ topic: 'TEMA', summary: 'RESUMEN' }],
      generatedFormats: [],
    }),
    addGeneratedFormat: async () => undefined,
    ensureWorkPermitNumber: async () => 1234,
  } as any
  const data = new FormatDataService(
    { getNameds: async () => ({ listStaff: [NAMED] }) } as any,
    namedRecord,
    {
      getEmployeesByIds: async () => EMPLOYEES,
      findSignaturesByDocuments: async () => new Map(),
    } as any,
    { getEntriesByEmployeeIds: async () => [] } as any,
    { findAllGlobal: async () => [{ _id: { toString: () => 'p1' }, order: 1 }] } as any
  )
  return new FormatService(data, namedRecord, { fromXlsx: async () => Buffer.from('%PDF') } as any)
}

const dec = new TextDecoder('utf-8')
const colNum = (c: string) => [...c].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0)

/** Todo lo que Excel considera motivo de reparacion en un .xlsx. */
function audit(buffer: Buffer): string[] {
  const files = unzipSync(new Uint8Array(buffer))
  const names = new Set(Object.keys(files))
  const problemas: string[] = []

  // 1. Overrides de [Content_Types] que apuntan a partes inexistentes.
  const ct = dec.decode(files['[Content_Types].xml'])
  for (const m of ct.matchAll(/<Override[^>]*PartName="([^"]+)"[^>]*\/>/g)) {
    const part = m[1].replace(/^\//, '')
    if (!names.has(part)) problemas.push(`[Content_Types] apunta a parte inexistente: ${part}`)
  }

  // 2. Partes sin tipo de contenido declarado (ni Override ni Default).
  const defaults = new Set([...ct.matchAll(/<Default[^>]*Extension="([^"]+)"/g)].map(m => m[1].toLowerCase()))
  const overrides = new Set([...ct.matchAll(/<Override[^>]*PartName="([^"]+)"/g)].map(m => m[1].replace(/^\//, '')))
  for (const name of names) {
    if (name === '[Content_Types].xml') continue
    const ext = name.split('.').pop()!.toLowerCase()
    if (!overrides.has(name) && !defaults.has(ext)) problemas.push(`parte sin content-type: ${name}`)
  }

  // 3. Relaciones que apuntan a partes inexistentes.
  for (const name of names) {
    if (!name.endsWith('.rels')) continue
    const base = name.replace(/_rels\/[^/]+$/, '')
    for (const m of dec.decode(files[name]).matchAll(/<Relationship\b[^>]*\/>/g)) {
      const tag = m[0]
      if (/TargetMode="External"/.test(tag)) continue
      const target = /Target="([^"]+)"/.exec(tag)?.[1]
      if (!target || /^https?:/.test(target)) continue
      const resolved = target.startsWith('/')
        ? target.slice(1)
        : (base + target).split('/').reduce<string[]>((acc, seg) => {
            if (seg === '.' || seg === '') return acc
            if (seg === '..') { acc.pop(); return acc }
            acc.push(seg); return acc
          }, []).join('/')
      if (!names.has(resolved)) problemas.push(`${name} -> parte inexistente: ${resolved} (Target="${target}")`)
    }
  }

  // 4. Orden de filas y de celdas dentro de cada hoja. Excel repara si no es
  //    estrictamente ascendente, o si hay refs repetidas.
  for (const name of names) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue
    const xml = dec.decode(files[name])
    // Las filas vacias van autocerradas y no llevan celdas; si no se apartan,
    // el emparejamiento <row>...</row> se traga las filas siguientes.
    const conFilas = xml.replace(/<row\b[^>]*\/>/g, '')
    let prevRow = 0
    for (const rm of conFilas.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = Number(rm[1])
      if (row <= prevRow) problemas.push(`${name}: fila ${row} fuera de orden (anterior ${prevRow})`)
      prevRow = row
      let prevCol = 0
      const vistas = new Set<string>()
      for (const cm of rm[2].matchAll(/<c\b[^>]*\br="([A-Z]+)(\d+)"/g)) {
        if (Number(cm[2]) !== row) problemas.push(`${name}: celda ${cm[1]}${cm[2]} dentro de la fila ${row}`)
        if (vistas.has(cm[1])) problemas.push(`${name}: celda repetida ${cm[1]}${row}`)
        vistas.add(cm[1])
        const col = colNum(cm[1])
        if (col <= prevCol) problemas.push(`${name}: celda ${cm[1]}${row} fuera de orden`)
        prevCol = col
      }
    }
    // 5. Restos de formula rota o de enlace a otro libro.
    if (xml.includes('#REF!')) problemas.push(`${name}: contiene #REF!`)
    for (const fm of xml.matchAll(/<f[^>]*>([\s\S]*?)<\/f>/g)) {
      if (/\[\d+\]/.test(fm[1])) problemas.push(`${name}: formula con enlace externo: ${fm[1].slice(0, 60)}`)
    }
    // 6. Celdas de texto en linea o compartido apuntando fuera de rango.
    const ss = files['xl/sharedStrings.xml']
    if (ss) {
      const total = Number(/count="(\d+)"/.exec(dec.decode(ss).slice(0, 400))?.[1] ?? 0)
      const uniq = Number(/uniqueCount="(\d+)"/.exec(dec.decode(ss).slice(0, 400))?.[1] ?? 0)
      for (const sm of xml.matchAll(/<c\b[^>]*t="s"[^>]*>\s*<v>(\d+)<\/v>/g)) {
        if (uniq && Number(sm[1]) >= uniq) problemas.push(`${name}: sharedString ${sm[1]} fuera de rango (uniqueCount ${uniq}, count ${total})`)
      }
    }
  }

  // 7. calcChain.
  if (names.has('xl/calcChain.xml')) problemas.push('el paquete todavia lleva calcChain.xml')
  if (/calcChain/.test(ct)) problemas.push('[Content_Types] todavia menciona calcChain')
  if (/calcChain/.test(dec.decode(files['xl/_rels/workbook.xml.rels']))) {
    problemas.push('workbook.xml.rels todavia menciona calcChain')
  }

  return problemas
}

describe('el .xlsx emitido se abre sin reparaciones', () => {
  for (const formatType of FORMAT_TEMPLATES.map(t => t.id)) {
    // 3 personas: cabe de sobra. 25: pagina el permiso de trabajo (16 huecos).
    // 90: pagina todos los bloques varias veces.
    for (const count of [3, 25, 90]) {
      it(`${formatType} con ${count} personas`, async () => {
        const { buffer } = await serviceFor(formatType, count).generate(NAMED_ID, WORKER_DATE)
        expect(audit(buffer)).toEqual([])
      }, 180000)
    }
  }
})
