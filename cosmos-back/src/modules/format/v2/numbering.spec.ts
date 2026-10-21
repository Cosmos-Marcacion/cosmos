import { NumberSeries } from '../../../common/numbering/document-number.service'
import { FormatNumberingService, WORK_PERMIT_SERIES_ID } from './format-numbering.service'
import { NumberingSource, numberingOrder, validateNumbering } from './numbering'

const serie = (id: string, prefix: string): NumberSeries =>
  ({ id, prefix, scope: 'year', pad: 4 })

const own = (id: string, prefix: string): NumberingSource =>
  ({ kind: 'own', series: serie(id, prefix) })

const inherit = (from: string): NumberingSource => ({ kind: 'inherit', from })

describe('validateNumbering', () => {
  it('acepta series propias e independientes', () => {
    const errors = validateNumbering([
      { id: 'ats', numbering: own('ats', 'ATS') },
      { id: 'pts', numbering: own('pts', 'PTS') },
    ])
    expect(errors).toEqual([])
  })

  it('acepta una herencia que resuelve', () => {
    const errors = validateNumbering([
      { id: 'pts', numbering: own('pts', 'PTS') },
      { id: 'pts-pie', numbering: inherit('pts') },
    ])
    expect(errors).toEqual([])
  })

  it('acepta una cadena de herencias', () => {
    const errors = validateNumbering([
      { id: 'a', numbering: own('a', 'A') },
      { id: 'b', numbering: inherit('a') },
      { id: 'c', numbering: inherit('b') },
    ])
    expect(errors).toEqual([])
  })

  it('rechaza heredar de un documento que no existe', () => {
    const errors = validateNumbering([{ id: 'pts-pie', numbering: inherit('pts') }])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toEqual({
      documentId: 'pts-pie',
      message: 'hereda la numeracion de "pts", que no existe en este formato',
    })
  })

  it('rechaza heredar de un documento sin numero', () => {
    const errors = validateNumbering([
      { id: 'asistencia' },
      { id: 'pts-pie', numbering: inherit('asistencia') },
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/no lleva numero/)
  })

  it('rechaza un ciclo directo', () => {
    const errors = validateNumbering([
      { id: 'a', numbering: inherit('b') },
      { id: 'b', numbering: inherit('a') },
    ])
    // Los dos documentos del ciclo se senalan, no solo uno.
    expect(errors).toHaveLength(2)
    expect(errors[0].message).toMatch(/ciclo/)
  })

  it('rechaza un ciclo largo', () => {
    const errors = validateNumbering([
      { id: 'a', numbering: inherit('b') },
      { id: 'b', numbering: inherit('c') },
      { id: 'c', numbering: inherit('a') },
    ])
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.every(e => /ciclo/.test(e.message))).toBe(true)
  })

  it('rechaza que un documento herede de si mismo', () => {
    const errors = validateNumbering([{ id: 'a', numbering: inherit('a') }])
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/ciclo/)
  })
})

