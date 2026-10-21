import { of, throwError } from 'rxjs';
import { NamedService } from './named.service';

/**
 * Comprueba el ahorro de llamadas al servicio externo y, sobre todo, que
 * cachear el token no puede dejar la integración en un estado inválido: si el
 * token guardado deja de ser aceptado, se descarta y se vuelve a autenticar.
 */

const LOGIN_URL = 'https://cosmos.example/api/Login/Autenticacion';
const NAMEDS_URL = 'https://cosmos.example/api/Users/ListarNombradas';
const USERS_URL = 'https://cosmos.example/api/Users/ListarUsuarios';

/**
 * JWT sin firmar con la expiración indicada; sólo se lee el `exp` del payload.
 * El `jti` correlativo hace distinguible cada token emitido.
 */
let jwtCounter = 0;
function fakeJwt(expiresInSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    jti: ++jwtCounter,
  })).toString('base64url');
  return `header.${payload}.signature`;
}

interface HarnessOptions {
  tokenTtlSeconds?: number;
  namedsResponse?: any;
  /** Devuelve un error para la enésima llamada autenticada (1 = la primera). */
  failAuthenticatedCall?: number;
}

function createHarness(options: HarnessOptions = {}) {
  const calls: string[] = [];
  const tokens: string[] = [];
  let authenticatedCalls = 0;

  const httpService: any = {
    post: (url: string, body: any, config?: any) => {
      calls.push(url);
      if (url === LOGIN_URL) {
        const token = fakeJwt(options.tokenTtlSeconds ?? 3600);
        tokens.push(token);
        return of({ data: { token } });
      }
      authenticatedCalls++;
      if (options.failAuthenticatedCall === authenticatedCalls) {
        return throwError(() => ({ response: { status: 401, data: 'token vencido' } }));
      }
      if (url === USERS_URL) {
        return of({ data: { listUsers: [] } });
      }
      return of({
        data: options.namedsResponse ?? { codigoRespuesta: '0', descripcionResp: 'OK', listStaff: [] },
        headers: config?.headers,
      });
    },
  };

  const configService: any = {
    get: (key: string, fallback?: any) => {
      if (key === 'URL_COSMOS') return 'https://cosmos.example/';
      if (key === 'USER_COSMOS') return 'usuario';
      if (key === 'PASSWORD_COSMOS') return 'clave';
      if (key === 'NAMEDS_CACHE_TTL_MS') return 60000;
      return fallback;
    },
  };

  // Copia local desactivada: aquí se mide sólo el efecto de las cachés en memoria.
  const namedStore: any = {
    isEnabled: () => false,
    toIsoDate: () => null,
    enumerateDays: () => null,
    getRange: async () => null,
    save: async () => undefined,
  };

  // Ficha de nombrada: aquí no interviene, sólo se mide el efecto de las cachés.
  const namedRecordService: any = {
    findManyByIds: async () => [],
    findOne: async () => null,
  };

  const service = new NamedService(
    httpService,
    configService,
    namedStore,
    namedRecordService,
    {} as any, {} as any, {} as any, {} as any, {} as any
  );

  return {
    service,
    calls,
    tokens,
    logins: () => calls.filter(url => url === LOGIN_URL).length,
    namedsCalls: () => calls.filter(url => url === NAMEDS_URL).length,
  };
}

