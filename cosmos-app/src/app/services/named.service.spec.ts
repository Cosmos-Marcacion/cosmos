import { TestBed } from '@angular/core/testing';
import { NamedService } from './named.service';
import { environment } from '../../environments/environment';
import { httpProviders, httpMock, expectNoPendingRequests } from '../../testing/setup';

describe('NamedService', () => {
  let service: NamedService;
  const api = environment.api;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: httpProviders() });
    service = TestBed.inject(NamedService);
  });

  afterEach(expectNoPendingRequests);

  it('pide las nombradas agrupadas con el rango en el cuerpo', () => {
    const payload = { sInitialDate: '09/03/2026', sFinalDate: '09/03/2026' };

    service.getNameds(payload as never).subscribe();

    const peticion = httpMock().expectOne(`${api}/named/nameds/grouped`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(payload);
    peticion.flush([]);
  });

  describe('formatDate', () => {
    it('pasa de ISO a dia/mes/ano', () => {
      expect(service.formatDate('2026-03-09')).toBe('09/03/2026');
    });

    it('conserva los ceros a la izquierda', () => {
      // El sistema externo no reconoce "9/3/2026" y devuelve una lista vacia sin
      // error: en el movil se ve como "no tienes nombrada hoy".
      expect(service.formatDate('2026-01-05')).toBe('05/01/2026');
    });
  });

  it('propaga el error de la API', (done) => {
    service.getNameds({} as never).subscribe({
      error: (e) => {
        expect(e.status).toBe(500);
        done();
      },
    });

    httpMock()
      .expectOne(`${api}/named/nameds/grouped`)
      .flush({}, { status: 500, statusText: 'Server Error' });
  });
});
