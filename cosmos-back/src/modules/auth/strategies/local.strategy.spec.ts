import { UnauthorizedException } from '@nestjs/common';
import { LocalStrategy } from './local.strategy';
import { AuthService } from '../auth.service';

describe('LocalStrategy', () => {
  let strategy: LocalStrategy;
  let auth: { validateUser: jest.Mock };

  beforeEach(() => {
    auth = { validateUser: jest.fn() };
    strategy = new LocalStrategy(auth as unknown as AuthService);
  });

  it('devuelve el usuario cuando las credenciales son correctas', async () => {
    auth.validateUser.mockResolvedValue({ email: 'ana@cosmos.com.pe' });

    await expect(strategy.validate('ana@cosmos.com.pe', 'Secreta123')).resolves.toEqual({
      email: 'ana@cosmos.com.pe',
    });
  });

  it('pasa correo y contrasena en ese orden', async () => {
    auth.validateUser.mockResolvedValue({ email: 'ana@cosmos.com.pe' });

    await strategy.validate('ana@cosmos.com.pe', 'Secreta123');

    // Invertidos, la validacion buscaria un usuario cuyo correo es la
    // contrasena: siempre fallaria, y el sintoma seria "no puedo entrar" sin
    // ninguna pista de por que.
    expect(auth.validateUser).toHaveBeenCalledWith('ana@cosmos.com.pe', 'Secreta123');
  });

  it('rechaza con 401 cuando las credenciales no valen', async () => {
    auth.validateUser.mockResolvedValue(null);

    await expect(strategy.validate('ana@cosmos.com.pe', 'mala')).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('el rechazo no dice si el fallo fue el correo o la contrasena', async () => {
    auth.validateUser.mockResolvedValue(null);

    // Un mensaje que distinga los dos casos convierte el login en un
    // comprobador de que correos estan registrados.
    await expect(strategy.validate('nadie@cosmos.com.pe', 'x')).rejects.toMatchObject({
      message: 'Unauthorized',
    });
  });

  it('propaga un fallo de la base en vez de convertirlo en un 401', async () => {
    auth.validateUser.mockRejectedValue(new Error('mongo caido'));

    // Devolver 401 ante una caida de la base le diria a quien intenta entrar
    // que sus credenciales estan mal, que no es cierto.
    await expect(strategy.validate('ana@cosmos.com.pe', 'Secreta123')).rejects.toThrow(
      'mongo caido'
    );
  });
});
