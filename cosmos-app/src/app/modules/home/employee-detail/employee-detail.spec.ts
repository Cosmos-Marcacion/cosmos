import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import EmployeeDetail from './employee-detail';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';

describe('EmployeeDetail', () => {
  let component: EmployeeDetail;
  let fixture: ComponentFixture<EmployeeDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmployeeDetail],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(EmployeeDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

/**
 * La pantalla vive dentro del armazon, que es OnPush, y la app va sin Zone.js.
 * En ese arbol un componente por defecto que asigna campos sueltos desde un
 * `subscribe` no se vuelve a pintar: la ficha se quedaba vacia hasta que el
 * usuario tocaba algo.
 */
@Component({
  selector: 'app-onpush-shell',
  imports: [EmployeeDetail],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-employee-detail />`,
})
class OnPushShell {}

describe('EmployeeDetail sin Zone.js bajo un armazon OnPush', () => {
  it('pinta la ficha cuando llega la respuesta', async () => {
    TestBed.configureTestingModule({
      imports: [OnPushShell],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { params: { id: 'e1', staffTransmissionId: '77', date: '2026-09-24' } } },
        },
      ],
    });
    const fixture = TestBed.createComponent(OnPushShell);
    await fixture.whenStable();

    TestBed.inject(HttpTestingController)
      .expectOne(`${environment.api}/entry/employee/e1/77/2026-09-24`)
      .flush({
        points: [],
        employee: { _id: 'e1', firstName: 'ana', lastName: 'diaz', document: '12345678' },
        nameds: null,
        named: null,
      });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('12345678');
  });

  it('una respuesta sin empleado no rompe la pantalla', async () => {
    TestBed.configureTestingModule({
      imports: [OnPushShell],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { params: { id: 'e1', staffTransmissionId: '77', date: '2026-09-24' } } },
        },
      ],
    });
    const fixture = TestBed.createComponent(OnPushShell);
    await fixture.whenStable();

    TestBed.inject(HttpTestingController)
      .expectOne(`${environment.api}/entry/employee/e1/77/2026-09-24`)
      .flush({ points: [], employee: null, nameds: null, named: null });

    await expectAsync(fixture.whenStable()).toBeResolved();
  });
});