describe('numberingOrder', () => {
  it('resuelve primero aquel del que se hereda', () => {
    const order = numberingOrder([
      { id: 'pts-pie', numbering: inherit('pts') },
      { id: 'pts', numbering: own('pts', 'PTS') },
    ])
    expect(order.indexOf('pts')).toBeLessThan(order.indexOf('pts-pie'))
  })

  it('ordena una cadena entera', () => {
    const order = numberingOrder([
      { id: 'c', numbering: inherit('b') },
      { id: 'b', numbering: inherit('a') },
      { id: 'a', numbering: own('a', 'A') },
    ])
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('no cuelga ante un ciclo', () => {
    const order = numberingOrder([
      { id: 'a', numbering: inherit('b') },
      { id: 'b', numbering: inherit('a') },
    ])
    expect(order).toHaveLength(2)
  })
})

// -----------------------------------------------------------------------------

class FakeNumbers {
  readonly issued: { seriesId: string; staff: number; seedSeq?: number }[] = []
  private counters = new Map<string, number>()
  private assigned = new Map<string, number>()

  async ensure(series: NumberSeries, staff: number, options: any = {}) {
    const key = `${series.id}|${staff}`
    let seq: number | undefined = this.assigned.get(key)
    if (seq === undefined) {
      seq = (options.seedSeq as number | undefined) ?? (this.counters.get(series.id) ?? 0) + 1
      if (!options.seedSeq) {
        this.counters.set(series.id, seq)
      }
      this.assigned.set(key, seq)
      this.issued.push({ seriesId: series.id, staff, seedSeq: options.seedSeq })
    }
    const period = series.scope === 'year' ? String((options.when ?? new Date()).getFullYear()) : 'global'
    const digits = String(seq).padStart(series.pad, '0')
    const parts = [series.prefix, period === 'global' ? '' : period, digits].filter(Boolean)
    return { seriesId: series.id, seq, period, formatted: parts.join('-') }
  }
}

describe('FormatNumberingService', () => {
  let numbers: FakeNumbers
  let service: FormatNumberingService

  beforeEach(() => {
    numbers = new FakeNumbers()
    service = new FormatNumberingService(numbers as any)
  })

  const context = {
    staffTransmissionId: 2856,
    namedCode: '0875-1',
    when: new Date(2026, 8, 10),
  }

  it('cada documento recibe el numero de su propia serie', async () => {
    const resolved = await service.resolve(
      [
        { id: 'ats', numbering: own('ats', 'ATS') },
        { id: 'charla', numbering: own('charla', 'CHA') },
      ],
      context
    )

    expect(resolved.get('ats')).toBe('ATS-2026-0001')
    expect(resolved.get('charla')).toBe('CHA-2026-0001')
  })

  it('un documento que hereda repite el numero sin consumir correlativo', async () => {
    const resolved = await service.resolve(
      [
        { id: 'pts-pie', numbering: inherit('pts') },
        { id: 'pts', numbering: own('pts', 'PTS') },
      ],
      context
    )

    // Es lo que en la plantilla hacia la formula `Z63 = T6`.
    expect(resolved.get('pts-pie')).toBe(resolved.get('pts'))
    expect(numbers.issued).toHaveLength(1)
  })

  it('la herencia funciona aunque el origen venga despues en la definicion', async () => {
    const resolved = await service.resolve(
      [
        { id: 'pie', numbering: inherit('cabecera') },
        { id: 'medio', numbering: inherit('pie') },
        { id: 'cabecera', numbering: own('x', 'X') },
      ],
      context
    )

    expect(resolved.get('medio')).toBe('X-2026-0001')
  })

  it('`namedCode` imprime el codigo de nombrada, como hoy el N° ATS', async () => {
    const resolved = await service.resolve(
      [{ id: 'ats', numbering: { kind: 'namedCode' } }],
      context
    )

    expect(resolved.get('ats')).toBe('0875-1')
    expect(numbers.issued).toHaveLength(0)
  })

  it('un documento sin numeracion no aparece en el resultado', async () => {
    const resolved = await service.resolve([{ id: 'asistencia' }], context)
    expect(resolved.has('asistencia')).toBe(false)
  })

  it('el permiso adopta el correlativo que ya tenia la nombrada', async () => {
    const resolved = await service.resolve(
      [{ id: 'pts', numbering: own(WORK_PERMIT_SERIES_ID, 'PTS') }],
      { ...context, legacyWorkPermitNumber: 137 }
    )

    expect(resolved.get('pts')).toBe('PTS-2026-0137')
    expect(numbers.issued[0].seedSeq).toBe(137)
  })

  it('solo el permiso adopta correlativo heredado, no las demas series', async () => {
    await service.resolve(
      [{ id: 'ats', numbering: own('ats', 'ATS') }],
      { ...context, legacyWorkPermitNumber: 137 }
    )
    expect(numbers.issued[0].seedSeq).toBeUndefined()
  })

  it('reemitir la misma nombrada devuelve los mismos numeros', async () => {
    const docs = [
      { id: 'ats', numbering: own('ats', 'ATS') },
      { id: 'pts', numbering: own('pts', 'PTS') },
      { id: 'pts-pie', numbering: inherit('pts') },
    ]
    const first = await service.resolve(docs, context)
    const second = await service.resolve(docs, context)

    expect([...second.entries()]).toEqual([...first.entries()])
    expect(numbers.issued).toHaveLength(2)
  })

  it('una herencia rota deja el campo vacio en vez de impedir la emision', async () => {
    const resolved = await service.resolve([{ id: 'pie', numbering: inherit('no-existe') }], context)

    // La definicion es invalida y `validateNumbering` lo dice al publicar; a la
    // hora de emitir, la jornada tiene que poder salir igual.
    expect(resolved.get('pie')).toBe('')
  })
})
