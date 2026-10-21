import { NamedRecordService } from './named-record.service'

/**
 * El correlativo del permiso de trabajo tiene una sola regla, y es dura: no se
 * repite. Aqui se comprueba contra un modelo en memoria que reproduce lo que
 * hace Mongo, indice unico incluido.
 */

/** Error de clave duplicada, tal como lo lanza el driver. */
class DuplicateKeyError extends Error {
  code = 11000
  constructor(field: string) {
    super(`E11000 duplicate key error collection: named_records index: ${field}`)
  }
}

interface FakeDoc {
  staffTransmissionId: number
  workerDateIso?: string
  workPermitNumber?: number
}

/** Envoltorio `.lean().exec()`, que es como llama el servicio. */
function chain<T>(run: () => T) {
  return { lean: () => ({ exec: async () => run() }) }
}

class FakeModel {
  constructor(public docs: FakeDoc[] = []) { }

  findOne(filter: any, _projection?: any) {
    return chain(() =>
      this.docs.find(d => d.staffTransmissionId === filter.staffTransmissionId) ?? null
    )
  }

  findOneAndUpdate(filter: any, update: any, options: any) {
    return chain(() => {
      const set = update.$set ?? {}
      const wantsEmptyPermit = Boolean(filter.workPermitNumber?.$in)

      const found = this.docs.find(d =>
        d.staffTransmissionId === filter.staffTransmissionId &&
        (!wantsEmptyPermit || !d.workPermitNumber)
      )

      const target: FakeDoc = found ?? { staffTransmissionId: filter.staffTransmissionId }
      if (!found) {
        if (!options?.upsert) {
          return null
        }
        // Indice unico de `staffTransmissionId`.
        if (this.docs.some(d => d.staffTransmissionId === filter.staffTransmissionId)) {
          throw new DuplicateKeyError('staffTransmissionId_1')
        }
      }

      // Indice unico disperso de `workPermitNumber`.
      if (set.workPermitNumber && this.docs.some(
        d => d !== target && d.workPermitNumber === set.workPermitNumber
      )) {
        throw new DuplicateKeyError('workPermitNumber_1')
      }

      Object.assign(target, set)
      if (!found) {
        this.docs.push(target)
      }
      return target
    })
  }
}

/** Serie que arranca en `from` y entrega numeros consecutivos. */
function fakeCounter(from = 0) {
  let seq = from
  return {
    calls: 0,
    async next() {
      this.calls++
      return ++seq
    },
  }
}

function buildService(docs: FakeDoc[] = [], counterFrom = 0) {
  const model = new FakeModel(docs)
  const counter = fakeCounter(counterFrom)
  const service = new NamedRecordService(model as any, counter as any)
  return { service, model, counter }
}

describe('NamedRecordService.ensureWorkPermitNumber', () => {
  it('arranca en 1 y sigue correlativo', async () => {
    const { service } = buildService()

    expect(await service.ensureWorkPermitNumber(2856, '2025-09-10')).toBe(1)
    expect(await service.ensureWorkPermitNumber(2857, '2025-09-10')).toBe(2)
    expect(await service.ensureWorkPermitNumber(2858, '2025-09-11')).toBe(3)
  })

  it('crea la ficha si la nombrada aun no tenia', async () => {
    const { service, model } = buildService()
    await service.ensureWorkPermitNumber(2856, '2025-09-10')

    expect(model.docs).toEqual([
      { staffTransmissionId: 2856, workerDateIso: '2025-09-10', workPermitNumber: 1 },
    ])
  })

  it('no reasigna: la misma nombrada conserva su numero y no consume serie', async () => {
    const { service, counter } = buildService()

    const first = await service.ensureWorkPermitNumber(2856, '2025-09-10')
    const second = await service.ensureWorkPermitNumber(2856, '2025-09-10')

    expect(second).toBe(first)
    // Reemitir el formato no gasta un correlativo nuevo.
    expect(counter.calls).toBe(1)
  })

  it('respeta el numero de una ficha que ya lo tenia', async () => {
    const { service } = buildService([{ staffTransmissionId: 2856, workPermitNumber: 44 }])
    expect(await service.ensureWorkPermitNumber(2856, '2025-09-10')).toBe(44)
  })

  it('si el correlativo ya estaba tomado, pide otro en vez de repetirlo', async () => {
    // La serie va por detras de lo que ya hay guardado: el 1 chocaria.
    const { service, model } = buildService([{ staffTransmissionId: 2000, workPermitNumber: 1 }])

    expect(await service.ensureWorkPermitNumber(2856, '2025-09-10')).toBe(2)

    const numbers = model.docs.map(d => d.workPermitNumber)
    expect(new Set(numbers).size).toBe(numbers.length)
  })

  it('se rinde antes que entregar un numero repetido', async () => {
    // Toda la serie que se va a pedir esta ocupada.
    const taken = [1, 2, 3, 4, 5].map((n, i) => ({
      staffTransmissionId: 3000 + i,
      workPermitNumber: n,
    }))
    const { service } = buildService(taken)

    await expect(service.ensureWorkPermitNumber(2856, '2025-09-10'))
      .rejects.toThrow(/No se pudo asignar un numero de permiso de trabajo/)
  })
})
