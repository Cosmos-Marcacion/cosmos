import { DocumentNumberService, NumberSeries } from './document-number.service'

/**
 * El reparto de correlativos, contra un doble de Mongo que reproduce lo unico
 * que importa aqui: el `$inc` atomico del contador y los dos indices unicos de
 * `document_numbers`.
 *
 * Se prueba contra un doble y no contra Mongo porque lo que hay que demostrar
 * es el comportamiento del servicio ante una clave duplicada, y eso es
 * exactamente lo que el doble sabe simular a voluntad.
 */

const DUPLICATE_KEY = 11000

class FakeCounters {
  readonly values = new Map<string, number>()

  async next(key: string): Promise<number> {
    const next = (this.values.get(key) ?? 0) + 1
    this.values.set(key, next)
    return next
  }

  async current(key: string): Promise<number> {
    return this.values.get(key) ?? 0
  }
}

interface Row {
  seriesId: string
  staffTransmissionId: number
  period: string
  seq: number
  formatted: string
}

class FakeModel {
  rows: Row[] = []
  /** Se ejecuta antes de cada `create`. Sirve para colar una carrera. */
  beforeCreate: (() => void) | null = null

  findOne(filter: any) {
    const found = this.rows.find(row =>
      Object.entries(filter).every(([key, value]) => (row as any)[key] === value)
    )
    return { lean: () => ({ exec: async () => found ?? null }) }
  }

  async create(row: Row): Promise<Row> {
    this.beforeCreate?.()
    const clashesByNamed = this.rows.some(
      r => r.seriesId === row.seriesId && r.staffTransmissionId === row.staffTransmissionId
    )
    const clashesBySeq = this.rows.some(
      r => r.seriesId === row.seriesId && r.period === row.period && r.seq === row.seq
    )
    if (clashesByNamed || clashesBySeq) {
      throw Object.assign(new Error('E11000 duplicate key'), { code: DUPLICATE_KEY })
    }
    this.rows.push({ ...row })
    return row
  }
}

const ATS: NumberSeries = { id: 'ats', prefix: 'ATS', scope: 'year', pad: 4 }
const PTS: NumberSeries = { id: 'pts', prefix: 'PTS', scope: 'global', pad: 4 }

