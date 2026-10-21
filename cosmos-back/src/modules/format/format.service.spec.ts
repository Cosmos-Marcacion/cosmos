import * as path from 'path'
import { createHash } from 'crypto'
import { unzipSync } from 'fflate'
import { FormatService } from './format.service'
import { FormatDataService } from './format-data.service'
import { listSheets } from './xlsx-patcher'
import * as fs from 'fs'

/** Huella del contenido del zip, ignorando la fecha de sus entradas. */
function contentDigest(xlsx: Buffer): string {
  const files = unzipSync(new Uint8Array(xlsx))
  const hash = createHash('sha256')
  for (const name of Object.keys(files).sort()) {
    hash.update(name)
    hash.update(Uint8Array.of(0))
    hash.update(files[name])
  }
  return hash.digest('hex')
}

/**
 * Comprueba que el formato emitido lleva los datos donde el cliente los espera:
 * la hoja GLOBAL rellena, el jefe de cubierta encabezando la asistencia, las
 * horas de marcacion en su columna y las formulas rotas de origen neutralizadas.
 */

const decoder = new TextDecoder('utf-8')

/** Formula que enlaza a otro libro, por ejemplo `[1]ASISTENCIA!C50`. */
const EXTERNAL_LINK = /<f[^>]*>[^<]*\[\d+\]/

/** Lee el texto de una celda del XML, sin librerias de hojas de calculo. */
function cellText(buffer: Buffer, sheetFile: string, ref: string): string {
  const files = unzipSync(new Uint8Array(buffer))
  const xml = decoder.decode(files[sheetFile])
  const m = new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(xml)
  if (!m || !m[1]) return ''
  const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(m[1])
  if (inline) return inline[1]
  const num = /<v>([\s\S]*?)<\/v>/.exec(m[1])
  return num ? num[1] : ''
}

