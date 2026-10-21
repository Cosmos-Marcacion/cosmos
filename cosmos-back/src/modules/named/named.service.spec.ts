import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { NamedService } from './named.service';
import { NamedStoreService } from './named-store.service';
import { NamedRecordService } from './named-record.service';
import { EmployeeService } from '../employee/employee.service';
import { EntryService } from '../entry/entry.service';
import { PointService } from '../point/point.service';
import { AssistantService } from '../assistant/assistant.service';
import { TalkService } from '../talk/talk.service';

jest.mock('../employee/employee.service', () => ({ EmployeeService: class EmployeeService {} }));
jest.mock('../entry/entry.service', () => ({ EntryService: class EntryService {} }));
jest.mock('../point/point.service', () => ({ PointService: class PointService {} }));
jest.mock('../assistant/assistant.service', () => ({
  AssistantService: class AssistantService {},
}));
jest.mock('../talk/talk.service', () => ({ TalkService: class TalkService {} }));

/**
 * `NamedService` es la puerta al sistema externo de nombradas. Lo que se prueba
 * aqui es la disciplina de esa integracion: no pedir un token por peticion, no
 * quedarse con uno caducado, y no dejar que un fallo ajeno se cuele como un
 * error opaco. El resto del backend depende de que esta capa sea previsible.
 */
