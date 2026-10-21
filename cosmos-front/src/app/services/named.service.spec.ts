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

  it('getNameds envia el rango en el cuerpo', () => {
    const payload = { sInitialDate: '01/03/2026', sFinalDate: '31/03/2026' };

    service.getNameds(payload as never).subscribe();

    const peticion = httpMock().expectOne(`${api}/named/nameds/grouped`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(payload);
    peticion.flush([]);
  });

  it('pide las nombradas agrupadas, no la lista cruda', () => {
    service.getNameds({} as never).subscribe();

    // `/named/nameds` devuelve lo que responde el sistema externo;
    // `/nameds/grouped` es lo que ya viene cruzado con empleados, marcaciones y
    // puntos, que es lo que la pantalla necesita pintar.
    httpMock().expectOne(`${api}/named/nameds/grouped`).flush([]);
  });

  describe('formatDate', () => {
    it('pasa de ISO a dia/mes/ano', () => {
      expect(service.formatDate('2026-03-09')).toBe('09/03/2026');
    });

    it('conserva los ceros a la izquierda', () => {
      // El servicio externo no reconoce "9/3/2026": devuelve una lista vacia sin
      // error, que es el peor fallo posible porque parece que no hay nombradas.
      expect(service.formatDate('2026-01-05')).toBe('05/01/2026');
    });
  });

  it('isLoggedIn consulta el endpoint de sesion', () => {
    service.isLoggedIn().subscribe();

    const peticion = httpMock().expectOne(`${api}/employee/loggued`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush(true);
  });
});
