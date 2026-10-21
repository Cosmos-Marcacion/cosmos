import { EntryService } from './entry.service';

/**
 * Regresiones concretas de los filtros del panel.
 *
 * El síntoma reportado era que al cambiar el turno el panel se quedaba pidiendo
 * y luego mostraba un error. La causa estaba aquí: `getChart4Data` devolvía un
 * arreglo pelado cuando ningún nombrada pasaba el filtro, el cliente leía
 * `res.data` sobre `undefined` y la excepción dejaba el loader colgado. Lo
 * mismo ocurría con las series de los gráficos, que cambiaban de forma al
 * quedarse sin datos.
 *
 * Las pruebas de equivalencia de `entry.service.dashboard.spec.ts` comparan
 * contra una referencia independiente sobre datos al azar; éstas fijan los
 * casos borde con nombres, para que un cambio futuro diga qué se rompió.
 */

const POINTS = [
  { _id: 'point-1', order: 1, nextTolerance: 10, previousTolerance: 5 },
  { _id: 'point-2', order: 2, nextTolerance: 10, previousTolerance: 5 },
];
const START_POINT_ID = 'point-1';
const END_POINT_ID = 'point-2';

const EMPLOYEES: any[] = [
  { _id: 'emp-1', id: 1001, firstName: 'ANA', lastName: 'PEREZ' },
  { _id: 'emp-2', id: 1002, firstName: 'LUIS', lastName: 'GOMEZ' },
];

function detail(staffId: number, position: string) {
  return {
    staff_id: staffId,
    staff_role_type_description: position,
    staff_transmission_detail_id: staffId,
    order_number: 1,
    team_number: 1,
  };
}

/** Dos nombradas el mismo día, en turnos distintos y con naves distintas. */
const NAMEDS: any[] = [
  {
    staff_transmission_id: 2856,
    staff_vessel_id: 2884,
    staff_vessel_number: '0875-1',
    vessel_description: 'CMA CGM VOLTAIRE',
    voyage_number: '0DVMSN1MA',
    location_id: 'PEPAI - TPE',
    pier_description: '2-A',
    worker_date: '10/09/2025',
    shift_description: '07:00 - 15:00',
    listStaffDetail: [detail(1001, 'ESTIBADOR'), detail(1002, 'WINCHERO')],
  },
  {
    staff_transmission_id: 2857,
    staff_vessel_id: 2885,
    staff_vessel_number: '0876-1',
    vessel_description: 'MSC ANNA',
    voyage_number: '0DVMSN2MA',
    location_id: 'PEPAI - TPE',
    pier_description: '3-B',
    worker_date: '10/09/2025',
    shift_description: '15:00 - 23:00',
    listStaffDetail: [detail(1001, 'ESTIBADOR')],
  },
];

/** Ana marca en las dos nombradas del mismo día; Luis sólo en la primera. */
const ENTRIES: any[] = [
  { _id: 'e1', employeeId: 'emp-1', pointId: 'point-1', namedId: 2856, workerDate: '2025-09-10', date: new Date('2025-09-10T06:50:00'), isAbsence: false, isRemate: false },
  { _id: 'e2', employeeId: 'emp-1', pointId: 'point-2', namedId: 2856, workerDate: '2025-09-10', date: new Date('2025-09-10T15:05:00'), isAbsence: false, isRemate: false },
  { _id: 'e3', employeeId: 'emp-2', pointId: 'point-1', namedId: 2856, workerDate: '2025-09-10', date: new Date('2025-09-10T07:30:00'), isAbsence: false, isRemate: false },
  { _id: 'e4', employeeId: 'emp-1', pointId: 'point-1', namedId: 2857, workerDate: '2025-09-10', date: new Date('2025-09-10T14:55:00'), isAbsence: false, isRemate: false },
];

function baseFilters(overrides: any = {}) {
  return {
    startDate: '2025-09-10',
    endDate: '2025-09-10',
    employeeId: '',
    namedId: '',
    position: '',
    ship: '',
    turn: '',
    limit: 10,
    page: 1,
    orderBy: '',
    orderDirection: '',
    ...overrides,
  };
}

