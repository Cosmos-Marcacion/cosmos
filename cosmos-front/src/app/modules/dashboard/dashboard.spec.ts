import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';

import Dashboard, { EXPORT_MAX_ROWS, exportLimit } from './dashboard';
import { DashboardService } from './services/dashboard.service';
import { LoaderService } from '../../services/loader.service';
import {
  IDashboardFilters,
  IDashboardResponse,
} from './interfaces/dashboard.interface';

function response(overrides: Partial<IDashboardResponse> = {}): IDashboardResponse {
  return {
    totalNameds: 3,
    totalEmployees: 2,
    totalAssistances: 4,
    totalTalks: 1,
    totalPersonNameds: 5,
    totalNoAssistances: 0,
    totalAssistancesByNamed: 2,
    chart1Data: {
      daily: { labels: ['2025-09-10'], data: [4] },
      weekly: { labels: ['2025-W37'], data: [4] },
      monthly: { labels: ['2025-09'], data: [4] },
      yearly: { labels: ['2025'], data: [4] },
    },
    chart2Data: [1, 1, 1, 1, 0, 0],
    chart3Data: [{ position: 'ESTIBADOR', assistances: 4 }],
    chart5Data: { labels: ['07:00 - 15:00'], values: [4] },
    assistancesPage: {
      data: [{ employee: 'ANA PEREZ', markings: '2 / 8 -S' }] as any,
      total: 1,
      page: 1,
      limit: 10,
    },
    namedsPage: {
      data: [{ number: '2856 - 0875-1', date: '10/09/2025' }] as any,
      total: 1,
      page: 1,
      limit: 10,
    },
    ...overrides,
  };
}

