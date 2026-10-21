import { composeFullName, composeLastName } from './compose-last-name'

describe('composeLastName', () => {
  it('concatena paterno y materno cuando vienen separados', () => {
    expect(composeLastName('ESPINOZA', 'RETO')).toBe('ESPINOZA RETO')
  })

  it('no repite el materno si last_name ya lo trae', () => {
    expect(composeLastName('TORRES ROMERO', 'ROMERO')).toBe('TORRES ROMERO')
    expect(composeLastName('SALDARRIAGA CRUZ', 'CRUZ')).toBe('SALDARRIAGA CRUZ')
  })

  it('compara sin tildes ni mayusculas pero conserva el texto original', () => {
    expect(composeLastName('Peña Muñoz', 'MUNOZ')).toBe('Peña Muñoz')
    expect(composeLastName('PEÑA', 'MUÑOZ')).toBe('PEÑA MUÑOZ')
  })

  it('respeta apellidos iguales cuando cada campo trae uno', () => {
    expect(composeLastName('ROMERO', 'ROMERO')).toBe('ROMERO ROMERO')
  })

  it('solo omite coincidencias de palabra completa', () => {
    // "CRUZ" no es el final de "VERACRUZ" como palabra.
    expect(composeLastName('VERACRUZ', 'CRUZ')).toBe('VERACRUZ CRUZ')
  })

  it('conserva apellidos compuestos', () => {
    expect(composeLastName('DE LA CRUZ', 'DEL PINO')).toBe(
      'DE LA CRUZ DEL PINO'
    )
    expect(composeLastName('GARCIA DEL PINO', 'DEL PINO')).toBe(
      'GARCIA DEL PINO'
    )
  })

  it('tolera campos vacios y espacios de mas', () => {
    expect(composeLastName('  TORRES  ', '')).toBe('TORRES')
    expect(composeLastName(null, 'RETO')).toBe('RETO')
    expect(composeLastName(undefined, undefined)).toBe('')
  })
})

describe('composeFullName', () => {
  it('pone los apellidos delante de los nombres', () => {
    expect(composeFullName('TORRES ROMERO', 'ROMERO', 'CARLOS ERNESTO')).toBe(
      'TORRES ROMERO CARLOS ERNESTO'
    )
  })
})
