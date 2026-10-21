import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { executionContext } from '../../../testing';

/**
 * El guardia de roles decide si quien pide tiene el rol que el endpoint exige.
 *
 * Es una de las dos mitades de la autorizacion —la otra es `ModuleGuard`— y no
 * tenia ni un caso. Un fallo aqui no produce un error: produce un acceso.
 */
describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  const handler = () => undefined;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  /** Declara los roles que exige el endpoint bajo prueba. */
  const exigir = (roles: string[] | undefined) => {
    jest.spyOn(reflector, 'get').mockReturnValue(roles);
  };

  it('deja pasar un endpoint que no exige ningun rol', () => {
    exigir(undefined);

    // Denegar por defecto seria mas estricto sobre el papel y dejaria fuera el
    // login y la salud del servicio.
    expect(guard.canActivate(executionContext({ user: {}, handler }))).toBe(true);
  });

  it('deja pasar a quien tiene el rol exigido', () => {
    exigir(['Admin']);

    expect(
      guard.canActivate(executionContext({ user: { roles: ['Admin'] }, handler }))
    ).toBe(true);
  });

  it('deja pasar si tiene uno de varios roles admitidos', () => {
    exigir(['Super', 'Admin']);

    expect(
      guard.canActivate(executionContext({ user: { roles: ['Admin'] }, handler }))
    ).toBe(true);
  });

  it('deniega a quien no tiene ninguno de los roles exigidos', () => {
    exigir(['Super']);

    expect(
      guard.canActivate(executionContext({ user: { roles: ['User'] }, handler }))
    ).toBe(false);
  });

  it('deniega a un usuario sin lista de roles', () => {
    exigir(['Admin']);

    expect(guard.canActivate(executionContext({ user: {}, handler }))).toBe(false);
  });

  it('deniega cuando la lista de roles esta vacia', () => {
    exigir(['Admin']);

    expect(
      guard.canActivate(executionContext({ user: { roles: [] }, handler }))
    ).toBe(false);
  });

  it('compara el rol de forma exacta, sin ignorar mayusculas', () => {
    exigir(['Admin']);

    // Si "admin" pasara, cualquier variacion de escritura al guardar un perfil
    // se convertiria en un permiso concedido por accidente.
    expect(
      guard.canActivate(executionContext({ user: { roles: ['admin'] }, handler }))
    ).toBe(false);
  });

  it('lee los roles del manejador, no de la clase', () => {
    const espia = jest.spyOn(reflector, 'get').mockReturnValue(['Admin']);

    guard.canActivate(executionContext({ user: { roles: ['Admin'] }, handler }));

    expect(espia).toHaveBeenCalledWith('roles', handler);
  });

  it('revienta si no hay usuario en la peticion', () => {
    exigir(['Admin']);

    // Documenta el borde real: `RolesGuard` da por hecho que un guardia previo
    // (`AuthGuard('jwt')`) ya planto `request.user`. Usado suelto, sin esa
    // cadena delante, lanza en vez de denegar.
    expect(() => guard.canActivate(executionContext({ user: undefined, handler }))).toThrow();
  });
});
