import { HttpException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { FormatEngineResolver } from './format-engine.resolver'
import { FORMAT_ENGINE_V2, FormatEngine, parseFormatEngineId } from './format-engine'
import { FormatService } from './format.service'

/**
 * El conmutador entre los dos motores.
 *
 * Lo que se comprueba aqui no es que un `if` funcione, sino las tres promesas
 * que se le han hecho a quien despliega: que por defecto no cambia nada, que
 * una errata en la variable no tumba el servicio, y que nadie puede cambiar el
 * motor desde una URL a menos que se haya autorizado a proposito.
 */

const legacy = { engineId: 'legacy' } as unknown as FormatService
const v2 = { engineId: 'v2' } as unknown as FormatEngine

/** Deja el entorno como estaba: estas variables son globales del proceso. */
function withEnv(vars: Record<string, string | undefined>, run: () => void) {
  const previous: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  try {
    run()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

describe('parseFormatEngineId', () => {
  it('acepta los dos motores sin importar espacios ni mayusculas', () => {
    expect(parseFormatEngineId('legacy')).toBe('legacy')
    expect(parseFormatEngineId(' V2 ')).toBe('v2')
  })

  it('rechaza cualquier otra cosa', () => {
    expect(parseFormatEngineId('nuevo')).toBeNull()
    expect(parseFormatEngineId('')).toBeNull()
    expect(parseFormatEngineId(undefined)).toBeNull()
  })
})

describe('FormatEngineResolver', () => {
  it('sin variable definida emite con el motor que genera el documento', () => {
    // El por defecto es `v2`. Un despliegue que no configure nada tiene que
    // sacar los cuatro formatos nuevos, no las hojas antiguas de la plantilla.
    withEnv({ FORMAT_ENGINE: undefined }, () => {
      const resolver = new FormatEngineResolver(legacy, v2)
      expect(resolver.configured()).toBe('v2')
      expect(resolver.resolve()).toBe(v2)
    })
  })

  it('una errata en la variable no tumba el servicio', () => {
    withEnv({ FORMAT_ENGINE: 'v3' }, () => {
      const resolver = new FormatEngineResolver(legacy, v2)
      expect(resolver.configured()).toBe('v2')
      expect(resolver.resolve()).toBe(v2)
    })
  })

  it('se puede volver al motor antiguo sin desplegar', () => {
    withEnv({ FORMAT_ENGINE: 'legacy' }, () => {
      const resolver = new FormatEngineResolver(legacy, v2)
      expect(resolver.configured()).toBe('legacy')
      expect(resolver.resolve()).toBe(legacy)
    })
  })

  it('con FORMAT_ENGINE=v2 y el motor registrado, emite el nuevo', () => {
    withEnv({ FORMAT_ENGINE: 'v2' }, () => {
      const resolver = new FormatEngineResolver(legacy, v2)
      expect(resolver.configured()).toBe('v2')
      expect(resolver.resolve()).toBe(v2)
    })
  })

  it('pedir v2 sin motor registrado falla claro, no a medias', () => {
    withEnv({ FORMAT_ENGINE: 'v2' }, () => {
      const resolver = new FormatEngineResolver(legacy)
      expect(() => resolver.resolve()).toThrow(HttpException)
      try {
        resolver.resolve()
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(501)
      }
    })
  })

  it('la URL no puede cambiar el motor mientras no se autorice', () => {
    withEnv({ FORMAT_ENGINE: 'legacy', FORMAT_ENGINE_ALLOW_OVERRIDE: undefined }, () => {
      const resolver = new FormatEngineResolver(legacy, v2)
      expect(resolver.resolve('v2')).toBe(legacy)
    })
  })

  it('con la autorizacion puesta, la URL manda', () => {
    withEnv({ FORMAT_ENGINE: 'legacy', FORMAT_ENGINE_ALLOW_OVERRIDE: 'true' }, () => {
      const resolver = new FormatEngineResolver(legacy, v2)
      expect(resolver.resolve('v2')).toBe(v2)
      // Y lo configurado sigue siendo lo que dice el entorno.
      expect(resolver.configured()).toBe('legacy')
    })
  })

  it('con la autorizacion puesta pero sin parametro, manda el entorno', () => {
    withEnv({ FORMAT_ENGINE: 'legacy', FORMAT_ENGINE_ALLOW_OVERRIDE: 'true' }, () => {
      const resolver = new FormatEngineResolver(legacy, v2)
      expect(resolver.resolve(undefined)).toBe(legacy)
      expect(resolver.resolve('disparate')).toBe(legacy)
    })
  })
})

/**
 * Que el motor v2 sea opcional tiene que funcionar en el contenedor de Nest, no
 * solo llamando al constructor a mano. Sin `@Optional()`, un proveedor que no
 * existe no da un formato raro: impide arrancar la aplicacion entera.
 */
describe('FormatEngineResolver, cableado en Nest', () => {
  it('arranca sin el motor v2 registrado', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FormatEngineResolver,
        { provide: FormatService, useValue: legacy },
      ],
    }).compile()

    const resolver = moduleRef.get(FormatEngineResolver)
    withEnv({ FORMAT_ENGINE: 'legacy' }, () => {
      expect(resolver.resolve()).toBe(legacy)
    })
  })

  it('toma el motor v2 cuando alguien lo registra con su token', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FormatEngineResolver,
        { provide: FormatService, useValue: legacy },
        { provide: FORMAT_ENGINE_V2, useValue: v2 },
      ],
    }).compile()

    const resolver = moduleRef.get(FormatEngineResolver)
    withEnv({ FORMAT_ENGINE: 'v2' }, () => {
      expect(resolver.resolve()).toBe(v2)
    })
  })
})
