import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { of, throwError } from 'rxjs';

import { DashboardFilters } from './dashboard-filters';
import { DashboardService } from '../services/dashboard.service';
import { IDashboardFilters } from '../interfaces/dashboard.interface';

const CATALOGS = {
  employees: [
    { _id: 'emp-1', id: 1001, firstName: 'ANA', lastName: 'PEREZ' },
    { _id: 'emp-2', id: 1002, firstName: 'LUIS', lastName: 'GOMEZ' },
  ] as any[],
  ships: ['CMA CGM VOLTAIRE', 'MSC ANNA'],
  positions: ['ESTIBADOR', 'WINCHERO'],
  nameds: ['0875-1', '0876-1'],
};

describe('DashboardFilters', () => {
  let component: DashboardFilters;
  let fixture: ComponentFixture<DashboardFilters>;
  let emitted: IDashboardFilters[];

  function setUp(catalogs: any = of(CATALOGS)) {
    TestBed.configureTestingModule({
      imports: [DashboardFilters],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: DashboardService,
          useValue: { getDashboardFilters: () => catalogs },
        },
      ],
    });
    fixture = TestBed.createComponent(DashboardFilters);
    component = fixture.componentInstance;
    emitted = [];
    component.searchEvent.subscribe((filters) => emitted.push(filters));
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('consulta una sola vez al cargar', () => {
    setUp();
    expect(emitted.length).toBe(1);
  });

  it('cambiar un filtro no dispara la consulta', () => {
    setUp();
    component.turn = '15:00 - 23:00';
    component.selectShip('MSC ANNA');
    component.selectNamed('0875-1');
    component.selectEmployee(CATALOGS.employees[0]);
    component.startDate = '2025-09-01';
    component.validateDates();

    // La carga inicial y nada más: el botón es el único disparador.
    expect(emitted.length).toBe(1);
  });

  it('el botón emite todos los filtros juntos', () => {
    setUp();
    component.turn = '15:00 - 23:00';
    component.selectShip('MSC ANNA');
    component.selectNamed('0876-1');
    component.selectPosition('WINCHERO');
    component.selectEmployee(CATALOGS.employees[1]);
    component.startDate = '2025-09-01';
    component.endDate = '2025-09-30';

    component.search();

    expect(emitted.length).toBe(2);
    expect(emitted[1]).toEqual({
      employeeId: 'emp-2',
      startDate: '2025-09-01',
      endDate: '2025-09-30',
      ship: 'MSC ANNA',
      position: 'WINCHERO',
      turn: '15:00 - 23:00',
      namedId: '0876-1',
    });
  });

  it('la nombrada se emite como staff_vessel_number', () => {
    setUp();
    component.selectNamed('0875-1');
    component.search();
    expect(emitted[1].namedId).toBe('0875-1');
  });

  it('no consulta con un rango de fechas invertido', () => {
    setUp();
    component.startDate = '2025-09-30';
    component.endDate = '2025-09-01';

    component.search();

    expect(emitted.length).toBe(1);
    expect(component.dateError).toBeTruthy();
    expect(component.isValid).toBeFalse();
  });

  it('no consulta mientras hay una consulta en curso', () => {
    setUp();
    component.loading = true;
    component.search();
    expect(emitted.length).toBe(1);
  });

  it('vaciar el buscador de empleado descarta la selección', () => {
    setUp();
    component.selectEmployee(CATALOGS.employees[0]);
    expect(component.employeeId).toBe('emp-1');

    component.keywords.employee = '';
    component.getEmployees();

    expect(component.employeeId).toBe('');
  });

  it('Limpiar deja los filtros vacíos y consulta', () => {
    setUp();
    component.turn = '15:00 - 23:00';
    component.selectShip('MSC ANNA');
    component.selectEmployee(CATALOGS.employees[0]);

    component.clear();

    expect(component.turn).toBe('');
    expect(component.ship).toBe('');
    expect(component.employeeId).toBe('');
    expect(component.activeCount).toBe(0);
    expect(emitted.length).toBe(2);
    expect(emitted[1].turn).toBe('');
  });

  // CKI14: el test anterior solo mira el modelo. Lo reportado es lo que queda
  // escrito en los campos, así que este rellena y limpia a través del DOM.
  it('Limpiar vacía lo que se ve en los campos y avisa de las fechas', async () => {
    setUp();
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    const input = (id: string) => host.querySelector<HTMLInputElement>(`#${id}`)!;
    const type = (id: string, value: string) => {
      const el = input(id);
      el.value = value;
      el.dispatchEvent(new Event('input'));
    };

    type('f-named', '0875');
    type('f-ship', 'MSC');
    type('f-employee', 'ANA');
    type('f-position', 'ESTI');
    type('f-start', '2025-09-01');
    type('f-end', '2025-09-30');
    const turn = host.querySelector<HTMLSelectElement>('#f-turn')!;
    turn.value = '15:00 - 23:00';
    turn.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input('f-ship').value).toBe('MSC');

    const limpiar = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Limpiar'
    )!;
    limpiar.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    for (const id of ['f-named', 'f-ship', 'f-employee', 'f-position']) {
      expect(input(id).value).withContext(id).toBe('');
    }
    expect(turn.value).toBe('');
    expect(input('f-start').value).toBe(component.startDate);
    expect(input('f-end').value).toBe(component.endDate);
    expect(input('f-start').value).not.toBe('2025-09-01');
    expect(host.querySelector('[data-testid="cleared-notice"]')).not.toBeNull();
  });

  it('cuenta los filtros aplicados', () => {
    setUp();
    expect(component.activeCount).toBe(0);
    component.turn = '07:00 - 15:00';
    component.selectShip('MSC ANNA');
    expect(component.activeCount).toBe(2);
  });

  it('sigue consultando si los catálogos fallan', () => {
    setUp(throwError(() => new Error('sin catálogos')));
    expect(emitted.length).toBe(1);
    expect(component.filters.ships).toEqual([]);
  });
});