describe('DocumentNumberService', () => {
  let model: FakeModel
  let counters: FakeCounters
  let service: DocumentNumberService

  beforeEach(() => {
    model = new FakeModel()
    counters = new FakeCounters()
    service = new DocumentNumberService(model as any, counters as any)
  })

  const when = new Date(2026, 8, 10)

  describe('composicion del numero', () => {
    it('una serie anual lleva el año', async () => {
      const assigned = await service.ensure(ATS, 2856, { when })
      expect(assigned.formatted).toBe('ATS-2026-0001')
    })

    it('una serie global no lleva año', async () => {
      const assigned = await service.ensure(PTS, 2856, { when })
      // `PTS-global-0001` seria absurdo: el periodo se omite.
      expect(assigned.formatted).toBe('PTS-0001')
    })

    it('respeta los digitos declarados', async () => {
      const serie: NumberSeries = { id: 'x', prefix: 'X', scope: 'global', pad: 6 }
      expect((await service.ensure(serie, 1)).formatted).toBe('X-000001')
    })

    it('un correlativo mas largo que el relleno no se recorta', async () => {
      const serie: NumberSeries = { id: 'x', prefix: 'X', scope: 'global', pad: 2 }
      counters.values.set('docnum:x:global', 1234)
      expect((await service.ensure(serie, 1)).formatted).toBe('X-1235')
    })
  })

  describe('idempotencia', () => {
    it('la misma nombrada recibe siempre el mismo numero', async () => {
      const first = await service.ensure(ATS, 2856, { when })
      const second = await service.ensure(ATS, 2856, { when })
      const third = await service.ensure(ATS, 2856, { when })

      expect(second).toEqual(first)
      expect(third).toEqual(first)
      // Y no se han quemado correlativos por el camino.
      expect(await counters.current('docnum:ats:2026')).toBe(1)
    })

    it('reemitir en otro año no cambia el numero ya asignado', async () => {
      const original = await service.ensure(ATS, 2856, { when: new Date(2026, 11, 31) })
      const reissued = await service.ensure(ATS, 2856, { when: new Date(2027, 0, 2) })

      // El periodo va guardado, no se recalcula al leer: un formato de
      // diciembre reemitido en enero sigue siendo el de diciembre.
      expect(reissued.formatted).toBe(original.formatted)
      expect(reissued.period).toBe('2026')
    })

    it('nombradas distintas reciben numeros distintos', async () => {
      const a = await service.ensure(ATS, 2856, { when })
      const b = await service.ensure(ATS, 2857, { when })
      expect(a.seq).toBe(1)
      expect(b.seq).toBe(2)
    })

    it('un cambio de prefijo alcanza a lo ya asignado, sin mover el correlativo', async () => {
      await service.ensure(ATS, 2856, { when })
      // El maestro renombra la serie.
      const renamed: NumberSeries = { ...ATS, prefix: 'ATSX' }
      const reissued = await service.ensure(renamed, 2856, { when })

      expect(reissued.seq).toBe(1)
      expect(reissued.formatted).toBe('ATSX-2026-0001')
    })
  })

  describe('series independientes', () => {
    it('cada serie lleva su propia cuenta', async () => {
      await service.ensure(ATS, 2856, { when })
      await service.ensure(ATS, 2857, { when })
      const pts = await service.ensure(PTS, 2857, { when })

      // El ATS va por el 2 y el permiso empieza en el 1.
      expect(pts.seq).toBe(1)
      expect(pts.formatted).toBe('PTS-0001')
    })

    it('una serie anual reinicia la cuenta al cambiar de año', async () => {
      await service.ensure(ATS, 2856, { when: new Date(2026, 5, 1) })
      const nextYear = await service.ensure(ATS, 3001, { when: new Date(2027, 0, 5) })

      expect(nextYear.seq).toBe(1)
      expect(nextYear.formatted).toBe('ATS-2027-0001')
    })

    it('una serie global no reinicia', async () => {
      await service.ensure(PTS, 2856, { when: new Date(2026, 5, 1) })
      const nextYear = await service.ensure(PTS, 3001, { when: new Date(2027, 0, 5) })

      expect(nextYear.seq).toBe(2)
    })
  })

  describe('carreras', () => {
    it('dos peticiones simultaneas sobre la misma nombrada dan un solo numero', async () => {
      // La segunda inserta justo antes de que la primera llegue a su `create`.
      let raced = false
      model.beforeCreate = () => {
        if (raced) {
          return
        }
        raced = true
        model.rows.push({
          seriesId: 'ats', staffTransmissionId: 2856,
          period: '2026', seq: 99, formatted: 'ATS-2026-0099',
        })
      }

      const assigned = await service.ensure(ATS, 2856, { when })

      expect(assigned.seq).toBe(99)
      expect(model.rows.filter(r => r.staffTransmissionId === 2856)).toHaveLength(1)
    })

    it('si el correlativo ya esta tomado por otra nombrada, pide el siguiente', async () => {
      // Alguien toco los contadores a mano y el 1 ya existe en otra nombrada.
      model.rows.push({
        seriesId: 'ats', staffTransmissionId: 9999,
        period: '2026', seq: 1, formatted: 'ATS-2026-0001',
      })

      const assigned = await service.ensure(ATS, 2856, { when })

      expect(assigned.seq).toBe(2)
      expect(assigned.formatted).toBe('ATS-2026-0002')
    })

    it('desiste tras varios intentos en vez de girar sin fin', async () => {
      model.beforeCreate = () => {
        throw Object.assign(new Error('E11000'), { code: DUPLICATE_KEY })
      }
      await expect(service.ensure(ATS, 2856, { when })).rejects.toThrow(/No se pudo asignar/)
    })

    it('un error que no sea clave duplicada no se reintenta', async () => {
      model.beforeCreate = () => {
        throw new Error('la base de datos no responde')
      }
      await expect(service.ensure(ATS, 2856, { when })).rejects.toThrow('la base de datos no responde')
    })
  })

  describe('compatibilidad con los permisos ya emitidos', () => {
    it('adopta el correlativo que traia la nombrada en vez de repartir uno', async () => {
      const assigned = await service.ensure(PTS, 2856, { when, seedSeq: 137 })

      expect(assigned.seq).toBe(137)
      expect(assigned.formatted).toBe('PTS-0137')
      // Y no ha consumido nada de la serie.
      expect(await counters.current('docnum:pts:global')).toBe(0)
    })

    it('si el correlativo adoptado choca, reparte uno nuevo', async () => {
      model.rows.push({
        seriesId: 'pts', staffTransmissionId: 9999,
        period: 'global', seq: 137, formatted: 'PTS-0137',
      })

      const assigned = await service.ensure(PTS, 2856, { when, seedSeq: 137 })

      expect(assigned.seq).toBe(1)
    })
  })

  it('rechaza una serie mal definida', async () => {
    const invalid = { id: '', prefix: 'X', scope: 'year', pad: 4 } as NumberSeries
    await expect(service.ensure(invalid, 1)).rejects.toThrow(/invalida/)
  })
})
