import { TestBed } from '@angular/core/testing';
import { SyncEmployeesService } from './sync-employees.service';
import { environment } from '../../../../environments/environment';
import { httpProviders, httpMock, expectNoPendingRequests } from '../../../../testing/setup';

describe('SyncEmployeesService', () => {
  let service: SyncEmployeesService;
  const api = environment.api;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: httpProviders() });
    service = TestBed.inject(SyncEmployeesService);
  });

  afterEach(expectNoPendingRequests);

  it('syncEmployees dispara un POST con cuerpo vacio', () => {
    service.syncEmployees().subscribe();

    const peticion = httpMock().expectOne(`${api}/employee/sync-from-named`);
    // Es una accion, no una consulta: con GET, cualquier precarga del navegador
    // dispararia una sincronizacion completa del maestro de personal.
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({});
    peticion.flush({ totalProcessed: 0, newEmployees: 0, existingEmployees: 0, errors: [] });
  });

  it('devuelve el resumen de la sincronizacion', (done) => {
    const resumen = { totalProcessed: 12, newEmployees: 3, existingEmployees: 9, errors: [] };

    service.syncEmployees().subscribe((r) => {
      expect(r).toEqual(resumen as never);
      done();
    });

    httpMock().expectOne(`${api}/employee/sync-from-named`).flush(resumen);
  });

  it('getEmployeesWithStatus consulta la lista con estado', () => {
    service.getEmployeesWithStatus().subscribe();

    const peticion = httpMock().expectOne(`${api}/employee/list-with-status`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush([]);
  });

  it('propaga el fallo en vez de devolver un resumen vacio', (done) => {
    service.syncEmployees().subscribe({
      error: (e) => {
        expect(e.status).toBe(500);
        done();
      },
    });

    httpMock()
      .expectOne(`${api}/employee/sync-from-named`)
      .flush({}, { status: 500, statusText: 'Server Error' });
  });
});
