import { TestBed } from '@angular/core/testing';
import { GeneratorService } from './generator.service';
import { environment } from '../../../../environments/environment';
import { httpProviders, httpMock, expectNoPendingRequests } from '../../../../testing/setup';

describe('GeneratorService', () => {
  let service: GeneratorService;
  const api = environment.api;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: httpProviders() });
    service = TestBed.inject(GeneratorService);
  });

  afterEach(expectNoPendingRequests);

  it('getEmployees pide el maestro de empleados', () => {
    service.getEmployees().subscribe();

    const peticion = httpMock().expectOne(`${api}/employee`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush([]);
  });

  it('generateQR envia empleado y tipo en el cuerpo', () => {
    service.generateQR('e1', 'qrcode').subscribe();

    const peticion = httpMock().expectOne(`${api}/generator`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ employeeId: 'e1', type: 'qrcode' });
    peticion.flush({ url: 'https://cdn/qr.png' });
  });

  it('el tipo de codigo viaja tal cual', () => {
    service.generateQR('e1', 'code128').subscribe();

    // El backend usa este campo como `bcid` de bwip-js. Sustituirlo por un
    // valor por defecto generaria un codigo del tipo equivocado, que el lector
    // del puerto no reconoce.
    const peticion = httpMock().expectOne(`${api}/generator`);
    expect(peticion.request.body.type).toBe('code128');
    peticion.flush({ url: 'https://cdn/bc.png' });
  });

  it('devuelve la url generada', (done) => {
    service.generateQR('e1', 'qrcode').subscribe((r) => {
      expect(r.url).toBe('https://cdn/qr.png');
      done();
    });

    httpMock().expectOne(`${api}/generator`).flush({ url: 'https://cdn/qr.png' });
  });

  it('propaga el 404 de empleado inexistente', (done) => {
    service.generateQR('fantasma', 'qrcode').subscribe({
      error: (e) => {
        expect(e.status).toBe(404);
        done();
      },
    });

    httpMock().expectOne(`${api}/generator`).flush({}, { status: 404, statusText: 'Not Found' });
  });
});
