import { resolveVesselType } from '../vessel-type'
import * as path from 'path'
import { unzipSync } from 'fflate'
import * as fs from 'fs'
import { DocumentBuilder, markText } from './document.builder'
import { INGLES_DOCUMENT } from './definitions/ingles.definition'
import { FormatData } from '../format-data.service'
import { BlockCell, FormatDefinition, ResolvedSection } from './document-model'

/**
 * El motor v2 genera el documento en vez de rellenar la plantilla del cliente.
 * Eso lo hace mucho mas flexible y le anade un riesgo que el motor actual no
 * tiene: **perder un rotulo sin que nadie se entere**. Un formato al que le
 * falta una linea no da error, sale bonito y esta mal.
 *
 * Por eso la prueba central de este motor no comprueba como queda, sino que no
 * falta nada. Se leen todos los textos de la hoja original del `.xlsx` y se
 * exige que el documento generado los cubra todos.
 *
 * Cuando el cliente apruebe quitar alguno, se anota en `RETIRADOS` con su
 * motivo. Lo que no puede pasar es que desaparezca por descuido.
 */

const TEMPLATE = path.join(process.cwd(), 'templates', 'FORMATOS GRANEL.xlsx')
const SHEET = 'INGLÉS'

const decoder = new TextDecoder()

/** Textos escritos a mano en una hoja, sin los que calcula una formula. */
function labelsOf(file: string, sheetName: string): string[] {
  const zip = unzipSync(new Uint8Array(fs.readFileSync(file))) as Record<
    string,
    Uint8Array
  >
  const text = (part: string) => decoder.decode(zip[part])

  const shared = [
    ...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g),
  ].map(m =>
    [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map(t => t[1])
      .join('')
  )

  const workbook = text('xl/workbook.xml')
  const relsXml = text('xl/_rels/workbook.xml.rels')
  const rels: Record<string, string> = {}
  for (const m of relsXml.matchAll(/Id="([^"]*)"[^>]*Target="([^"]*)"/g)) {
    rels[m[1]] = m[2].replace(/^\/?xl\//, '')
  }
  const sheet = [
    ...workbook.matchAll(
      /<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"[^>]*\/>/g
    ),
  ].find(m => m[1] === sheetName)
  if (!sheet) {
    throw new Error(`La plantilla no tiene la hoja ${sheetName}`)
  }

  const xml = text('xl/' + rels[sheet[2]])
  const labels: string[] = []
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const body = m[2] ?? ''
    // Un texto calculado no es un rotulo: lo pone la hoja desde GLOBAL.
    if (/<f[\s>]/.test(body)) {
      continue
    }
    if (!/t="s"/.test(m[1])) {
      continue
    }
    const index = /<v>(\d+)<\/v>/.exec(body)
    const value = index ? shared[Number(index[1])] : undefined
    if (value && value.trim()) {
      labels.push(value.trim())
    }
  }
  return [...new Set(labels)]
}

/**
 * Rotulos de la hoja original que el documento generado no lleva, con su
 * motivo. Vacio no es un objetivo: es el estado actual.
 */
const RETIRADOS: Record<string, string> = {}

/** Todo el texto que sale del documento generado. */
function textsOf(sections: ResolvedSection[]): string[] {
  const out: string[] = []
  for (const section of sections) {
    switch (section.kind) {
      case 'header':
        out.push(section.title)
        if (section.documentCode)
          out.push(`Código: ${section.documentCode}`, section.documentCode)
        if (section.documentVersion)
          out.push(
            `Versión: ${section.documentVersion}`,
            section.documentVersion
          )
        if (section.documentDate)
          out.push(`Fecha: ${section.documentDate}`, section.documentDate)
        if (section.pages !== null) out.push(`Página: 1 de ${section.pages}`)
        out.push(...section.fields.flatMap(f => [f.label, f.value]))
        break
      case 'fields':
        if (section.title) out.push(section.title)
        out.push(...section.fields.flatMap(f => [f.label, f.value]))
        break
      case 'checklist':
        if (section.title) out.push(section.title)
        out.push(...section.items.map(i => i.label))
        break
      case 'table':
        if (section.title) out.push(section.title)
        out.push(...section.columns.map(c => c.label))
        out.push(...section.rows.flat())
        break
      case 'signatures':
        if (section.title) out.push(section.title)
        out.push(...section.slots.flatMap(s => [s.label, s.name]))
        break
    }
  }
  return out.map(t => String(t).trim()).filter(Boolean)
}