const FILTERS: IDashboardFilters = {
  employeeId: '',
  ship: '',
  position: '',
  turn: '07:00 - 15:00',
  namedId: '',
  startDate: '2025-09-10',
  endDate: '2025-09-10',
};

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;
  let serviceStub: {
    getDashboard: jasmine.Spy;
    getDashboardAssistances: jasmine.Spy;
    getDashboardNameds: jasmine.Spy;
    getDashboardFilters: jasmine.Spy;
  };
  let loaderHide: jasmine.Spy;

  function setUp(dashboardImpl?: jasmine.Spy) {
    serviceStub = {
      getDashboard: dashboardImpl ?? jasmine.createSpy('getDashboard').and.returnValue(of(response())),
      getDashboardAssistances: jasmine
        .createSpy('getDashboardAssistances')
        .and.returnValue(of({ data: [], total: 0, page: 1, limit: 10 })),
      getDashboardNameds: jasmine
        .createSpy('getDashboardNameds')
        .and.returnValue(of({ data: [], total: 0, page: 1, limit: 10 })),
      // El componente de filtros, hijo real, pide los catálogos al arrancar.
      getDashboardFilters: jasmine
        .createSpy('getDashboardFilters')
        .and.returnValue(of({ employees: [], ships: [], positions: [], nameds: [] })),
    };
    loaderHide = jasmine.createSpy('hide');

    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DashboardService, useValue: serviceStub },
        { provide: LoaderService, useValue: { show: () => {}, hide: loaderHide, isLoading: () => false } },
      ],
    });
    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('una búsqueda es una sola petición', () => {
    setUp();
    serviceStub.getDashboard.calls.reset();
    serviceStub.getDashboardAssistances.calls.reset();
    serviceStub.getDashboardNameds.calls.reset();

    component.search(FILTERS);

    expect(serviceStub.getDashboard).toHaveBeenCalledTimes(1);
    // Las tablas vienen dentro de la misma respuesta.
    expect(serviceStub.getDashboardAssistances).not.toHaveBeenCalled();
    expect(serviceStub.getDashboardNameds).not.toHaveBeenCalled();
  });

  it('pinta las dos tablas con la primera página de la respuesta', () => {
    setUp();
    component.search(FILTERS);

    expect(component.assistancesData.length).toBe(1);
    expect(component.assistancesTotal).toBe(1);
    expect(component.namedsData.length).toBe(1);
    expect(component.namedsTotal).toBe(1);
  });

  it('libera el loader cuando la consulta falla', () => {
    setUp(jasmine.createSpy('getDashboard').and.returnValue(throwError(() => new Error('500'))));
    loaderHide.calls.reset();

    component.search(FILTERS);

    expect(component.loading).toBeFalse();
    expect(loaderHide).toHaveBeenCalled();
    expect(component.error).toBeTruthy();
  });

  it('un fallo deja el panel en cero, no con los datos anteriores', () => {
    const source = new Subject<IDashboardResponse>();
    setUp();
    component.search(FILTERS);
    expect(component.dashboardResponse.totalAssistances).toBe(4);

    serviceStub.getDashboard.and.returnValue(source);
    component.search(FILTERS);
    source.error(new Error('500'));

    expect(component.dashboardResponse.totalAssistances).toBe(0);
    expect(component.assistancesData).toEqual([]);
    expect(component.namedsData).toEqual([]);
  });

  it('una búsqueda nueva cancela la anterior y gana la última', () => {
    const first = new Subject<IDashboardResponse>();
    const second = new Subject<IDashboardResponse>();
    // La primera respuesta la consume la búsqueda automática del montaje.
    setUp(jasmine.createSpy('getDashboard').and.returnValues(of(response()), first, second));

    component.search({ ...FILTERS, turn: '07:00 - 15:00' });
    component.search({ ...FILTERS, turn: '23:00 - 07:00' });

    // La primera respuesta llega tarde: ya nadie la escucha.
    first.next(response({ totalAssistances: 111 }));
    second.next(response({ totalAssistances: 222 }));

    expect(component.dashboardResponse.totalAssistances).toBe(222);
  });

  it('resetea la paginación al buscar', () => {
    setUp();
    component.assistancesPage = 4;
    component.namedsPage = 7;

    component.search(FILTERS);

    expect(component.assistancesPage).toBe(1);
    expect(component.namedsPage).toBe(1);
  });

  it('cambiar de página sólo pide esa tabla', () => {
    setUp();
    component.search(FILTERS);
    serviceStub.getDashboard.calls.reset();

    component.onAssistancesPageChange({ page: 2, limit: 10 });

    expect(serviceStub.getDashboard).not.toHaveBeenCalled();
    expect(serviceStub.getDashboardAssistances).toHaveBeenCalledTimes(1);
    expect(serviceStub.getDashboardAssistances.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ page: 2, limit: 10, turn: '07:00 - 15:00' })
    );
  });

  it('una serie sin datos no rompe el gráfico', () => {
    setUp(
      jasmine.createSpy('getDashboard').and.returnValue(
        of(response({ chart1Data: {} as any }))
      )
    );
    component.search(FILTERS);

    expect(component.getChart1DataForSelectedPeriod()).toEqual({ labels: [], data: [] });
  });

  // CKI08: un rango sin asistencias pintaba ejes vacíos.
  it('los gráficos sin datos muestran un mensaje en vez del lienzo', () => {
    const vacia = response({
      chart1Data: {
        daily: { labels: [], data: [] },
        weekly: { labels: [], data: [] },
        monthly: { labels: [], data: [] },
        yearly: { labels: [], data: [] },
      },
      chart2Data: [0, 0, 0, 0, 0, 0],
      chart3Data: [],
      chart5Data: { labels: [], values: [] },
    });
    setUp(jasmine.createSpy('getDashboard').and.returnValue(of(vacia)));
    component.search(FILTERS);
    fixture.detectChanges();

    expect(component.chartHasData).toEqual({ bar: false, pie: false, positions: false, turns: false });
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('.chart-empty').length).toBe(4);
    expect(host.querySelector('.chart-empty')!.textContent).toContain('Sin asistencias');
  });

  it('con datos se pintan los gráficos', () => {
    setUp();
    component.search(FILTERS);
    fixture.detectChanges();

    expect(component.chartHasData).toEqual({ bar: true, pie: true, positions: true, turns: true });
    expect(fixture.nativeElement.querySelectorAll('.chart-empty').length).toBe(0);
  });

  it('el Excel describe el rango y los filtros de la consulta', () => {
    setUp();
    component.search({ ...FILTERS, ship: 'MSC ANNA', namedId: '0875-1' });

    const filters = component.excelConfigAssistances.filters as Record<string, any>;
    expect(filters['Período']).toBe('2025-09-10 a 2025-09-10');
    expect(filters['Navío']).toBe('MSC ANNA');
    expect(filters['Nombrada']).toBe('0875-1');
    expect(filters['Turno']).toBe('07:00 - 15:00');
  });
});

describe('exportLimit', () => {
  it('pide todo el resultado', () => {
    expect(exportLimit(250)).toBe(250);
  });

  it('no pasa del tope que admite la API', () => {
    // Por encima de 100000 `DashboardDto` responde 400 y no se descargaba nada.
    expect(exportLimit(250000)).toBe(EXPORT_MAX_ROWS);
  });

  it('sin total conocido usa un tope razonable', () => {
    expect(exportLimit(0)).toBe(10000);
  });
});
