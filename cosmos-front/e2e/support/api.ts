import type { Page, Route } from '@playwright/test';
import type {
  IFormatDefinition,
  IValidationIssue,
} from '../../src/app/modules/formats/interfaces/format-document.interface';
import { CATALOG, ethanolDefinition, granelDefinition } from './definitions';

const API = 'http://localhost:3024/api/v1';
const USER_KEY = 'user-data--cosmos-front-ls';

/** Un tipo de formato tal como lo guarda el servidor. */
interface StoredType {
  published: IFormatDefinition;
  draft: IFormatDefinition | null;
  /** Borrador que quedó por detrás de lo publicado. */
  staleDraft: IFormatDefinition | null;
  issues: IValidationIssue[];
  versions: { version: number; label: string; publishedBy?: string; publishedAt: string }[];
}

/** Fallo programado para la siguiente petición que encaje. */
interface Failure {
  method: string;
  path: string;
  status: number;
  body?: unknown;
  /** Se consume al primer uso; si no, responde siempre. */
  once: boolean;
}

/**
 * Maestro de personal simulado. Todos comparten el apellido con el que buscan
 * las pruebas, para que una sola consulta devuelva lista larga y la lista tenga
 * que desplazarse, que es donde se veía el recorte.
 */
const PERSONAL = Array.from({ length: 12 }, (_, i) => ({
  id: `VSM-${i + 1}`,
  fullName: `GARCIA PERSONA ${String(i + 1).padStart(2, '0')}`,
  document: `4000000${i}`,
  position: '',
  active: true,
}));

/**
 * Empleados del generador de códigos.
 *
 * Llegan desordenados y con tildes a propósito: es como los devuelve la API,
 * por orden de creación. La pantalla tiene que ordenarlos y dejar buscarlos por
 * apellido y por documento, no solo por la inicial del nombre.
 */
const EMPLEADOS = [
  { _id: 'e1', firstName: 'Zoila', lastName: 'Vargas', document: '70000001' },
  { _id: 'e2', firstName: 'Ana María', lastName: 'Ñañez', document: '70000002' },
  { _id: 'e3', firstName: 'Álvaro', lastName: 'Ávila', document: '70000003' },
  { _id: 'e4', firstName: 'Beto', lastName: 'Torres', document: '45123456' },
  { _id: 'e5', firstName: 'Ana', lastName: 'Torres', document: '45999999' },
];

/** PNG de 1x1 transparente: el código generado, sin salir a la red. */
const CODIGO_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/**
 * Usuarios del listado paginado.
 *
 * Son 57 a proposito, que con limite 10 dan seis paginas: la paginacion se
 * quedaba clavada en la pagina uno y con una sola pagina eso no se ve.
 */
const USUARIOS = Array.from({ length: 57 }, (_, i) => ({
  _id: `u${i + 1}`,
  name: `Usuario ${String(i + 1).padStart(2, '0')}`,
  email: `usuario${i + 1}@cosmos.com.pe`,
  role: 'Admin',
}));

/** Perfiles que se pueden dar en el alta de usuarios (CKI02). */
const PERFILES_ASIGNABLES = [
  { _id: '6862b2dd5b6efa7634310d30', name: 'Admin', description: '' },
  { _id: '6862b2dd5b6efa7634310d31', name: 'Supervisor', description: '' },
];

const PUERTOS = [
  { _id: 'pt-callao', name: 'Callao', address: 'Av. Contralmirante Mora' },
  { _id: 'pt-paita', name: 'Paita', address: 'Terminal Portuario de Paita' },
];

const PUNTOS_POR_PUERTO: Record<string, { _id: string; name: string }[]> = {
  'pt-callao': [
    { _id: 'c1', name: '1er Ingreso Muelle' },
    { _id: 'c2', name: 'Salida Muelle' },
  ],
  'pt-paita': [
    { _id: 'q1', name: 'Ingreso Puerto' },
    { _id: 'q2', name: 'Salida Puerto' },
  ],
};