describe('EntryService · filtros del panel', () => {
  let service: any;

  beforeEach(() => {
    const configStub = { get: (_key: string, fallback?: any) => fallback };
    service = new (EntryService as any)({}, {}, {}, {}, configStub, {}, {});
  });

  describe('forma de la respuesta cuando ningún nombrada pasa el filtro', () => {
    const filters = baseFilters({ turn: '23:00 - 07:00' });

    it('getChart4Data devuelve el sobre paginado, no un arreglo', () => {
      const result = service.getChart4Data(ENTRIES, filters, NAMEDS, EMPLOYEES, START_POINT_ID, END_POINT_ID);
      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 10 });
    });

    it('getChart1Data conserva las cuatro series con forma { labels, data }', () => {
      const result = service.getChart1Data(ENTRIES, filters, NAMEDS, EMPLOYEES, START_POINT_ID, END_POINT_ID);
      expect(result).toEqual({
        daily: { labels: [], data: [] },
        weekly: { labels: [], data: [] },
        monthly: { labels: [], data: [] },
        yearly: { labels: [], data: [] },
      });
    });

    it('getChart2Data devuelve las seis series del gráfico de marcaciones', () => {
      const result = service.getChart2Data(ENTRIES, filters, NAMEDS, EMPLOYEES, START_POINT_ID, END_POINT_ID, POINTS);
      expect(result).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('getChart3Data devuelve una lista vacía de posiciones', () => {
      expect(service.getChart3Data(ENTRIES, filters, NAMEDS, EMPLOYEES, START_POINT_ID, END_POINT_ID)).toEqual([]);
    });

    it('getChart5Data devuelve etiquetas y valores vacíos', () => {
      expect(service.getChart5Data(ENTRIES, filters, NAMEDS, EMPLOYEES, START_POINT_ID, END_POINT_ID)).toEqual({ labels: [], values: [] });
    });

    it('formatAsistances no devuelve filas', () => {
      const result = service.formatAsistances(ENTRIES, NAMEDS, EMPLOYEES, filters, END_POINT_ID, POINTS.length);
      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 10 });
    });
  });

  describe('filtro de nombrada', () => {
    // El panel envía el `staff_vessel_number` que publica `/dashboard/filters`.
    const filters = baseFilters({ namedId: '0876-1' });

    it('getChart4Data reconoce el staff_vessel_number', () => {
      const result = service.getChart4Data(ENTRIES, filters, NAMEDS, EMPLOYEES, START_POINT_ID, END_POINT_ID);
      expect(result.total).toBe(1);
      expect(result.data[0].number).toBe('2857 - 0876-1');
    });

    it('formatAsistances reconoce el staff_vessel_number', () => {
      const result = service.formatAsistances(ENTRIES, NAMEDS, EMPLOYEES, filters, END_POINT_ID, POINTS.length);
      expect(result.total).toBe(1);
      expect(result.data[0].named).toBe('2857 - 0876-1');
    });
  });

  describe('filtros combinados', () => {
    it('navío y turno se encadenan en lugar de pisarse', () => {
      // MSC ANNA sólo existe en el turno de tarde: navío + turno de mañana no
      // debe devolver nada. Antes el segundo `if` reasignaba desde la lista
      // completa y el navío se perdía.
      const filters = baseFilters({ ship: 'MSC ANNA', turn: '07:00 - 15:00' });
      expect(service.getTotalNames(NAMEDS, filters, EMPLOYEES, ENTRIES)).toEqual([0, 0]);
      expect(service.getChart4Data(ENTRIES, filters, NAMEDS, EMPLOYEES, START_POINT_ID, END_POINT_ID).total).toBe(0);
    });

    it('nombrada y turno se encadenan', () => {
      const filters = baseFilters({ namedId: '0875-1', turn: '15:00 - 23:00' });
      // Antes `getTotalNames` devolvía [1, ...] fijo en cuanto había nombrada.
      expect(service.getTotalNames(NAMEDS, filters, EMPLOYEES, ENTRIES)).toEqual([0, 0]);
    });

    it('el cargo descarta las nombradas sin personal de ese cargo', () => {
      const filters = baseFilters({ position: 'WINCHERO' });
      const result = service.getChart4Data(ENTRIES, filters, NAMEDS, EMPLOYEES, START_POINT_ID, END_POINT_ID);
      expect(result.total).toBe(1);
      expect(result.data[0].number).toBe('2856 - 0875-1');
      // `staffCount` cuenta el personal del cargo filtrado, no la plantilla entera.
      expect(result.data[0].staffCount).toBe(1);
    });
  });

  describe('asistencias por empleado, día y nombrada', () => {
    it('una persona en dos nombradas el mismo día produce dos filas', () => {
      const result = service.formatAsistances(ENTRIES, NAMEDS, EMPLOYEES, baseFilters(), END_POINT_ID, POINTS.length);
      const ana = result.data.filter(row => row.employeeId === 'emp-1');
      expect(ana).toHaveLength(2);
      expect(ana.map(row => row.named).sort()).toEqual(['2856 - 0875-1', '2857 - 0876-1']);
    });

    it('las marcaciones se cuentan por nombrada', () => {
      const result = service.formatAsistances(ENTRIES, NAMEDS, EMPLOYEES, baseFilters(), END_POINT_ID, POINTS.length);
      const jornada = result.data.find(row => row.employeeId === 'emp-1' && row.named === '2856 - 0875-1');
      const remate = result.data.find(row => row.employeeId === 'emp-1' && row.named === '2857 - 0876-1');
      // Dos marcaciones en la primera nombrada, con salida registrada.
      expect(jornada.markings).toBe('2 / 2 -S');
      // Una sola en la segunda, sin salida.
      expect(remate.markings).toBe('1 / 2 ');
    });
  });

  describe('paginación', () => {
    it('getChart4Data ordena antes de cortar la página', () => {
      const nameds = [
        { ...NAMEDS[0], staff_transmission_id: 3001, staff_vessel_number: 'A', worker_date: '01/09/2025' },
        { ...NAMEDS[0], staff_transmission_id: 3002, staff_vessel_number: 'B', worker_date: '15/09/2025' },
        { ...NAMEDS[0], staff_transmission_id: 3003, staff_vessel_number: 'C', worker_date: '09/09/2025' },
      ];
      const page1 = service.getChart4Data([], baseFilters({ limit: 1, page: 1 }), nameds, EMPLOYEES, START_POINT_ID, END_POINT_ID);
      const page2 = service.getChart4Data([], baseFilters({ limit: 1, page: 2 }), nameds, EMPLOYEES, START_POINT_ID, END_POINT_ID);
      const page3 = service.getChart4Data([], baseFilters({ limit: 1, page: 3 }), nameds, EMPLOYEES, START_POINT_ID, END_POINT_ID);
      // Más reciente primero, y `dd/mm/aaaa` comparado como fecha, no como texto.
      expect([page1, page2, page3].map(page => page.data[0].date)).toEqual(['15/09/2025', '09/09/2025', '01/09/2025']);
      expect(page1.total).toBe(3);
    });

    it('formatAsistances aplica orderBy antes de cortar la página', () => {
      const ascending = service.formatAsistances(
        ENTRIES, NAMEDS, EMPLOYEES,
        baseFilters({ orderBy: 'employee', orderDirection: 'asc', limit: 1, page: 1 }),
        END_POINT_ID,
        POINTS.length
      );
      const descending = service.formatAsistances(
        ENTRIES, NAMEDS, EMPLOYEES,
        baseFilters({ orderBy: 'employee', orderDirection: 'desc', limit: 1, page: 1 }),
        END_POINT_ID,
        POINTS.length
      );
      expect(ascending.data[0].employee).toBe('ANA PEREZ');
      expect(descending.data[0].employee).toBe('LUIS GOMEZ');
    });
  });
});
