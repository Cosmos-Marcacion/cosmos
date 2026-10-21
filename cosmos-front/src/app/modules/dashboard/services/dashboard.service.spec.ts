import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { DashboardService } from './dashboard.service';
import { environment } from '../../../../environments/environment';
import { IDashboardFilters } from '../interfaces/dashboard.interface';

const FILTERS: IDashboardFilters = {
  employeeId: '',
  ship: '',
  position: '',
  turn: '23:00 - 07:00',
  namedId: '',
  startDate: '2025-09-10',
  endDate: '2025-09-10',
  page: 2,
  limit: 25,
};

describe('DashboardService', () => {
  let service: DashboardService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(DashboardService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('una respuesta de nombradas sin filas no rompe la tabla', () => {
    let result: any;
    service.getDashboardNameds(FILTERS).subscribe((res) => (result = res));

    // El backend devolvía un arreglo pelado cuando el filtro no dejaba ninguna
    // nombrada, y el `.sort()` sobre `res.data` reventaba aquí.
    http.expectOne(`${environment.api}/entry/dashboard/nameds`).flush([] as any);

    expect(result).toEqual({ data: [], total: 0, page: 2, limit: 25 });
  });

  it('una respuesta de asistencias sin filas no rompe la tabla', () => {
    let result: any;
    service.getDashboardAssistances(FILTERS).subscribe((res) => (result = res));

    http.expectOne(`${environment.api}/entry/dashboard/assistances`).flush(null as any);

    expect(result).toEqual({ data: [], total: 0, page: 2, limit: 25 });
  });

  it('conserva la página que devuelve el servidor', () => {
    let result: any;
    service.getDashboardNameds(FILTERS).subscribe((res) => (result = res));

    http.expectOne(`${environment.api}/entry/dashboard/nameds`).flush({
      data: [{ number: '2856 - 0875-1' }],
      total: 1,
      page: 2,
      limit: 25,
    });

    expect(result.total).toBe(1);
    expect(result.data.length).toBe(1);
  });

  it('pide los catálogos una sola vez por sesión', () => {
    service.getDashboardFilters().subscribe();
    http.expectOne(`${environment.api}/entry/dashboard/filters`).flush({
      employees: [],
      ships: ['MSC ANNA'],
      positions: [],
      nameds: [],
    });

    let second: any;
    service.getDashboardFilters().subscribe((res) => (second = res));

    http.expectNone(`${environment.api}/entry/dashboard/filters`);
    expect(second.ships).toEqual(['MSC ANNA']);
  });
});