function sheetFileOf(buffer: Buffer, name: string): string {
  // El orden de `listSheets` coincide con el del libro; se localiza el indice
  // resolviendo igual que el parcheador.
  const files = unzipSync(new Uint8Array(buffer))
  const wbXml = decoder.decode(files['xl/workbook.xml'])
  const relsXml = decoder.decode(files['xl/_rels/workbook.xml.rels'])
  const rels: Record<string, string> = {}
  for (const m of relsXml.matchAll(
    /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g
  )) {
    rels[m[1]] = m[2]
  }
  for (const m of wbXml.matchAll(
    /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g
  )) {
    if (m[1] === name) {
      const t = rels[m[2]]
      return t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`
    }
  }
  throw new Error(`hoja no encontrada: ${name}`)
}

// --------------------------------------------------------------------------

const NAMED = {
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
  listStaffDetail: [
    {
      staff_id: 4022,
      personal_id: '41169567',
      last_name: 'ESPINOZA',
      mother_last_name: 'RETO',
      first_name: 'HENRY IVAR',
      staff_role_type_description: 'LIQUIDADOR DE NAVE',
      order_number: 1,
    },
    {
      staff_id: 4023,
      personal_id: '72305904',
      last_name: 'OSORIA',
      mother_last_name: 'VALLADARES',
      first_name: 'JAHYRO DIEGO',
      staff_role_type_description: 'WINCHERO',
      order_number: 2,
    },
    {
      staff_id: 4024,
      personal_id: '03493904',
      last_name: 'SANCARRANCO',
      mother_last_name: 'OVALLE',
      first_name: 'JUAN CARLOS',
      staff_role_type_description: 'PORTALONERO',
      order_number: 3,
    },
  ],
}

const EMPLOYEES = [
  { _id: { toString: () => 'emp-1' }, id: 4022 },
  { _id: { toString: () => 'emp-2' }, id: 4023 },
  { _id: { toString: () => 'emp-3' }, id: 4024 },
]

const POINTS = [
  { _id: { toString: () => 'p1' }, order: 1 },
  { _id: { toString: () => 'p8' }, order: 8 },
]

const ENTRIES = [
  {
    employeeId: { toString: () => 'emp-1' },
    pointId: { toString: () => 'p1' },
    namedId: 2856,
    isAbsence: false,
    date: new Date(2025, 8, 10, 7, 12),
  },
  {
    employeeId: { toString: () => 'emp-1' },
    pointId: { toString: () => 'p8' },
    namedId: 2856,
    isAbsence: false,
    date: new Date(2025, 8, 10, 15, 3),
  },
  {
    employeeId: { toString: () => 'emp-2' },
    pointId: { toString: () => 'p1' },
    namedId: 2856,
    isAbsence: false,
    date: new Date(2025, 8, 10, 7, 25),
  },
  // Ausente: no debe aportar hora
  {
    employeeId: { toString: () => 'emp-3' },
    pointId: { toString: () => 'p1' },
    namedId: 2856,
    isAbsence: true,
    date: new Date(2025, 8, 10, 7, 0),
  },
]

const RECORD = {
  staffTransmissionId: 2856,
  formatType: 'GRANEL',
  jefeCubierta: {
    fullName: 'HIDALGO CASTILLO DARWIN JAVIER',
    document: '74355639',
  },
  supervisorOperaciones: {
    fullName: 'MORAN PERALTA CARLOS',
    document: '42213311',
  },
  supervisorSsoma: { fullName: 'POLO TOMOSADA TOMAS', document: '' },
  talkTopics: [
    {
      topic: 'LECTURA DE ATS DE NAVES GRANELERAS',
      summary: 'Aplicar los controles del ATS',
    },
    {
      topic: 'USO DE BLOQUEADORES SOLARES',
      summary: 'Prevencion de radiacion',
    },
  ],
  talkType: 'CAPACITACION',
  talkPlace: 'EMBARCACION',
  talkIsAnnual: true,
  talkStartTime: '07:00',
  talkEndTime: '07:20',
  talkHours: 0.33,
  registerResponsible: {
    fullName: 'ZAPATA RUIZ ANA',
    document: '10203040',
    position: 'SUPERVISOR SSOMA',
  },
  generatedFormats: [],
}

function buildService(
  overrides: { record?: any; workPermitNumber?: number; named?: any } = {}
) {
  const added: any[] = []
  /** Lo que se le entrego al convertidor, para poder compararlo con el Excel. */
  const converted: Buffer[] = []
  const namedRecord = {
    findOne: async () => ('record' in overrides ? overrides.record : RECORD),
    addGeneratedFormat: async (...args: any[]) => {
      added.push(args)
    },
    ensureWorkPermitNumber: async () => overrides.workPermitNumber ?? 1,
  } as any
  const data = new FormatDataService(
    {
      getNameds: async () => ({ listStaff: [overrides.named ?? NAMED] }),
    } as any,
    namedRecord,
    {
      getEmployeesByIds: async () => EMPLOYEES,
      findSignaturesByDocuments: async () => new Map(),
    } as any,
    { getEntriesByEmployeeIds: async () => ENTRIES } as any,
    { findAllGlobal: async () => POINTS } as any
  )
  const service = new FormatService(data, namedRecord, {
    fromXlsx: async (xlsx: Buffer) => {
      converted.push(xlsx)
      return Buffer.from('%PDF-1.7 fingido')
    },
  } as any)
  return { service, added, converted }
}

/** Genera un formato con `count` trabajadores mas el jefe de cubierta. */
async function generateWith(count: number, formatType: string) {
  const many = {
    ...NAMED,
    listStaffDetail: Array.from({ length: count }, (_, i) => ({
      staff_id: 5000 + i,
      personal_id: `1000000${i}`,
      last_name: `AP${i + 1}`,
      mother_last_name: `AM${i + 1}`,
      first_name: `NOMBRE${i + 1}`,
      staff_role_type_description: 'ESTIBADOR',
      order_number: i + 1,
    })),
  }
  const namedRecord = {
    findOne: async () => ({ ...RECORD, formatType }),
    addGeneratedFormat: async () => {},
    ensureWorkPermitNumber: async () => 1,
  } as any
  const data = new FormatDataService(
    { getNameds: async () => ({ listStaff: [many] }) } as any,
    namedRecord,
    {
      getEmployeesByIds: async () => [],
      findSignaturesByDocuments: async () => new Map(),
    } as any,
    { getEntriesByEmployeeIds: async () => [] } as any,
    { findAllGlobal: async () => POINTS } as any
  )
  const service = new FormatService(data, namedRecord, {
    fromXlsx: async (xlsx: Buffer) => xlsx,
  } as any)
  return service.generate(2856, '10/09/2025')
}

describe('FormatService', () => {
  it('la plantilla viaja con el backend', () => {
    const dir = path.join(process.cwd(), 'templates')
    expect(fs.existsSync(path.join(dir, 'FORMATOS GRANEL.xlsx'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'FORMATOS ETHANOL.xlsx'))).toBe(true)
    expect(
      fs.existsSync(path.join(dir, 'FORMATOS MERCADERIA GENERAL.xlsx'))
    ).toBe(true)
  })

  it('expone los cinco tipos con su capacidad de asistencia y su punto de paginacion', () => {
    const { service } = buildService()
    // `capacity` es lo que lista la hoja de asistencia, que es lo que distingue
    // a los formatos. `onePageCapacity` lo marca el bloque mas estrecho
    // (la seccion V del permiso de trabajo, 8 filas x 2 columnas) y no es un
    // tope: por encima se anaden paginas.
    expect(service.listFormatTypes()).toEqual([
      {
        id: 'ETHANOL',
        label: 'Ethanol',
        capacity: 16,
        onePageCapacity: 16,
        attendanceSheet: 'PD03-R97 ASIST.',
      },
      {
        id: 'GRANEL',
        label: 'Granel',
        capacity: 61,
        onePageCapacity: 16,
        attendanceSheet: 'ASISTENCIA',
      },
      {
        id: 'MERCADERIA_GENERAL',
        label: 'Mercadería general',
        capacity: 73,
        onePageCapacity: 16,
        attendanceSheet: 'ASISTENCIA',
      },
      {
        id: 'CONTAINERO',
        label: 'Containero',
        capacity: 73,
        onePageCapacity: 16,
        attendanceSheet: 'ASISTENCIA',
      },
      {
        id: 'BIG_BAG',
        label: 'Big bag',
        capacity: 73,
        onePageCapacity: 16,
        attendanceSheet: 'ASISTENCIA',
      },
    ])
  })

  it('genera un unico libro con todas las hojas del formato', async () => {
    const { service } = buildService()
    const r = await service.generate(2856, '10/09/2025')

    expect(r.formatType).toBe('GRANEL')
    expect(listSheets(r.buffer)).toEqual([
      'GLOBAL',
      'ASISTENCIA',
      'CHARLA',
      'ATS GRANEL',
      'VESSEL INSPECTION',
      'SS01-F167. PTS',
      'SS01-F167. PTS (3C)',
      'INGLÉS',
      'GENERAL',
    ])
    expect(r.fileName).toBe('GRANEL_CMA_CGM_VOLTAIRE_2025-09-10_2884.xlsx')
  })

  it('rellena la hoja GLOBAL con los datos de la nombrada y su ficha', async () => {
    const { service } = buildService()
    const { buffer } = await service.generate(2856, '10/09/2025')
    const g = sheetFileOf(buffer, 'GLOBAL')

    expect(cellText(buffer, g, 'B3')).toBe('CMA CGM VOLTAIRE')
    expect(cellText(buffer, g, 'B5')).toBe('2-A')
    expect(cellText(buffer, g, 'B6')).toBe('1') // jornada 07:00
    expect(cellText(buffer, g, 'B7')).toBe('07:00 HRS.')
    expect(cellText(buffer, g, 'B8')).toBe('15:00 HRS.')
    expect(cellText(buffer, g, 'B17')).toBe('POLO TOMOSADA TOMAS')
    expect(cellText(buffer, g, 'B11')).toBe(
      'LECTURA DE ATS DE NAVES GRANELERAS'
    )
    expect(cellText(buffer, g, 'B14')).toBe('Aplicar los controles del ATS')
    expect(cellText(buffer, g, 'B13')).toBe('') // solo hay dos temas
  })

  it('el N de ATS es el numero de la nombrada, que es staff_vessel_id', async () => {
    // En la respuesta del servicio externo conviven tres identificadores que se
    // parecen lo bastante como para confundirlos:
    //   staff_transmission_id (2856) es la transmision,
    //   staff_vessel_number ("0875-1") llega vacio en una de cada diez nombradas,
    //   staff_vessel_id (2884) es el numero de la nombrada.
    // Las hojas ATS y PTS leen su "N° ATS" de GLOBAL!B18.
    const { service } = buildService()
    const r = await service.generate(2856, '10/09/2025')

    expect(cellText(r.buffer, sheetFileOf(r.buffer, 'GLOBAL'), 'B18')).toBe(
      '2884'
    )
    expect(r.fileName).toBe('GRANEL_CMA_CGM_VOLTAIRE_2025-09-10_2884.xlsx')
  })

  it('el numero no depende de staff_vessel_number, que a veces llega vacio', async () => {
    const sinNumeroDeNave = { ...NAMED, staff_vessel_number: '' }
    const namedRecord = {
      findOne: async () => RECORD,
      addGeneratedFormat: async () => {},
      ensureWorkPermitNumber: async () => 1,
    } as any
    const data = new FormatDataService(
      { getNameds: async () => ({ listStaff: [sinNumeroDeNave] }) } as any,
      namedRecord,
      {
        getEmployeesByIds: async () => EMPLOYEES,
        findSignaturesByDocuments: async () => new Map(),
      } as any,
      { getEntriesByEmployeeIds: async () => ENTRIES } as any,
      { findAllGlobal: async () => POINTS } as any
    )
    const service = new FormatService(data, namedRecord, {
      fromXlsx: async (xlsx: Buffer) => xlsx,
    } as any)

    const r = await service.generate(2856, '10/09/2025')
    expect(cellText(r.buffer, sheetFileOf(r.buffer, 'GLOBAL'), 'B18')).toBe(
      '2884'
    )
  })

  it('empaqueta jefe de cubierta con el ancho fijo que espera la plantilla', async () => {
    const { service } = buildService()
    const { buffer } = await service.generate(2856, '10/09/2025')
    const b10 = cellText(buffer, sheetFileOf(buffer, 'GLOBAL'), 'B10')

    // La plantilla separa con MID(B10,1,25) y MID(B10,52,30)
    expect(b10.slice(0, 25).trim()).toBe('HIDALGO CASTILLO DARWIN J'.trim())
    expect(b10.slice(51)).toBe('74355639')
  })

  it('encabeza la asistencia con el jefe de cubierta y luego el personal en orden', async () => {
    const { service } = buildService()
    const { buffer } = await service.generate(2856, '10/09/2025')
    const a = sheetFileOf(buffer, 'ASISTENCIA')

    expect(cellText(buffer, a, 'B8')).toBe('JEFE DE CUBIERTA')
    expect(cellText(buffer, a, 'C8')).toBe('HIDALGO CASTILLO DARWIN JAVIER')
    expect(cellText(buffer, a, 'E8')).toBe('74355639')

    expect(cellText(buffer, a, 'B9')).toBe('LIQUIDADOR DE NAVE')
    expect(cellText(buffer, a, 'C9')).toBe('ESPINOZA RETO HENRY IVAR')
    expect(cellText(buffer, a, 'E9')).toBe('41169567')

    expect(cellText(buffer, a, 'C10')).toBe('OSORIA VALLADARES JAHYRO DIEGO')
    expect(cellText(buffer, a, 'C11')).toBe('SANCARRANCO OVALLE JUAN CARLOS')
  })

  it('vuelca las marcaciones como hora de ingreso y de salida', async () => {
    const { service } = buildService()
    const { buffer } = await service.generate(2856, '10/09/2025')
    const a = sheetFileOf(buffer, 'ASISTENCIA')

    expect(cellText(buffer, a, 'F9')).toBe('07:12') // ingreso del primer trabajador
    expect(cellText(buffer, a, 'K9')).toBe('15:03') // salida
    expect(cellText(buffer, a, 'F10')).toBe('07:25')
    expect(cellText(buffer, a, 'K10')).toBe('') // sin marcacion de salida
    expect(cellText(buffer, a, 'F11')).toBe('') // ausente: no aporta hora
  })

  it('limpia los huecos sobrantes que la plantilla trae con datos de ejemplo', async () => {
    const { service } = buildService()
    const { buffer } = await service.generate(2856, '10/09/2025')
    const a = sheetFileOf(buffer, 'ASISTENCIA')

    // Solo hay 4 filas (jefe + 3); la quinta debe quedar vacia
    expect(cellText(buffer, a, 'C12')).toBe('')
    expect(cellText(buffer, a, 'E12')).toBe('')
    expect(cellText(buffer, a, 'B12')).toBe('')
  })

  it('neutraliza las formulas rotas que trae la plantilla', async () => {
    const { service } = buildService()
    const { buffer } = await service.generate(2856, '10/09/2025')
    const files = unzipSync(new Uint8Array(buffer))
    for (const name of Object.keys(files)) {
      if (name.startsWith('xl/worksheets/')) {
        expect(decoder.decode(files[name])).not.toContain('#REF!')
      }
    }
  })

  it('el personal de ethanol ya no se trunca a 7: la plantilla tiene 16 huecos', async () => {
    const r = await generateWith(12, 'ETHANOL')

    expect(r.truncated).toBe(false)
    expect(r.omitted).toEqual([])
    expect(r.staffCount).toBe(13) // jefe de cubierta + 12 trabajadores
    expect(r.pages).toBe(1)

    const a = sheetFileOf(r.buffer, 'PD03-R97 ASIST.')
    // Los 9 huecos del segundo bloque (16..24) tambien se usan.
    expect(cellText(r.buffer, a, 'C16')).toBe('AP7 AM7 NOMBRE7')
    expect(cellText(r.buffer, a, 'C20')).toBe('AP11 AM11 NOMBRE11')
  })

  it('anade paginas cuando el personal no cabe en la plantilla', async () => {
    const r = await generateWith(49, 'GRANEL')

    expect(r.truncated).toBe(false)
    expect(r.staffCount).toBe(50) // jefe + 49
    // La asistencia tiene 61 huecos y entra de una; el permiso de trabajo
    // solo 16, asi que ese bloque se reparte en cuatro paginas.
    expect(r.pages).toBe(4)
  })

  it('lleva a todo el personal a la charla, al ATS, al permiso y a ingles', async () => {
    const r = await generateWith(20, 'GRANEL')

    const charla = sheetFileOf(r.buffer, 'CHARLA')
    expect(cellText(r.buffer, charla, 'B27')).toBe(
      'HIDALGO CASTILLO DARWIN JAVIER'
    )
    expect(cellText(r.buffer, charla, 'B46')).toBe('AP19 AM19 NOMBRE19')

    // El ATS numera hacia abajo por columna: 1..20 a la izquierda, 21..40 a la derecha.
    const ats = sheetFileOf(r.buffer, 'ATS GRANEL')
    expect(cellText(r.buffer, ats, 'B23')).toBe(
      'HIDALGO CASTILLO DARWIN JAVIER'
    )
    expect(cellText(r.buffer, ats, 'B42')).toBe('AP19 AM19 NOMBRE19')
    expect(cellText(r.buffer, ats, 'N23')).toBe('AP20 AM20 NOMBRE20')

    const ingles = sheetFileOf(r.buffer, 'INGLÉS')
    expect(cellText(r.buffer, ingles, 'C10')).toBe(
      'HIDALGO CASTILLO DARWIN JAVIER'
    )
    expect(cellText(r.buffer, ingles, 'C29')).toBe('AP19 AM19 NOMBRE19')
  })

  /**
   * La hoja de charla no tiene campos para el tipo, el lugar ni el horario: son
   * textos preimpresos con las opciones dentro, para marcarlos a mano. La
   * plataforma escribe encima sin alterar su longitud, para que la hoja salga
   * igual que la que aprobo el cliente.
   */
  describe('cabecera de la hoja de charla', () => {
    it('marca el tipo de capacitacion, el programa anual y el lugar', async () => {
      const { service } = buildService()
      const { buffer } = await service.generate(2856, '10/09/2025')
      const charla = sheetFileOf(buffer, 'CHARLA')

      const tipos = cellText(buffer, charla, 'A8')
      expect(tipos).toContain('X Capacitación')
      expect(tipos).not.toContain('X Inducción')
      expect(tipos).not.toContain('X Entrenamiento')
      // Las opciones no se mueven de sitio: solo se pisan espacios.
      expect(tipos).toHaveLength(
        '        Inducción            Capacitación                Entrenamiento                        Simulacro de Emergencia                            TOOLBOX                                    Otros:______º'
          .length
      )

      expect(cellText(buffer, charla, 'A16')).toContain('X SI')
      expect(cellText(buffer, charla, 'A18')).toContain('X Embarcación')
      expect(cellText(buffer, charla, 'E18')).not.toContain('X')
    })

    it('escribe el horario y las horas de la charla', async () => {
      const { service } = buildService()
      const { buffer } = await service.generate(2856, '10/09/2025')
      const charla = sheetFileOf(buffer, 'CHARLA')

      expect(cellText(buffer, charla, 'C20')).toBe('07:00')
      expect(cellText(buffer, charla, 'F20')).toBe('07:20')
      expect(cellText(buffer, charla, 'H20')).toContain('0.33')
    })

    it('firma el responsable del registro con su cargo y la fecha de la jornada', async () => {
      const { service } = buildService()
      const { buffer } = await service.generate(2856, '10/09/2025')
      const charla = sheetFileOf(buffer, 'CHARLA')

      const nombre = cellText(buffer, charla, 'A24')
      expect(nombre).toContain('ZAPATA RUIZ ANA')
      expect(nombre).toContain('10/09/2025')
      expect(cellText(buffer, charla, 'A25')).toContain('SUPERVISOR SSOMA')
    })

    it('solo pisa el capacitador cuando se designa un entrenador', async () => {
      const sinEntrenador = await buildService().service.generate(
        2856,
        '10/09/2025'
      )
      const charla = sheetFileOf(sinEntrenador.buffer, 'CHARLA')
      // Sin entrenador la hoja sigue imprimiendo al supervisor de operaciones
      // por formula, como venia haciendo la plantilla.
      expect(cellText(sinEntrenador.buffer, charla, 'A22')).toBe('')

      const conEntrenador = await buildService({
        record: {
          ...RECORD,
          trainer: { fullName: 'RIVERA SOTO LUIS', document: '55667788' },
        },
      }).service.generate(2856, '10/09/2025')
      expect(cellText(conEntrenador.buffer, charla, 'A22')).toContain(
        'RIVERA SOTO LUIS'
      )
    })

    it('deja la hoja sin marcar cuando la charla no se ha registrado', async () => {
      const { service } = buildService({
        record: {
          ...RECORD,
          talkType: '',
          talkPlace: '',
          talkStartTime: '',
          talkEndTime: '',
          talkHours: 0,
        },
      })
      const { buffer } = await service.generate(2856, '10/09/2025')
      const charla = sheetFileOf(buffer, 'CHARLA')

      expect(cellText(buffer, charla, 'A8')).not.toContain('X Capacitación')
      expect(cellText(buffer, charla, 'A16')).not.toContain('X SI')
      expect(cellText(buffer, charla, 'C20')).toBe('')
    })
  })

  it('no deja enlaces a libros externos, que Excel muestra congelados', async () => {
    const r = await generateWith(3, 'MERCADERIA_GENERAL')
    const files = unzipSync(new Uint8Array(r.buffer))
    for (const name of Object.keys(files)) {
      if (name.startsWith('xl/worksheets/')) {
        expect(decoder.decode(files[name])).not.toMatch(EXTERNAL_LINK)
      }
    }
  })

  it('deja constancia del formato emitido en la ficha de la nombrada', async () => {
    const { service, added } = buildService()
    await service.generate(2856, '10/09/2025', 'operador@cosmos.com.pe')

    expect(added).toHaveLength(1)
    const [id, dateIso, entry] = added[0]
    expect(id).toBe(2856)
    expect(dateIso).toBe('2025-09-10')
    expect(entry.formatType).toBe('GRANEL')
    expect(entry.generatedBy).toBe('operador@cosmos.com.pe')
    expect(entry.staffCount).toBe(4)
    expect(entry.truncated).toBe(false)
  })

  it('sin ficha, el formato lo decide el tipo de nave de Cosmos', async () => {
    const { service } = buildService({
      record: null,
      named: {
        ...NAMED,
        code_type_vessel: 'GR',
        description_type_vessel: 'GRANEL',
      },
    })
    const r = await service.generate(2856, '10/09/2025')
    expect(r.formatType).toBe('GRANEL')
    // Sin jefe de cubierta la asistencia empieza directamente por el personal
    expect(cellText(r.buffer, sheetFileOf(r.buffer, 'ASISTENCIA'), 'C8')).toBe(
      'ESPINOZA RETO HENRY IVAR'
    )
  })

  it('rechaza un tipo de nave sin formato sin gastar un correlativo', async () => {
    let asked = 0
    const { service } = buildService({
      named: {
        ...NAMED,
        code_type_vessel: 'VA',
        description_type_vessel: 'VARILLAS',
      },
    })
    const data = (service as any).formatDataService
    const original = data.namedRecordService.ensureWorkPermitNumber
    data.namedRecordService.ensureWorkPermitNumber = async () => {
      asked++
      return original()
    }
    await expect(service.generate(2856, '10/09/2025')).rejects.toThrow(
      'VA (VARILLAS)'
    )
    expect(asked).toBe(0)
  })

  it('sin tipo de nave ni formato elegido antes no emite nada', async () => {
    const { service } = buildService({ record: null })
    await expect(service.generate(2856, '10/09/2025')).rejects.toThrow(
      'no trae tipo de nave'
    )
  })

  it('imprime el correlativo del permiso de trabajo, no el codigo de nombrada', async () => {
    // La plantilla traia "N° PERMISO" por formula desde GLOBAL!B18, es decir,
    // repetia el N° ATS. Ahora lleva su propia serie, que arranca en 1.
    const { service } = buildService({ workPermitNumber: 7 })
    const r = await service.generate(2856, '10/09/2025')

    expect(r.workPermitNumber).toBe(7)
    for (const sheet of ['SS01-F167. PTS', 'SS01-F167. PTS (3C)']) {
      expect(cellText(r.buffer, sheetFileOf(r.buffer, sheet), 'T6')).toBe(
        '0007'
      )
    }
    // El N° ATS de la misma cabecera sigue siendo el de la nombrada.
    expect(cellText(r.buffer, sheetFileOf(r.buffer, 'GLOBAL'), 'B18')).toBe(
      '2884'
    )
  })

  it('anota el permiso emitido en el historial de la nombrada', async () => {
    const { service, added } = buildService({ workPermitNumber: 12 })
    await service.generate(2856, '10/09/2025')
    expect(added[0][2].workPermitNumber).toBe(12)
  })

  it('todas las paginas del permiso llevan el mismo numero', async () => {
    // El permiso es uno solo aunque el personal no quepa en una hoja.
    const { buffer, pages } = await generateWith(40, 'GRANEL')
    expect(pages).toBeGreaterThan(1)

    const file = sheetFileOf(buffer, 'SS01-F167. PTS')
    const xml = decoder.decode(unzipSync(new Uint8Array(buffer))[file])
    const numbers = [
      ...xml.matchAll(
        /<c r="T(\d+)"[^>]*t="inlineStr"><is><t[^>]*>(\d{4})<\/t>/g
      ),
    ].map(m => m[2])

    expect(numbers.length).toBe(pages)
    expect(new Set(numbers)).toEqual(new Set(['0001']))
  })

  it('no deja resultados de formula guardados de la plantilla', async () => {
    // La plantilla trae 130 celdas con el valor de la ultima vez que el cliente
    // la grabo, y de ellas cuelgan todas las cabeceras impresas. Excel las
    // recalcula al abrir; un convertidor a PDF no tiene por que. Sin resultado
    // guardado, cualquier motor esta obligado a calcularlas.
    const { service } = buildService()
    const { buffer } = await service.generate(2856, '10/09/2025')
    const files = unzipSync(new Uint8Array(buffer))

    for (const [name, raw] of Object.entries(files)) {
      if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue
      const xml = decoder.decode(raw as Uint8Array)
      const withCache = [
        ...xml.matchAll(/<c\b[^>]*>\s*<f\b[^>]*(?:\/>|>[\s\S]*?<\/f>)\s*<v>/g),
      ]
      expect({ name, cached: withCache.length }).toEqual({ name, cached: 0 })
    }
  })

  it('la cabecera sigue colgando de GLOBAL por formula', async () => {
    // Vaciar el resultado guardado no debe llevarse por delante la formula.
    const { service } = buildService()
    const { buffer } = await service.generate(2856, '10/09/2025')
    const xml = decoder.decode(
      unzipSync(new Uint8Array(buffer))[sheetFileOf(buffer, 'SS01-F167. PTS')]
    )

    expect(/<c r="Y6"[^>]*><f>\+?GLOBAL!B18<\/f><\/c>/.test(xml)).toBe(true)
  })

  it('suelta el ajuste a una pagina solo en la hoja que pagina', async () => {
    // ASISTENCIA de granel se ajusta a una pagina de alto. Mientras cabe en sus
    // 83 filas eso es lo que el cliente quiere, la lista entera en una hoja al
    // 31%; en cuanto se anaden paginas, ese mismo ajuste comprime 166 filas en
    // una sola pagina y la segunda mitad del personal sale ilegible.
    const setupDe = (buffer: Buffer, sheet: string) => {
      const xml = decoder.decode(
        unzipSync(new Uint8Array(buffer))[sheetFileOf(buffer, sheet)]
      )
      return {
        fitToPage:
          /<pageSetUpPr[^>]*\sfitToPage="([^"]+)"/.exec(xml)?.[1] ?? null,
        fitToHeight:
          /<pageSetup\b[^>]*\sfitToHeight="(\d+)"/.exec(xml)?.[1] ?? null,
      }
    }

    // 10 personas: ninguna hoja pagina, la plantilla se respeta tal cual.
    const corta = await generateWith(10, 'GRANEL')
    expect(corta.pages).toBe(1)
    expect(setupDe(corta.buffer, 'ASISTENCIA').fitToPage).toBe('1')
    expect(setupDe(corta.buffer, 'CHARLA').fitToPage).toBe('1')

    // 40: solo pagina el permiso de trabajo, que tiene 16 huecos. ASISTENCIA
    // (60) y CHARLA (51) siguen cabiendo y no se tocan.
    const media = await generateWith(40, 'GRANEL')
    expect(media.pages).toBeGreaterThan(1)
    expect(setupDe(media.buffer, 'ASISTENCIA').fitToPage).toBe('1')

    // 70: ya no caben ni la asistencia ni la charla.
    const larga = await generateWith(70, 'GRANEL')
    // ASISTENCIA es de ancho automatico: al soltar tambien el alto no quedaria
    // nada gobernando la escala, asi que se apaga el ajuste y manda su `scale`.
    expect(setupDe(larga.buffer, 'ASISTENCIA').fitToPage).toBe('0')
    // CHARLA es de una pagina de ancho: conserva el ajuste y libera el alto.
    expect(setupDe(larga.buffer, 'CHARLA')).toEqual({
      fitToPage: '1',
      fitToHeight: '0',
    })
  }, 120000)

  it('el PDF sale del mismo libro que la descarga en Excel', async () => {
    // Esta es la garantia de que ambas descargas son identicas: no hay dos
    // maquetaciones, hay una y dos formas de sacarla. Si algun dia alguien
    // compone el PDF por otro camino, este test cae.
    const excel = await buildService().service.generate(2856, '10/09/2025')

    const { service, converted } = buildService()
    const pdf = await service.generate(
      2856,
      '10/09/2025',
      'operador@cosmos.com.pe',
      'pdf'
    )

    expect(converted).toHaveLength(1)
    // Se comparan los contenidos del zip, no los bytes. `zipSync` sella cada
    // entrada con `Date.now()` y la fecha de un zip tiene resolucion de dos
    // segundos, asi que dos generaciones identicas dan ficheros distintos si
    // caen a los dos lados de ese salto. Comparando bytes, este test fallaba
    // solo cuando la maquina iba cargada.
    expect(contentDigest(converted[0])).toBe(contentDigest(excel.buffer))
    expect(pdf.buffer.toString()).toBe('%PDF-1.7 fingido')
  })

  it('el PDF se anuncia como PDF y con el mismo nombre base', async () => {
    const { service, added } = buildService()
    const r = await service.generate(
      2856,
      '10/09/2025',
      'operador@cosmos.com.pe',
      'pdf'
    )

    expect(r.output).toBe('pdf')
    expect(r.contentType).toBe('application/pdf')
    expect(r.fileName).toBe('GRANEL_CMA_CGM_VOLTAIRE_2025-09-10_2884.pdf')
    // El resto de datos no cambia por entregar en otro formato.
    expect(r.staffCount).toBe(4)
    expect(r.workPermitNumber).toBe(1)
    // El historial distingue lo que se entrego.
    expect(added[0][2].output).toBe('pdf')
    expect(added[0][2].fileName).toMatch(/\.pdf$/)
  })

  it('el Excel sigue siendo lo que se entrega por defecto', async () => {
    const { service, added, converted } = buildService()
    const r = await service.generate(2856, '10/09/2025')

    expect(r.output).toBe('xlsx')
    expect(r.fileName).toMatch(/\.xlsx$/)
    expect(added[0][2].output).toBe('xlsx')
    // Sin PDF de por medio no se arranca el convertidor.
    expect(converted).toHaveLength(0)
  })

  it('avisa si la nombrada no existe en esa fecha', async () => {
    const { service } = buildService()
    await expect(service.generate(9999, '10/09/2025')).rejects.toThrow(
      /No se encontro la nombrada 9999/
    )
  })
})