describe('NamedService · caché de token y de nombradas', () => {
  it('reutiliza el token en llamadas sucesivas en lugar de autenticarse cada vez', async () => {
    const harness = createHarness();

    await harness.service.getNameds({ sInitialDate: '01/08/2026', sFinalDate: '01/08/2026' });
    await harness.service.getNameds({ sInitialDate: '02/08/2026', sFinalDate: '02/08/2026' });
    await harness.service.getAllUsers();

    expect(harness.logins()).toBe(1);
    expect(harness.namedsCalls()).toBe(2);
  });

  it('sirve de caché el mismo rango de fechas sin volver a llamar al servicio externo', async () => {
    const harness = createHarness();

    await harness.service.getNameds({ sInitialDate: '01/08/2026', sFinalDate: '05/08/2026' });
    await harness.service.getNameds({ sInitialDate: '01/08/2026', sFinalDate: '05/08/2026' });
    await harness.service.getNameds({ sInitialDate: '01/08/2026', sFinalDate: '05/08/2026' });

    expect(harness.namedsCalls()).toBe(1);
    expect(harness.logins()).toBe(1);
  });

  it('agrupa las peticiones concurrentes del mismo rango en una sola llamada', async () => {
    const harness = createHarness();

    await Promise.all([
      harness.service.getNameds({ sInitialDate: '01/08/2026', sFinalDate: '05/08/2026' }),
      harness.service.getNameds({ sInitialDate: '01/08/2026', sFinalDate: '05/08/2026' }),
      harness.service.getNameds({ sInitialDate: '01/08/2026', sFinalDate: '05/08/2026' }),
      harness.service.getNameds({ sInitialDate: '01/08/2026', sFinalDate: '05/08/2026' }),
    ]);

    expect(harness.namedsCalls()).toBe(1);
    expect(harness.logins()).toBe(1);
  });

  it('distingue rangos de fechas distintos', async () => {
    const harness = createHarness();

    await harness.service.getNameds({ sInitialDate: '01/08/2026', sFinalDate: '05/08/2026' });
    await harness.service.getNameds({ sInitialDate: '01/08/2026', sFinalDate: '06/08/2026' });

    expect(harness.namedsCalls()).toBe(2);
  });

  it('devuelve la respuesta del servicio externo tal cual', async () => {
    const namedsResponse = {
      codigoRespuesta: '0',
      descripcionResp: 'OK',
      listStaff: [{ staff_transmission_id: 2856, listStaffDetail: [] }],
    };
    const harness = createHarness({ namedsResponse });

    const result = await harness.service.getNameds({ sInitialDate: '01/08/2026', sFinalDate: '01/08/2026' });

    expect(result).toEqual(namedsResponse);
  });

  it('descarta el token y reintenta cuando el servicio externo lo rechaza', async () => {
    const harness = createHarness({ failAuthenticatedCall: 2 });

    await harness.service.getNameds({ sInitialDate: '01/08/2026', sFinalDate: '01/08/2026' });
    const result = await harness.service.getNameds({ sInitialDate: '02/08/2026', sFinalDate: '02/08/2026' });

    // Un login inicial más el que provoca el reintento tras el 401.
    expect(harness.logins()).toBe(2);
    expect(harness.tokens[0]).not.toBe(harness.tokens[1]);
    expect(result).toBeDefined();
  });

  it('vuelve a autenticarse cuando el token está a punto de expirar', async () => {
    // 30 segundos de vida, por debajo del margen de seguridad de 60.
    const harness = createHarness({ tokenTtlSeconds: 30 });

    await harness.service.getNameds({ sInitialDate: '01/08/2026', sFinalDate: '01/08/2026' });
    await harness.service.getNameds({ sInitialDate: '02/08/2026', sFinalDate: '02/08/2026' });

    expect(harness.logins()).toBe(2);
  });

  it('refreshNamedsRange ignora la caché y fuerza la lectura del servicio externo', async () => {
    const harness = createHarness();

    await harness.service.getNameds({ sInitialDate: '01/08/2026', sFinalDate: '01/08/2026' });
    await harness.service.refreshNamedsRange({ sInitialDate: '01/08/2026', sFinalDate: '01/08/2026' });
    expect(harness.namedsCalls()).toBe(2);

    // Además invalida la entrada, de modo que la siguiente lectura es fresca.
    await harness.service.getNameds({ sInitialDate: '01/08/2026', sFinalDate: '01/08/2026' });
    expect(harness.namedsCalls()).toBe(3);
  });
});