/** Historial de sincronizaciones (CKI11): la ultima con errores. */
const EJECUCIONES_SYNC = [
  {
    _id: 'run2',
    startedAt: '2026-09-18T15:00:00.000Z',
    finishedAt: '2026-09-18T15:00:12.000Z',
    status: 'partial',
    totalProcessed: 120,
    newEmployees: 4,
    existingEmployees: 115,
    errors: ['Error escribiendo usuario: documento duplicado'],
    errorCount: 1,
    failureMessage: '',
    triggeredBy: 'ana@cosmos.com.pe',
  },
  {
    _id: 'run1',
    startedAt: '2026-09-17T13:00:00.000Z',
    finishedAt: '2026-09-17T13:00:10.000Z',
    status: 'success',
    totalProcessed: 116,
    newEmployees: 0,
    existingEmployees: 116,
    errors: [],
    errorCount: 0,
    failureMessage: '',
    triggeredBy: 'ana@cosmos.com.pe',
  },
];

/** Tarjeta del listado de Marcaciones. */
const TARJETA_NOMBRADA = {
  staffTransmissionId: 3541,
  staffVesselId: 3585,
  staffVesselNumber: '3585',
  vesselDescription: 'ECO MARIN',
  voyageNumber: '26038S',
  locationId: 'PAI',
  pierDescription: '2-A',
  workerDate: '18/09/2026',
  workerDateIso: '2026-09-18',
  shiftDescription: '07:00 - 15:00',
  staffCount: 10,
  assistCount: 1,
  formatType: 'granel',
  vesselType: { code: 'GR', description: 'GRANEL', formatType: 'granel', accepted: true, source: 'api' },
  jefeCubierta: null,
  supervisorOperaciones: null,
  supervisorSsoma: null,
  talkType: '',
  talkTopicsCount: 0,
  talksCount: 0,
  lastFormat: null,
  ready: true,
};

/** Catalogos de los filtros del Panel. */
const DASHBOARD_FILTROS = {
  employees: [{ _id: 'emp-1', id: 1001, firstName: 'ANA', lastName: 'PEREZ', document: '40000001' }],
  ships: ['MSC ANNA', 'ECO MARIN'],
  positions: ['ESTIBADOR', 'WINCHERO'],
  nameds: ['3585', '3586'],
};

/** Respuesta del Panel para un rango sin asistencias. */
function dashboardVacio() {
  const serie = { labels: [], data: [] };
  return {
    totalNameds: 0,
    totalEmployees: 0,
    totalAssistances: 0,
    totalTalks: 0,
    totalPersonNameds: 0,
    totalNoAssistances: 0,
    totalAssistancesByNamed: 0,
    chart1Data: { daily: serie, weekly: serie, monthly: serie, yearly: serie },
    chart2Data: [0, 0, 0, 0, 0, 0],
    chart3Data: [],
    chart5Data: { labels: [], values: [] },
    assistancesPage: { data: [], total: 0, page: 1, limit: 10 },
    namedsPage: { data: [], total: 0, page: 1, limit: 10 },
  };
}

/** Nombrada mínima: lo justo para que el detalle pinte y abra sus ventanas. */
function namedDetail() {
  return {
    named: {
      staffTransmissionId: 3541,
      staffVesselId: 880,
      staffVesselNumber: '880',
      vesselDescription: 'NAVE DE PRUEBA',
      voyageNumber: 'V-1',
      locationId: 'PAI',
      pierDescription: 'Muelle 1',
      berthDescription: 'Amarradero A',
      workerDate: '10/09/2026',
      workerDateIso: '2026-09-10',
      shiftDescription: 'Turno 1',
    },
    // El tipo de nave lo envía Cosmos y decide el formato; ya no se elige.
    vesselType: { code: 'GR', description: 'GRANEL', formatType: 'granel', accepted: true, source: 'api' },
    record: null,
    points: [],
    staff: [],
    talks: [],
    summary: {
      staffCount: 0,
      presentCount: 0,
      completedCount: 0,
      pendingCount: 0,
      unregisteredCount: 0,
      talksCount: 0,
      talkTopicsCount: 0,
    },
  };
}

export interface FakeApi {
  types: Record<string, StoredType>;
  /** Todas las peticiones vistas, en orden. */
  calls: { method: string; path: string; body: any }[];
  /** Hace fallar las peticiones que encajen con `path`. */
  fail(method: string, path: string, status: number, body?: unknown, once?: boolean): void;
  /** Cuerpos enviados a un endpoint, para comprobar qué se guardó. */
  bodiesOf(method: string, path: string): any[];
}