describe('NamedService', () => {
  let service: NamedService;
  let http: { post: jest.Mock };
  let config: Record<string, unknown>;
  let store: {
    toIsoDate: jest.Mock;
    enumerateDays: jest.Mock;
    getRange: jest.Mock;
    save: jest.Mock;
  };

  /** JWT de mentira con la expiracion pedida (segundos desde epoch). */
  const jwtConExp = (expSegundos: number) => {
    const payload = Buffer.from(JSON.stringify({ exp: expSegundos })).toString('base64url');
    return `cabecera.${payload}.firma`;
  };

  const respuestaToken = (token: string) => of({ data: { token } });

  beforeEach(async () => {
    config = {
      URL_COSMOS: 'https://visma.example/',
      USER_COSMOS: 'usuario',
      PASSWORD_COSMOS: 'clave',
    };
    http = { post: jest.fn(() => respuestaToken('token-plano')) };
    store = {
      toIsoDate: jest.fn((d: string) => d.split('/').reverse().join('-')),
      enumerateDays: jest.fn(() => ['2026-03-09']),
      getRange: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NamedService,
        { provide: HttpService, useValue: http },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((clave: string, def?: unknown) => config[clave] ?? def) },
        },
        { provide: NamedStoreService, useValue: store },
        { provide: NamedRecordService, useValue: {} },
        { provide: EmployeeService, useValue: { findAllLean: jest.fn().mockResolvedValue([]) } },
        { provide: EntryService, useValue: {} },
        { provide: PointService, useValue: {} },
        { provide: AssistantService, useValue: {} },
        { provide: TalkService, useValue: {} },
      ],
    }).compile();

    service = module.get(NamedService);
  });

  describe('getToken', () => {
    it('se autentica con las credenciales del entorno', async () => {
      await service.getToken();

      expect(http.post).toHaveBeenCalledWith('https://visma.example/api/Login/Autenticacion', {
        user: 'usuario',
        password: 'clave',
      });
    });

    it('reutiliza el token en llamadas sucesivas', async () => {
      http.post.mockReturnValue(respuestaToken(jwtConExp(Math.floor(Date.now() / 1000) + 3600)));

      await service.getToken();
      await service.getToken();

      // Antes se pedia uno nuevo en cada metodo publico y la mitad del trafico
      // saliente eran logins.
      expect(http.post).toHaveBeenCalledTimes(1);
    });

    it('lee la expiracion del propio JWT', async () => {
      const dentroDeUnMinuto = Math.floor(Date.now() / 1000) + 30;
      http.post.mockReturnValue(respuestaToken(jwtConExp(dentroDeUnMinuto)));

      await service.getToken();
      await service.getToken();

      // Con 30 s de vida y un margen de seguridad de 60 s, el token ya no vale:
      // se pide otro en vez de mandar uno que el servicio va a rechazar.
      expect(http.post).toHaveBeenCalledTimes(2);
    });

    it('un token sin expiracion legible cae al TTL configurado', async () => {
      config.COSMOS_TOKEN_TTL_MS = 5 * 60 * 1000;
      http.post.mockReturnValue(respuestaToken('esto-no-es-un-jwt'));

      await service.getToken();
      await service.getToken();

      expect(http.post).toHaveBeenCalledTimes(1);
    });

    it('dos peticiones simultaneas comparten un solo login', async () => {
      let resolver: (valor: unknown) => void = () => undefined;
      const pendiente = new Promise((r) => {
        resolver = r;
      });
      http.post.mockReturnValue({
        subscribe: (obs: { next: (v: unknown) => void; complete: () => void }) => {
          void pendiente.then((v) => {
            obs.next(v);
            obs.complete();
          });
          return { unsubscribe: () => undefined };
        },
      });

      const a = service.getToken();
      const b = service.getToken();
      resolver({ data: { token: jwtConExp(Math.floor(Date.now() / 1000) + 3600) } });
      await Promise.all([a, b]);

      // Sin coalescing, un arranque en frio con varias peticiones a la vez
      // dispara un login por cada una.
      expect(http.post).toHaveBeenCalledTimes(1);
    });

    it('un fallo de autenticacion sale como 401, no como 500', async () => {
      http.post.mockReturnValue(throwError(() => new Error('ECONNREFUSED')));

      await expect(service.getToken()).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
      });
    });

    it('un login fallido no deja el hueco de peticion en curso bloqueado', async () => {
      http.post.mockReturnValueOnce(throwError(() => new Error('caido')));

      await service.getToken().catch(() => undefined);
      http.post.mockReturnValue(respuestaToken('token-plano'));

      // Si `tokenInFlight` no se limpiara, todas las llamadas posteriores
      // recibirian para siempre la promesa rechazada del primer intento.
      await expect(service.getToken()).resolves.toMatchObject({ token: 'token-plano' });
    });
  });

  describe('getAllUsers', () => {
    const conLogin = (respuesta: unknown) => {
      http.post
        .mockReturnValueOnce(respuestaToken('token-plano'))
        .mockReturnValueOnce(respuesta as never);
    };

    it('manda el token en la cabecera', async () => {
      conLogin(of({ data: { listUsers: [] } }));

      await service.getAllUsers();

      expect(http.post).toHaveBeenLastCalledWith(
        'https://visma.example/api/Users/ListarUsuarios',
        {},
        { headers: expect.objectContaining({ Authorization: 'Bearer token-plano' }) }
      );
    });

    it('reintenta una vez con token nuevo si el externo responde 401', async () => {
      http.post
        .mockReturnValueOnce(respuestaToken('token-viejo'))
        .mockReturnValueOnce(throwError(() => ({ response: { status: 401 } })))
        .mockReturnValueOnce(respuestaToken('token-nuevo'))
        .mockReturnValueOnce(of({ data: { listUsers: [] } }));

      await service.getAllUsers();

      // Es lo que hace que cachear el token no pueda dejar la integracion
      // atascada: un token rechazado se descarta y se vuelve a intentar.
      expect(http.post).toHaveBeenCalledTimes(4);
    });

    it('no reintenta en bucle si el externo sigue rechazando', async () => {
      http.post
        .mockReturnValueOnce(respuestaToken('token-viejo'))
        .mockReturnValueOnce(throwError(() => ({ response: { status: 401 } })))
        .mockReturnValueOnce(respuestaToken('token-nuevo'))
        .mockReturnValueOnce(throwError(() => ({ response: { status: 401, data: 'no' } })));

      await expect(service.getAllUsers()).rejects.toBeInstanceOf(HttpException);
      expect(http.post).toHaveBeenCalledTimes(4);
    });

    it('un error del externo conserva su codigo de estado', async () => {
      conLogin(throwError(() => ({ response: { status: 422, data: 'rango invalido' } })));

      await expect(service.getAllUsers()).rejects.toMatchObject({ status: 422 });
    });

    it('una peticion que nunca respondio sale como 503', async () => {
      conLogin(throwError(() => ({ request: {} })));

      // Distinguirlo de un 500 importa: dice que el problema esta al otro lado
      // y que reintentar tiene sentido.
      await expect(service.getAllUsers()).rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
    });

    it('cualquier otro fallo sale como 500', async () => {
      conLogin(throwError(() => new Error('algo raro')));

      await expect(service.getAllUsers()).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });
  });

  describe('getNameds', () => {
    const rango = { sInitialDate: '09/03/2026', sFinalDate: '09/03/2026' };

    it('sirve lo guardado sin llamar al externo', async () => {
      store.getRange.mockResolvedValue([{ staff_transmission_id: 9 }]);

      const respuesta = await service.getNameds(rango as never);

      expect(respuesta).toMatchObject({ codigoRespuesta: '0', listStaff: [{ staff_transmission_id: 9 }] });
      expect(http.post).not.toHaveBeenCalled();
    });

    it('un rango guardado pero vacio se reporta como "sin datos", no como fallo', async () => {
      store.getRange.mockResolvedValue([]);

      // Distinguir "no hay nombradas ese dia" de "no se pudo consultar" es lo
      // que evita que la pantalla muestre un error donde solo hay un domingo.
      await expect(service.getNameds(rango as never)).resolves.toMatchObject({
        codigoRespuesta: '1',
        listStaff: [],
      });
    });

    it('si no hay nada guardado consulta el externo y lo guarda', async () => {
      http.post
        .mockReturnValueOnce(respuestaToken('token-plano'))
        .mockReturnValueOnce(of({ data: { listStaff: [{ staff_transmission_id: 9 }] } }));

      await service.getNameds(rango as never);

      expect(store.save).toHaveBeenCalledWith([{ staff_transmission_id: 9 }], ['2026-03-09']);
    });

    it('cachea el rango: dos consultas seguidas no repiten la llamada', async () => {
      http.post
        .mockReturnValueOnce(respuestaToken('token-plano'))
        .mockReturnValue(of({ data: { listStaff: [] } }));

      await service.getNameds(rango as never);
      const llamadasTrasLaPrimera = http.post.mock.calls.length;
      await service.getNameds(rango as never);

      expect(http.post.mock.calls.length).toBe(llamadasTrasLaPrimera);
    });

    it('rangos distintos no comparten entrada de cache', async () => {
      http.post.mockReturnValue(of({ data: { listStaff: [] } }));

      await service.getNameds(rango as never);
      await service.getNameds({ sInitialDate: '10/03/2026', sFinalDate: '10/03/2026' } as never);

      expect(store.getRange).toHaveBeenCalledTimes(2);
    });

    it('un fallo del externo sale como 500 con mensaje propio', async () => {
      http.post
        .mockReturnValueOnce(respuestaToken('token-plano'))
        .mockReturnValueOnce(throwError(() => new Error('timeout')));

      await expect(service.getNameds(rango as never)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });
  });

  describe('formatos de fecha', () => {
    it('formatDate pasa de ISO a dia/mes/ano', () => {
      expect(service.formatDate('2026-03-09')).toBe('09/03/2026');
    });

    it('formatDateToApi pasa de dia/mes/ano a ISO', () => {
      expect(service.formatDateToApi('09/03/2026')).toBe('2026-03-09');
    });

    it('las dos conversiones son inversas', () => {
      expect(service.formatDateToApi(service.formatDate('2026-03-09'))).toBe('2026-03-09');
    });
  });

  describe('getUsers', () => {
    it('pide la proyeccion ligera del maestro de empleados', async () => {
      const employees = service['employeeService'] as unknown as { findAllLean: jest.Mock };

      await service.getUsers();

      // El descriptor facial son 128 flotantes y pesa el 85% del documento; el
      // buscador movil no lo necesita y va por red celular.
      expect(employees.findAllLean).toHaveBeenCalled();
    });
  });

  describe('getUserByDoc', () => {
    it('busca por numero de documento', async () => {
      http.post
        .mockReturnValueOnce(respuestaToken('token-plano'))
        .mockReturnValueOnce(of({ data: { listUsers: [] } }));

      await service.getUserByDoc('12345678');

      expect(http.post).toHaveBeenLastCalledWith(
        'https://visma.example/api/Users/ListarUsuarios/',
        { prDocumentNumber: '12345678' },
        expect.anything()
      );
    });

    it('cualquier fallo sale como 500', async () => {
      http.post
        .mockReturnValueOnce(respuestaToken('token-plano'))
        .mockReturnValueOnce(throwError(() => ({ response: { status: 404 } })));

      await expect(service.getUserByDoc('12345678')).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });
  });
});
