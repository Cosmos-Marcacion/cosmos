import { JwtStrategy } from './jwt.strategy';

/**
 * `validate` es lo que convierte el contenido del token en el `request.user`
 * que leen los dos guardias de autorizacion. Lo que salga de aqui es, a todos
 * los efectos, la identidad de quien pide.
 */
describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    strategy = new JwtStrategy();
  });

  it('traduce el contenido del token al usuario de la peticion', async () => {
    await expect(
      strategy.validate({
        userId: '6862b2dd5b6efa7634310d2f',
        email: 'ana@cosmos.com.pe',
        roles: ['Admin'],
        permissions: ['puertos'],
      })
    ).resolves.toEqual({
      _id: '6862b2dd5b6efa7634310d2f',
      email: 'ana@cosmos.com.pe',
      roles: ['Admin'],
      permissions: ['puertos'],
    });
  });

  it('un token sin permisos da una lista vacia, no undefined', async () => {
    const usuario = await strategy.validate({
      userId: 'u1',
      email: 'ana@cosmos.com.pe',
      roles: ['Admin'],
    });

    // `ModuleGuard` hace `permissions.includes(...)`. Con `undefined` reventaria
    // en cada peticion de quien tenga un token emitido antes de que existieran
    // los perfiles, en vez de simplemente denegarle el modulo.
    expect(usuario.permissions).toEqual([]);
  });

  it('una lista de permisos vacia se respeta tal cual', async () => {
    const usuario = await strategy.validate({ userId: 'u1', email: 'a@b.pe', permissions: [] });

    expect(usuario.permissions).toEqual([]);
  });

  it('no arrastra al usuario campos extra que vengan en el token', async () => {
    const usuario = await strategy.validate({
      userId: 'u1',
      email: 'ana@cosmos.com.pe',
      roles: ['User'],
      permissions: [],
      isSuperAdmin: true,
      iat: 1,
      exp: 2,
    });

    // El token lo firma el servidor, pero acotar lo que se copia evita que un
    // campo nuevo en el payload se convierta sin querer en una propiedad que
    // algun guardia futuro consulte.
    expect(Object.keys(usuario).sort()).toEqual(['_id', 'email', 'permissions', 'roles']);
  });

  it('el identificador del usuario sale de userId, no de sub', async () => {
    const usuario = await strategy.validate({ userId: 'u1', sub: 'otro', email: 'a@b.pe' });

    expect(usuario._id).toBe('u1');
  });
});