function version(n: number, label: string, publishedBy: string, day: number) {
  return {
    version: n,
    label,
    publishedBy,
    publishedAt: `2026-0${day}-12T10:00:00.000Z`,
  };
}

function freshTypes(): Record<string, StoredType> {
  return {
    granel: {
      published: granelDefinition(3),
      draft: null,
      staleDraft: null,
      issues: [],
      versions: [
        version(3, 'Granel', 'Ana Quispe', 5),
        version(2, 'Granel', 'Ana Quispe', 4),
        version(1, 'Granel', 'Carga inicial', 3),
      ],
    },
    ethanol: {
      published: ethanolDefinition(1),
      draft: null,
      staleDraft: null,
      issues: [],
      versions: [version(1, 'Ethanol', 'Carga inicial', 3)],
    },
  };
}

/** Deja la sesión puesta antes de que arranque la aplicación. */
export async function signIn(page: Page, permissions = ['formatos', 'marcaciones']) {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [
      USER_KEY,
      JSON.stringify({
        _id: 'u1',
        name: 'Ana Quispe',
        email: 'ana@cosmos.com.pe',
        access_token: 'token-de-prueba',
        // La sesion real siempre trae el perfil resuelto; sin el, las pantallas
        // que lo leen se comportan distinto que en produccion.
        role: { name: 'Admin', permissions },
        permissions,
      }),
    ]
  );
}

/**
 * Levanta el backend simulado.
 *
 * Guarda estado de verdad: guardar deja borrador, publicar sube la versión y
 * descartar lo borra. Sin eso, la mitad del flujo del maestro —que encadena
 * guardar, publicar y recargar— no se podría comprobar.
 */
