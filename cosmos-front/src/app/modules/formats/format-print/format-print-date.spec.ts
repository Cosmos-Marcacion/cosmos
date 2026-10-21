import { toIsoDate } from './format-print';

describe('toIsoDate (volver desde la vista de impresion)', () => {
  it('pasa dd/mm/aaaa a aaaa-mm-dd, que es lo que pide el detalle', () => {
    expect(toIsoDate('10/09/2026')).toBe('2026-09-10');
    expect(toIsoDate('1/2/2026')).toBe('2026-02-01');
  });

  it('deja tal cual lo que ya es ISO o no se entiende', () => {
    expect(toIsoDate('2026-09-10')).toBe('2026-09-10');
    expect(toIsoDate('')).toBe('');
  });
});
