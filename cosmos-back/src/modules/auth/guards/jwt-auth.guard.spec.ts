import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { executionContext } from '../../../testing';

/**
 * `JwtAuthGuard` es el guardia por defecto de los controladores que lo declaran:
 * exige token salvo que el endpoint este marcado `@Public()`.
 *
 * El caso que importa es el negativo. Si `isPublic` se leyera mal —del sitio
 * equivocado, o con la clave equivocada—, un endpoint privado quedaria abierto
 * y nada en la aplicacion lo delataria.
 */
describe('JwtAuthGuard', () => {
  let reflector: Reflector;
  let guard: JwtAuthGuard;

  const handler = () => undefined;
  const cls = class Controlador {};

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  it('deja pasar sin token un endpoint marcado como publico', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    expect(guard.canActivate(executionContext({ handler, cls }))).toBe(true);
  });

  it('un endpoint publico no llega a validar el token', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const passport = jest
      .spyOn(AuthGuard('jwt').prototype, 'canActivate')
      .mockReturnValue(true);

    guard.canActivate(executionContext({ handler, cls }));

    expect(passport).not.toHaveBeenCalled();
  });

  it('sin la marca publica delega en la validacion del token', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const passport = jest
      .spyOn(AuthGuard('jwt').prototype, 'canActivate')
      .mockReturnValue(true);

    guard.canActivate(executionContext({ handler, cls }));

    expect(passport).toHaveBeenCalled();
  });

  it('la marca en false tampoco abre el endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const passport = jest
      .spyOn(AuthGuard('jwt').prototype, 'canActivate')
      .mockReturnValue(true);

    guard.canActivate(executionContext({ handler, cls }));

    expect(passport).toHaveBeenCalled();
  });

  it('propaga el rechazo de la validacion del token', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    jest.spyOn(AuthGuard('jwt').prototype, 'canActivate').mockReturnValue(false);

    expect(guard.canActivate(executionContext({ handler, cls }))).toBe(false);
  });

  it('busca la marca en el metodo y en el controlador, con esa precedencia', () => {
    const espia = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    guard.canActivate(executionContext({ handler, cls }));

    // `getAllAndOverride` hace que un `@Public()` en el metodo gane sobre el
    // controlador; con `getAll` la marca del controlador no se podria acotar.
    expect(espia).toHaveBeenCalledWith(IS_PUBLIC_KEY, [handler, cls]);
  });
});