export async function mockApi(page: Page): Promise<FakeApi> {
  const api: FakeApi = {
    types: freshTypes(),
    calls: [],
    fail(method, path, status, body, once = false) {
      failures.push({ method, path, status, body, once });
    },
    bodiesOf(method, path) {
      return api.calls
        .filter((call) => call.method === method && call.path.includes(path))
        .map((call) => call.body);
    },
  };
  const failures: Failure[] = [];

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
      },
      body: JSON.stringify(body),
    });

  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const method = request.method();

    // El navegador pregunta antes de mandar `Authorization` a otro origen.
    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS',
        },
        body: '',
      });
    }

    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    let body: any = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = request.postData();
    }
    api.calls.push({ method, path, body });

    const planned = failures.find(
      (failure) => failure.method === method && path.includes(failure.path)
    );
    if (planned) {
      if (planned.once) {
        failures.splice(failures.indexOf(planned), 1);
      }
      return json(route, planned.status, planned.body ?? { message: 'Fallo simulado' });
    }

    const definitions = path.match(/^\/format\/definitions(.*)$/);
    if (definitions) {
      return handleDefinitions(route, method, definitions[1], body, api, json);
    }

    // Maestro de personal. `minLength` imita a Visma real, que no tiene listado
    // y exige tres caracteres: es lo que decide qué mensaje sale en la lista.
    if (path === '/visma/personal') {
      const term = (new URL(request.url()).searchParams.get('search') ?? '').toUpperCase();
      return json(route, 200, {
        source: 'visma',
        minLength: 3,
        data: term.length >= 3 ? PERSONAL.filter((p) => p.fullName.includes(term)) : [],
      });
    }

    // Listado de usuarios, paginado en servidor como el real.
    const usuarios = /^\/user(?:\/except-super)?\/(\d+)\/(\d+)$/.exec(path);
    if (usuarios && method === 'GET') {
      const limite = Number(usuarios[1]);
      const pagina = Number(usuarios[2]);
      const desde = (pagina - 1) * limite;
      // Filtra por nombre o correo como el real: sin esto una busqueda sin
      // coincidencias no se podia probar.
      const termino = (new URL(request.url()).searchParams.get('search') ?? '').toLowerCase();
      const coinciden = termino
        ? USUARIOS.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(termino))
        : USUARIOS;
      return json(route, 200, {
        data: coinciden.slice(desde, desde + limite),
        // El numero de coincidencias, no el tamano de la pagina: el fallo que
        // dejaba la paginacion siempre en 1 estaba justo aqui.
        total: coinciden.length,
        page: pagina,
        limit: limite,
      });
    }

    // Alta de usuarios: perfiles asignables y el alta (multipart).
    if (path === '/user/assignable-roles' && method === 'GET') {
      return json(route, 200, PERFILES_ASIGNABLES);
    }
    if (path === '/user' && method === 'POST') {
      return json(route, 201, { _id: 'u-nuevo' });
    }

    // Puertos y puntos de marcacion. Dos puertos con puntos distintos: es lo
    // que hace falta para comprobar que "Depende de" no mezcla puertos.
    if (/^\/port\/\d+\/\d+$/.test(path) && method === 'GET') {
      return json(route, 200, { data: PUERTOS, total: PUERTOS.length, page: 1, limit: 0 });
    }
    if (path === '/port' && method === 'POST') {
      return json(route, 201, { _id: 'pt-nuevo', ...body });
    }
    const puntosDePuerto = /^\/point\/by-port\/([^/]+)\/\d+\/\d+$/.exec(path);
    if (puntosDePuerto && method === 'GET') {
      const data = PUNTOS_POR_PUERTO[puntosDePuerto[1]] ?? [];
      return json(route, 200, { data, total: data.length, page: 1, limit: 0 });
    }
    if (path === '/point' && method === 'POST') {
      return json(route, 201, { _id: 'p-nuevo', ...body });
    }

    // Recuperacion de cuenta. El correo decide la respuesta: no registrado,
    // servicio de correo caido o envio correcto.
    if (path === '/auth/password/send-code' && method === 'POST') {
      const email = String(body?.email ?? '');
      if (email.startsWith('nadie@')) {
        return json(route, 404, {
          message: 'Este correo no está registrado en Cosmos CheckIn. Revisa que esté bien escrito o pide acceso a un administrador.',
        });
      }
      if (email.startsWith('caido@')) {
        return json(route, 503, {
          message: 'No pudimos enviar el correo con el código. Inténtalo de nuevo en unos minutos; si el problema sigue, contacta a soporte.',
        });
      }
      return json(route, 200, {
        message: 'Te enviamos un código de verificación. Revisa tu bandeja de entrada y la carpeta de spam.',
      });
    }

    // Historial de sincronizaciones de empleados.
    if (path === '/employee/sync-runs' && method === 'GET') {
      return json(route, 200, EJECUCIONES_SYNC);
    }

    // Panel: catalogos de los filtros y una consulta sin asistencias, que es
    // el caso en que los graficos tienen que decir que no hay datos.
    if (path === '/entry/dashboard/filters') {
      return json(route, 200, DASHBOARD_FILTROS);
    }
    if (path === '/entry/dashboard' && method === 'POST') {
      return json(route, 200, dashboardVacio());
    }

    // Generador de códigos: lista de empleados y alta del código.
    if (path === '/employee' && method === 'GET') {
      return json(route, 200, EMPLEADOS);
    }

    if (path === '/generator' && method === 'POST') {
      return json(route, 200, { url: CODIGO_PNG });
    }

    // Marcaciones: una tarjeta de nombrada. La descarga responde un fichero
    // vacio; lo que se prueba es que pulsarla no abra el detalle.
    if (path === '/named/board' && method === 'POST') {
      return json(route, 200, [TARJETA_NOMBRADA]);
    }
    if (/^\/format\/\d+$/.test(path) && method === 'GET') {
      return route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'Content-Disposition',
          'content-disposition': 'attachment; filename="formato.xlsx"',
        },
        contentType: 'application/octet-stream',
        body: '',
      });
    }

    if (path.startsWith('/named/detail/')) {
      return json(route, 200, namedDetail());
    }

    if (path.startsWith('/named/records/')) {
      return json(route, 200, method === 'GET' ? null : body);
    }

    if (path === '/format/pdf/status') {
      return json(route, 200, { ok: false, version: '' });
    }

    if (path === '/format/types') {
      return json(route, 200, [{ id: 'granel', label: 'Granel sólido', capacity: 30 }]);
    }

    // Todo lo demás (menú, avisos, catálogos de otras pantallas) responde vacío.
    return json(route, 200, []);
  });

  return api;
}

function summaries(api: FakeApi) {
  return Object.values(api.types).map((type) => ({
    formatType: type.published.formatType,
    label: type.published.label,
    version: type.published.version,
    hasDraft: !!type.draft || !!type.staleDraft,
  }));
}

