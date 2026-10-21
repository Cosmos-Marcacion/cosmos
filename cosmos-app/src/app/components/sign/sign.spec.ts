import { ComponentFixture, TestBed } from '@angular/core/testing';

import Sign from './sign';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { NotificationService } from '../../services/notification.service';
import { environment } from '../../../environments/environment';

describe('Sign', () => {
  let component: Sign;
  let fixture: ComponentFixture<Sign>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Sign],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Sign);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('Sign: lienzo y guardado', () => {
  let component: Sign;
  let fixture: ComponentFixture<Sign>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Sign],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(Sign);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('escala el toque al tamano real del lienzo cuando se pinta encogido', () => {
    const canvas: HTMLCanvasElement = fixture.nativeElement.querySelector('canvas');
    // Como en un movil: 500 px de lienzo pintados en 250 px de pantalla.
    canvas.style.width = '250px';
    canvas.style.height = '100px';
    const rect = canvas.getBoundingClientRect();

    const point = (component as any).getCoordinates(
      new MouseEvent('mousemove', { clientX: rect.left + 125, clientY: rect.top + 50 })
    );

    expect(point.x).toBeCloseTo(250, 0);
    expect(point.y).toBeCloseTo(100, 0);
  });

  it('no guarda una firma en blanco', () => {
    const notify = spyOn(TestBed.inject(NotificationService), 'show');

    component.saveSignature();

    http.expectNone(`${environment.api}/employee/signature`);
    expect(notify).toHaveBeenCalledWith('Dibuje la firma antes de guardarla', 'error');
  });

  it('un doble toque en guardar sube la firma una sola vez', () => {
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    (component as any).hasStroke = true;

    component.saveSignature();
    component.saveSignature();

    const requests = http.match(`${environment.api}/employee/signature`);
    expect(requests.length).toBe(1);
    requests[0].flush({});
  });
});