const DATA: FormatData = {
  staffTransmissionId: 2856,
  workerDate: '10/09/2025',
  workerDateIso: '2025-09-10',
  workerDateValue: new Date(2025, 8, 10),
  formatType: 'GRANEL',
  vesselType: resolveVesselType('GR', 'GRANEL'),
  workPermitNumber: 12,
  vesselDescription: 'CMA CGM VOLTAIRE',
  pierDescription: '2-A',
  shiftDescription: '15:00 - 23:00',
  namedNumber: '2884',
  supervisorOperaciones: {
    fullName: 'MORAN PERALTA CARLOS',
    document: '42213311',
  },
  jefeCubierta: {
    fullName: 'HIDALGO CASTILLO DARWIN JAVIER',
    document: '74355639',
  },
  supervisorSsoma: 'POLO TOMOSADA TOMAS',
  jefeCubiertaVsi: 'HIDALGO CASTILLO DARWIN JAVIER',
  ssomaVsi: 'POLO TOMOSADA TOMAS',
  talkTopics: [],
  talk: {
    type: '',
    place: '',
    isAnnual: false,
    startTime: '',
    endTime: '',
    hours: 0,
    trainer: {
      fullName: 'MORAN PERALTA CARLOS',
      document: '42213311',
      position: '',
    },
    registerResponsible: { fullName: '', document: '', position: '' },
  },
  people: [
    {
      cargo: 'JEFE DE CUBIERTA',
      nombres: 'HIDALGO CASTILLO DARWIN JAVIER',
      documento: '74355639',
      horaIngreso: '',
      horaSalida: '',
    },
    {
      cargo: 'ESTIBADOR',
      nombres: 'ESPINOZA RETO HENRY IVAR',
      documento: '41169567',
      horaIngreso: '07:12',
      horaSalida: '15:03',
    },
    {
      cargo: 'WINCHERO',
      nombres: 'OSORIA VALLADARES JAHYRO DIEGO',
      documento: '72305904',
      horaIngreso: '07:25',
      horaSalida: '',
    },
  ],
}

const definition: FormatDefinition = {
  formatType: 'GRANEL',
  label: 'Granel',
  version: 1,
  documents: [INGLES_DOCUMENT],
}