function handleDefinitions(
  route: Route,
  method: string,
  rest: string,
  body: any,
  api: FakeApi,
  json: (route: Route, status: number, body: unknown) => Promise<void>
) {
  if (rest === '' || rest === '/') {
    return json(route, 200, summaries(api));
  }
  if (rest === '/catalog') {
    return json(route, 200, CATALOG);
  }

  const [, formatType, ...tail] = rest.split('/');
  const stored = api.types[formatType];
  if (!stored) {
    return json(route, 404, { message: 'No existe ese tipo de formato' });
  }
  const action = tail.join('/');

  if (method === 'GET' && action === '') {
    return json(route, 200, {
      published: stored.published,
      draft: stored.draft ?? stored.published,
      issues: stored.issues,
      staleDraft: stored.staleDraft
        ? {
            baseVersion: stored.staleDraft.version,
            publishedVersion: stored.published.version,
            updatedBy: 'Luis Ramos',
            updatedAt: '2026-04-02T09:00:00.000Z',
          }
        : null,
    });
  }

  if (method === 'PUT' && action === 'draft') {
    stored.draft = body;
    return json(route, 200, { definition: body, issues: stored.issues });
  }

  if (method === 'DELETE' && action === 'draft') {
    stored.draft = null;
    stored.staleDraft = null;
    return json(route, 200, stored.published);
  }

  if (method === 'POST' && action === 'draft/recover') {
    const recovered = stored.staleDraft ?? stored.draft ?? stored.published;
    stored.draft = recovered;
    stored.staleDraft = null;
    return json(route, 200, { draft: recovered, issues: stored.issues });
  }

  if (method === 'POST' && action === 'publish') {
    if (stored.issues.length > 0) {
      return json(route, 400, {
        message: 'La definición no es válida',
        issues: stored.issues,
      });
    }
    const next = { ...(stored.draft ?? stored.published), version: stored.published.version + 1 };
    stored.published = next;
    stored.draft = null;
    stored.versions = [
      {
        version: next.version,
        label: next.label,
        publishedBy: 'Ana Quispe',
        publishedAt: new Date().toISOString(),
      },
      ...stored.versions,
    ];
    return json(route, 200, next);
  }

  if (method === 'POST' && action === 'restore') {
    const next = { ...granelDefinition(stored.published.version + 1) };
    stored.published = { ...next, formatType, label: stored.published.label };
    stored.draft = null;
    stored.versions = [
      {
        version: stored.published.version,
        label: stored.published.label,
        publishedBy: 'Ana Quispe',
        publishedAt: new Date().toISOString(),
      },
      ...stored.versions,
    ];
    return json(route, 200, stored.published);
  }

  if (method === 'POST' && action.startsWith('revert/')) {
    stored.draft = { ...stored.published };
    return json(route, 200, stored.draft);
  }

  if (method === 'GET' && action === 'versions') {
    return json(route, 200, stored.versions);
  }

  if (method === 'GET' && action === 'draft/changes') {
    return json(route, 200, {
      from: stored.published.version,
      to: stored.published.version + 1,
      changes: [
        {
          kind: 'changed',
          scope: 'cell',
          document: 'ATS',
          section: 'SECCIÓN I',
          target: 'NAVE',
          detail: 'NAVE → BUQUE',
        },
      ],
      summary: { added: 0, removed: 0, changed: 1, moved: 0 },
      truncated: false,
    });
  }

  if (method === 'GET' && /^versions\/\d+\/changes$/.test(action)) {
    const asked = Number(action.split('/')[1]);
    const first = asked === Math.min(...stored.versions.map((entry) => entry.version));
    return json(route, 200, {
      from: first ? null : asked - 1,
      to: asked,
      changes: first
        ? []
        : [
            {
              kind: 'added',
              scope: 'section',
              document: 'ATS',
              target: 'Firmas',
            },
          ],
      summary: { added: first ? 0 : 1, removed: 0, changed: 0, moved: 0 },
      truncated: false,
    });
  }

  if (method === 'GET' && /^versions\/\d+$/.test(action)) {
    return json(route, 200, stored.published);
  }

  return json(route, 404, { message: 'Ruta no simulada: ' + rest });
}
