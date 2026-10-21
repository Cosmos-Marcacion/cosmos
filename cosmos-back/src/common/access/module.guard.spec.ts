import { ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ModuleGuard } from './module.guard'
import {
  MODULE_KEYS,
  PLATFORM_MODULES,
  isModuleKey,
  LEGACY_ROLE_MODULES,
} from './modules'

/**
 * El guardia que decide si un perfil entra a un modulo.
 *
 * Ocultar una opcion del menu ordena la pantalla pero no protege nada: la ruta
 * de la API sigue ahi para quien la escriba a mano. Esto es la otra mitad.
 */

/** Un contexto de ejecucion con el usuario que trae el token. */
function contexto(user: unknown) {
  return {
    getHandler: () => 'handler',
    getClass: () => 'clase',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never
}

/** Un reflector que devuelve siempre el mismo modulo exigido. */
function reflector(required: string | undefined): Reflector {
  return { getAllAndOverride: () => required } as unknown as Reflector
}

describe('ModuleGuard', () => {
  it('deja pasar a quien tiene el modulo', () => {
    const guard = new ModuleGuard(reflector('puertos'))
    expect(
      guard.canActivate(contexto({ permissions: ['panel', 'puertos'] }))
    ).toBe(true)
  })

  it('rechaza a quien no lo tiene, diciendo cual es', () => {
    const guard = new ModuleGuard(reflector('puertos'))

    expect(() =>
      guard.canActivate(contexto({ permissions: ['panel'] }))
    ).toThrow(ForbiddenException)
    try {
      guard.canActivate(contexto({ permissions: ['panel'] }))
    } catch (error) {
      // El mensaje nombra la pantalla, no la clave: es lo que el usuario ve.
      expect((error as ForbiddenException).message).toContain('Puertos')
    }
  })

  it('un token anterior a los perfiles no entra a ningun modulo', () => {
    // Se resuelve como lista vacia, no como "todos": un token viejo no puede
    // acabar dando mas acceso que uno nuevo.
    const guard = new ModuleGuard(reflector('usuarios'))
    expect(() => guard.canActivate(contexto({ email: 'a@b.c' }))).toThrow(
      ForbiddenException
    )
  })

  it('sin peticion autenticada tampoco pasa', () => {
    const guard = new ModuleGuard(reflector('usuarios'))
    expect(() => guard.canActivate(contexto(undefined))).toThrow(
      ForbiddenException
    )
  })

  it('con varios modulos declarados basta con tener uno', () => {
    // Marcaciones y la app leen los puntos para marcar: no pueden exigir el
    // modulo de administrar puntos.
    const guard = new ModuleGuard(reflector(['puntos', 'marcaciones'] as never))
    expect(guard.canActivate(contexto({ permissions: ['marcaciones'] }))).toBe(
      true
    )
    expect(guard.canActivate(contexto({ permissions: ['puntos'] }))).toBe(true)
    expect(() =>
      guard.canActivate(contexto({ permissions: ['panel'] }))
    ).toThrow(ForbiddenException)
  })

  it('un endpoint que no declara modulo pasa', () => {
    // Denegar por defecto dejaria fuera el login y la salud del servicio, y el
    // fallo se veria en produccion como un 403 sin explicacion.
    const guard = new ModuleGuard(reflector(undefined))
    expect(guard.canActivate(contexto({ permissions: [] }))).toBe(true)
  })
})

describe('catalogo de modulos', () => {
  it('las claves son unicas', () => {
    expect(new Set(MODULE_KEYS).size).toBe(MODULE_KEYS.length)
  })

  it('cada modulo dice para que sirve y que rutas cubre', () => {
    // La pantalla de perfiles se construye con esto. Un modulo sin explicacion
    // obliga a adivinar que se esta concediendo.
    const incompletos = PLATFORM_MODULES.filter(
      module =>
        !module.label || !module.description || module.routes.length === 0
    )
    expect(incompletos).toEqual([])
  })

  it('una clave inventada no es un modulo', () => {
    expect(isModuleKey('panel')).toBe(true)
    expect(isModuleKey('panel-de-control')).toBe(false)
  })

  it('los perfiles de siempre conservan lo que ya podian hacer', () => {
    // La migracion no puede quitarle acceso a nadie: `Super` y `Admin`
    // administraban todo y `User` operaba la jornada.
    expect(LEGACY_ROLE_MODULES['Super']).toEqual(MODULE_KEYS)
    expect(LEGACY_ROLE_MODULES['Admin']).toEqual(MODULE_KEYS)
    expect(LEGACY_ROLE_MODULES['User']).toEqual(['panel', 'marcaciones'])
  })

  it('todo lo que un perfil de siempre recibe existe en el catalogo', () => {
    const invalidos = Object.entries(LEGACY_ROLE_MODULES).flatMap(
      ([role, keys]) =>
        keys.filter(key => !isModuleKey(key)).map(key => `${role}:${key}`)
    )
    expect(invalidos).toEqual([])
  })
})
