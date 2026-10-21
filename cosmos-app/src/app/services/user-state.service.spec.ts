import { TestBed } from '@angular/core/testing';
import { UserStateService } from './user-state.service';
import { USER_LOCALSTORAGE_KEY } from '../constants/user-localstorage.constant';
import { httpProviders } from '../../testing/setup';

/**
 * La sesion del movil vive en `localStorage`, asi que sobrevive a cerrar la app.
 * Lo que se prueba aqui es la parte que decide si alguien sigue dentro tras
 * reabrirla, y que al salir no queda rastro en el dispositivo, que puede ser
 * compartido entre turnos.
 */
describe('UserStateService', () => {
  const usuario = {
    _id: 'u1',
    name: 'Ana',
    email: 'ana@cosmos.com.pe',
    access_token: 'token.firmado',
  };

  const crear = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: httpProviders() });
    return TestBed.inject(UserStateService);
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('arranca sin usuario', () => {
    expect(crear().getUser()).toBeNull();
  });

  it('guardar deja el usuario disponible', () => {
    const service = crear();

    service.setUser(usuario as never);

    expect(service.getUser()).toEqual(usuario as never);
  });

  it('guardar persiste en el dispositivo', () => {
    crear().setUser(usuario as never);

    expect(JSON.parse(localStorage.getItem(USER_LOCALSTORAGE_KEY)!)).toEqual(usuario);
  });

  it('al reabrir la app se recupera la sesion', () => {
    localStorage.setItem(USER_LOCALSTORAGE_KEY, JSON.stringify(usuario));

    // Es lo que evita que quien marca en el muelle tenga que volver a entrar
    // cada vez que el sistema operativo mata la aplicacion en segundo plano.
    expect(crear().getUser()).toEqual(usuario as never);
  });

  it('clearUser olvida la sesion en memoria pero no la del dispositivo', () => {
    const service = crear();
    service.setUser(usuario as never);

    service.clearUser();

    // Distincion deliberada: `clearUser` es el estado, `logout` es la salida.
    expect(service.getUser()).toBeNull();
    expect(localStorage.getItem(USER_LOCALSTORAGE_KEY)).not.toBeNull();
  });

  it('logout no deja rastro en el dispositivo', () => {
    const service = crear();
    service.setUser(usuario as never);

    service.logout();

    // El movil se pasa entre turnos: un token que sobrevive al cierre de sesion
    // es la sesion de otra persona esperando a ser reabierta.
    expect(service.getUser()).toBeNull();
    expect(localStorage.getItem(USER_LOCALSTORAGE_KEY)).toBeNull();
  });

  it('tras cerrar sesion, reabrir la app no recupera nada', () => {
    const service = crear();
    service.setUser(usuario as never);
    service.logout();

    expect(crear().getUser()).toBeNull();
  });
});
