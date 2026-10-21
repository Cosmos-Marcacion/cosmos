import { formatLimaTime, limaDateTime } from './lima'

/**
 * Los instantes se escriben en UTC a proposito: estas funciones no pueden
 * depender de la zona del proceso, que en los tests es Lima y en el contenedor
 * de produccion era UTC.
 */
describe('hora de Lima', () => {
  it('formatea un instante en hora de Lima (UTC-5)', () => {
    expect(formatLimaTime(new Date('2026-09-18T15:00:00Z'))).toBe('10:00')
    expect(formatLimaTime('2026-09-18T12:05:00.000Z')).toBe('07:05')
  })

  it('devuelve cadena vacia si no hay fecha valida', () => {
    expect(formatLimaTime(null)).toBe('')
    expect(formatLimaTime(undefined)).toBe('')
    expect(formatLimaTime('no es fecha')).toBe('')
  })

  it('construye el instante real de una hora de Lima', () => {
    expect(limaDateTime('2026-09-18', '07:00').toISOString()).toBe(
      '2026-09-18T12:00:00.000Z'
    )
    expect(limaDateTime('2026-09-18', '23:30').toISOString()).toBe(
      '2026-09-19T04:30:00.000Z'
    )
  })
})
