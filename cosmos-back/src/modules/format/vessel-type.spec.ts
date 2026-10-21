import { rejectedVesselTypeMessage, resolveVesselType } from './vessel-type'

describe('resolveVesselType', () => {
  it.each([
    ['ET', 'ETANOL', 'ETHANOL'],
    ['GR', 'GRANEL', 'GRANEL'],
    ['ME', 'MERCADERIA', 'MERCADERIA_GENERAL'],
    ['CO', 'CONTAINER', 'CONTAINERO'],
    ['BB', 'BIG BAGS', 'BIG_BAG'],
  ])('acepta %s (%s) con el formato %s', (code, description, formatType) => {
    expect(resolveVesselType(code, description)).toEqual({
      code,
      description,
      formatType,
      accepted: true,
      source: 'api',
    })
  })

  // Valores reales que devuelve ListarNombradas y que no tienen formato.
  it.each([
    ['VA', 'VARILLAS'],
    ['', ''],
    ['XX', 'OTRO NUEVO'],
  ])('rechaza %s (%s)', (code, description) => {
    const info = resolveVesselType(code, description)
    expect(info.accepted).toBe(false)
    expect(info.formatType).toBe('')
  })

  it('normaliza espacios y minusculas del codigo', () => {
    expect(resolveVesselType(' gr ', ' GRANEL ').formatType).toBe('GRANEL')
  })

  it('un codigo presente manda sobre el formato elegido antes a mano', () => {
    expect(resolveVesselType('VA', 'VARILLAS', 'GRANEL').accepted).toBe(false)
    expect(resolveVesselType('ET', 'ETANOL', 'GRANEL').formatType).toBe(
      'ETHANOL'
    )
  })

  it('sin el campo (copia anterior) usa el formato guardado en la ficha', () => {
    expect(resolveVesselType(undefined, undefined, 'GRANEL')).toMatchObject({
      formatType: 'GRANEL',
      accepted: true,
      source: 'record',
    })
    expect(resolveVesselType(undefined, undefined, '').accepted).toBe(false)
    expect(resolveVesselType(undefined, undefined, 'OTRO').accepted).toBe(false)
  })

  it('explica el rechazo con el tipo que llego', () => {
    expect(
      rejectedVesselTypeMessage(resolveVesselType('VA', 'VARILLAS'))
    ).toContain('VA (VARILLAS)')
    expect(rejectedVesselTypeMessage(resolveVesselType('', ''))).toContain(
      'no trae tipo de nave'
    )
  })
})
