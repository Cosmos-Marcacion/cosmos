import { ComponentFixture, TestBed } from '@angular/core/testing';

import RegisterValidation from './register-validation';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { errorInterceptor } from '../../interceptors/error.interceptor';
import { NotificationService } from '../../services/notification.service';

describe('RegisterValidation', () => {
  let component: RegisterValidation;
  let fixture: ComponentFixture<RegisterValidation>;
  let http: HttpTestingController;
  let notification: jasmine.Spy;

  const pointsRequest = () => http.expectOne((r) => r.url.endsWith('/point/by-employee/e1'));
  const employeeRequest = () => http.expectOne((r) => r.url.endsWith('/employee/e1'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterValidation],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              params: { id: 'e1' },
              queryParamMap: convertToParamMap({ metodo: 'rostro', puntuacion: '0.312' }),
            },
          },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(RegisterValidation);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    notification = spyOn(TestBed.inject(NotificationService), 'show');
    fixture.detectChanges();
    employeeRequest().flush({ _id: 'e1', firstName: 'Ana', lastName: 'Rojas' });
  });

  afterEach(() => http.verify());

  it('muestra los puntos cuando esta nombrado', () => {
    pointsRequest().flush([{ _id: 'p1', name: 'Ingreso', isChecked: false }]);
    fixture.detectChanges();
    expect(component.status()).toBe('ready');
    expect(fixture.nativeElement.textContent).toContain('Ingreso');
  });

  it('si no esta en la nombrada de hoy lo dice en la pantalla, sin aviso duplicado', () => {
    pointsRequest().flush(
      { message: 'El empleado no está nombrado para hoy' },
      { status: 404, statusText: 'Not Found' }
    );
    fixture.detectChanges();
    expect(component.status()).toBe('unavailable');
    expect(fixture.nativeElement.textContent).toContain('El empleado no está nombrado para hoy');
    expect(notification).not.toHaveBeenCalled();
  });

  it('con una lista vacia no revienta', () => {
    pointsRequest().flush([]);
    fixture.detectChanges();
    expect(component.status()).toBe('unavailable');
  });

  it('un fallo del servidor deja reintentar', () => {
    pointsRequest().flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(component.status()).toBe('error');
    component.getPoints();
    pointsRequest().flush([{ _id: 'p1', name: 'Ingreso', isChecked: false }]);
    expect(component.status()).toBe('ready');
  });

  it('envia con la marcacion el metodo y la distancia con que se reconocio', () => {
    pointsRequest().flush([]);
    component.register('p1', '3619');

    const request = http.expectOne((r) => r.url.endsWith('/entry/checkin'));
    expect(request.request.body).toEqual({
      employeeId: 'e1',
      pointId: 'p1',
      namedId: '3619',
      method: 'rostro',
      matchScore: 0.312,
    });
  });
});