describe('DocumentBuilder', () => {
  const builder = new DocumentBuilder()
  const built = builder.build(definition, DATA)
  const document = built.documents[0]

  it('no pierde ningun rotulo de la hoja original', () => {
    const original = labelsOf(TEMPLATE, SHEET).filter(
      label => !(label in RETIRADOS)
    )
    const generated = textsOf(document.sections)
    const haystack = generated.join('\n').toUpperCase()

    const missing = original.filter(
      label => !haystack.includes(label.toUpperCase())
    )
    expect(missing).toEqual([])
  })

  it('marca el turno que corresponde y solo ese', () => {
    const shifts = document.sections.find(s => s.id === 'turnos')
    if (shifts?.kind !== 'checklist') {
      throw new Error('falta la seccion de turnos')
    }
    expect(shifts.items.map(i => i.checked)).toEqual([false, true, false])
  })

  it('pone los dos supervisores por delante de la lista de personal', () => {
    const table = document.sections.find(s => s.id === 'personal')
    if (table?.kind !== 'table') {
      throw new Error('falta la tabla de personal')
    }
    expect(table.rows[0]).toEqual([
      '1',
      'OPERATIONS SUPERVISOR',
      'MORAN PERALTA CARLOS',
      '42213311',
    ])
    expect(table.rows[1]).toEqual([
      '2',
      'SAFETY SUPERVISOR',
      'POLO TOMOSADA TOMAS',
      '',
    ])
    // El cargo de las filas del personal es el preimpreso de la hoja, no el de
    // la nombrada: es una lista para la tripulacion del buque.
    expect(table.rows[2]).toEqual([
      '3',
      'FOREMAN',
      'HIDALGO CASTILLO DARWIN JAVIER',
      '74355639',
    ])
    expect(table.rows[3]).toEqual([
      '4',
      'STEVEDORE',
      'ESPINOZA RETO HENRY IVAR',
      '41169567',
    ])
  })

  it('numera de forma continua, sin los huecos de la hoja original', () => {
    const table = document.sections.find(s => s.id === 'personal')
    if (table?.kind !== 'table') {
      throw new Error('falta la tabla de personal')
    }
    // La hoja original salta del 33 al 35 y deja dos filas sin numerar.
    const numbers = table.rows.map(row => Number(row[0]))
    expect(numbers).toEqual(numbers.map((_, i) => i + 1))
    expect(table.rows).toHaveLength(36)
  })

  it('rellena hasta el minimo con filas en blanco pero numeradas', () => {
    const table = document.sections.find(s => s.id === 'personal')
    if (table?.kind !== 'table') {
      throw new Error('falta la tabla de personal')
    }
    // El hueco vacio conserva su numero y su cargo preimpreso, igual que en la
    // hoja original: asi se puede dar de alta a alguien a mano.
    const last = table.rows[table.rows.length - 1]
    expect(last).toEqual(['36', 'STEVEDORE', '', ''])
  })

  it('la fecha sale formateada, no como numero de serie de Excel', () => {
    const general = document.sections.find(s => s.id === 'informacion-general')
    if (general?.kind !== 'fields') {
      throw new Error('falta la seccion de informacion general')
    }
    expect(general.fields.find(f => f.id === 'date')?.value).toBe('10/09/2025')
  })

  it('una seccion oculta no llega al documento', () => {
    const conOculta: FormatDefinition = {
      ...definition,
      documents: [
        {
          ...INGLES_DOCUMENT,
          sections: INGLES_DOCUMENT.sections.map(s =>
            s.id === 'turnos' ? { ...s, visible: false } : s
          ),
        },
      ],
    }
    const result = builder.build(conOculta, DATA)
    expect(
      result.documents[0].sections.find(s => s.id === 'turnos')
    ).toBeUndefined()
  })

  it('paginacion declarada en el modelo, no decidida por cada renderizador', () => {
    const muchos: FormatData = {
      ...DATA,
      people: Array.from({ length: 80 }, (_, i) => ({
        cargo: 'ESTIBADOR',
        nombres: `PERSONA ${i + 1}`,
        documento: String(10000000 + i),
        horaIngreso: '',
        horaSalida: '',
      })),
    }
    const result = builder.build(definition, muchos)
    const table = result.documents[0].sections.find(s => s.id === 'personal')
    if (table?.kind !== 'table') {
      throw new Error('falta la tabla de personal')
    }
    // 80 personas mas los dos supervisores, de 36 en 36.
    expect(table.rows).toHaveLength(82)
    expect(table.pages).toBe(3)
  })

  // --- firmas registradas ----------------------------------------------------
  //
  // La hoja deja la casilla de firma en blanco para firmarla a mano. Cuando la
  // persona ya registro su firma en la app, ahi va la suya. Lo que no puede
  // pasar es que aparezca la firma de otro, ni que una firma que falta rompa
  // la emision del formato.

  /** Una definicion de una sola fila con una casilla de firma. */
  function conFirma(source: string): FormatDefinition {
    return {
      formatType: 'GRANEL',
      label: 'Granel',
      version: 1,
      documents: [
        {
          id: 'prueba',
          name: 'PRUEBA',
          orientation: 'portrait',
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
                      width: 50,
                      content: { kind: 'text', text: 'FIRMA' },
                    },
                    {
                      id: 'f1-b',
                      width: 50,
                      content: { kind: 'signature', source: source as any },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } as FormatDefinition
  }

  /** La casilla de firma de un documento de una sola fila. */
  function celdaDeFirma(data: FormatData, source = 'jefeCubierta') {
    const section = builder.build(conFirma(source), data).documents[0]
      .sections[0]
    if (section.kind !== 'rows') {
      throw new Error('falta la seccion de filas')
    }
    return section.rows[0].cells[1]
  }

  it('la casilla de firma imprime la firma del responsable que le toca', () => {
    const celda = celdaDeFirma({
      ...DATA,
      jefeCubierta: { ...DATA.jefeCubierta, signature: 'https://s3/jefe.png' },
      supervisorOperaciones: {
        ...DATA.supervisorOperaciones,
        signature: 'https://s3/supervisor.png',
      },
    })
    expect(celda.kind).toBe('signature')
    expect(celda.signatureUrl).toBe('https://s3/jefe.png')
  })

  it('no confunde la firma de un responsable con la del otro', () => {
    // Es el fallo que mas caro sale: un documento firmado por quien no era.
    const data = {
      ...DATA,
      jefeCubierta: { ...DATA.jefeCubierta, signature: 'https://s3/jefe.png' },
      supervisorOperaciones: {
        ...DATA.supervisorOperaciones,
        signature: 'https://s3/supervisor.png',
      },
    }
    expect(celdaDeFirma(data, 'supervisorOperaciones').signatureUrl).toBe(
      'https://s3/supervisor.png'
    )
  })

  it('sin firma registrada la casilla queda vacia, no rota', () => {
    expect(celdaDeFirma(DATA).signatureUrl).toBe('')
  })

  it('un origen que no es una persona no inventa una firma', () => {
    expect(celdaDeFirma(DATA, 'nave').signatureUrl).toBe('')
  })

  it('la columna marcada de la tabla lleva la firma de cada persona', () => {
    const data: FormatData = {
      ...DATA,
      people: [
        { ...DATA.people[0], signature: 'https://s3/uno.png' },
        { ...DATA.people[1] },
        { ...DATA.people[2], signature: 'https://s3/tres.png' },
      ],
    }
    const definition: FormatDefinition = {
      formatType: 'GRANEL',
      label: 'Granel',
      version: 1,
      documents: [
        {
          id: 'prueba',
          name: 'PRUEBA',
          orientation: 'portrait',
          sections: [
            {
              kind: 'table',
              id: 'personal',
              rowsPerPage: 20,
              columns: [
                {
                  id: 'nombre',
                  label: 'NOMBRE',
                  source: 'nombre',
                  widthMm: 70,
                },
                // La de refrigerio usa `firma` como hueco en blanco y **no** esta
                // marcada: es una hora que se escribe a mano, no una firma.
                {
                  id: 'refrigerio',
                  label: 'REFRIGERIO',
                  source: 'firma',
                  widthMm: 20,
                },
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

    const section = builder.build(definition, data).documents[0].sections[0]
    if (section.kind !== 'table') {
      throw new Error('falta la tabla')
    }
    expect(section.signatures.map(row => row[2])).toEqual([
      'https://s3/uno.png',
      null,
      'https://s3/tres.png',
    ])
    // La columna de refrigerio se queda en blanco aunque la persona tenga firma.
    expect(section.signatures.map(row => row[1])).toEqual([null, null, null])
  })
  // --- casillas marcadas desde el maestro --------------------------------------

  /** Una fila con las celdas dadas, resuelta. */
  function filaResuelta(cells: BlockCell[]) {
    const section = builder.build(
      {
        formatType: 'GRANEL',
        label: 'Granel',
        version: 1,
        documents: [
          {
            id: 'prueba',
            name: 'PRUEBA',
            orientation: 'portrait',
            sections: [{ kind: 'rows', id: 's1', rows: [{ id: 'f1', cells }] }],
          },
        ],
      } as FormatDefinition,
      DATA
    ).documents[0].sections[0]
    if (section.kind !== 'rows') {
      throw new Error('falta la seccion de filas')
    }
    return section.rows[0].cells
  }

  it('un texto marcado imprime la X sin perder el rotulo', () => {
    const [si, no] = filaResuelta([
      { id: 'a', width: 50, content: { kind: 'text', text: 'SI', marked: true } },
      { id: 'b', width: 50, content: { kind: 'text', text: 'NO' } },
    ])
    expect(si).toMatchObject({ text: 'X SI', checked: true })
    expect(no).toMatchObject({ text: 'NO', checked: false })
  })

  it('la X de un rotulo con hueco va dentro del parentesis', () => {
    expect(markText('TRABAJO EN CALIENTE  (     )')).toBe('TRABAJO EN CALIENTE  ( X )')
    expect(markText('OTROS  (    ):')).toBe('OTROS  ( X ):')
    expect(markText(' NA ')).toBe('X NA')
  })

  it('una casilla marcada a mano sale con su X', () => {
    const [marcada, vacia] = filaResuelta([
      { id: 'a', width: 50, content: { kind: 'check', checked: true } },
      { id: 'b', width: 50, content: { kind: 'check' } },
    ])
    expect(marcada.checked).toBe(true)
    expect(vacia.checked).toBe(false)
  })
})
