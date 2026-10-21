import { isTrustedOrigin } from './cors-origin'

describe('isTrustedOrigin', () => {
  it('admite el dominio y sus subdominios', () => {
    expect(isTrustedOrigin('https://cosmos.com.pe')).toBe(true)
    expect(isTrustedOrigin('https://checkin.cosmos.com.pe')).toBe(true)
    expect(isTrustedOrigin('https://panel.marcostorresalarcon.com')).toBe(true)
  })

  it('rechaza un dominio que solo termina igual', () => {
    // Con `endsWith('cosmos.com.pe')` este pasaba.
    expect(isTrustedOrigin('https://evilcosmos.com.pe')).toBe(false)
    expect(isTrustedOrigin('https://cosmos.com.pe.evil.com')).toBe(false)
  })

  it('admite localhost en cualquier puerto y la app nativa', () => {
    expect(isTrustedOrigin('http://localhost:4200')).toBe(true)
    expect(isTrustedOrigin('https://localhost')).toBe(true)
    expect(isTrustedOrigin('capacitor://localhost')).toBe(true)
    expect(isTrustedOrigin(undefined)).toBe(true)
  })

  it('admite los origenes extra exactos y nada mas', () => {
    const extra = ['https://gentle-sea-0a1b2c.azurestaticapps.net']
    expect(isTrustedOrigin('https://gentle-sea-0a1b2c.azurestaticapps.net', extra)).toBe(true)
    expect(isTrustedOrigin('https://otro.azurestaticapps.net', extra)).toBe(false)
    expect(isTrustedOrigin('https://gentle-sea-0a1b2c.azurestaticapps.net', [])).toBe(false)
  })

  it('rechaza origenes mal formados u otros protocolos', () => {
    expect(isTrustedOrigin('null')).toBe(false)
    expect(isTrustedOrigin('file://cosmos.com.pe')).toBe(false)
  })
})
