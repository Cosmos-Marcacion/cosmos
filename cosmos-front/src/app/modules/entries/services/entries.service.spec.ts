import { TestBed } from '@angular/core/testing';
import { EntriesService } from './entries.service';
import { environment } from '../../../../environments/environment';
import { httpProviders, httpMock, expectNoPendingRequests } from '../../../../testing/setup';

/**
 * Las marcaciones son el registro con valor legal de la jornada. Este servicio
 * no tiene logica propia, pero si tres pares de rutas que se parecen mucho
 * entre si: confundir una por otra crea o borra el registro equivocado.
 */
describe('EntriesService', () => {
  let service: EntriesService;
  const api = environment.api;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: httpProviders() });
    service = TestBed.inject(EntriesService);
  });

  afterEach(expectNoPendingRequests);

  it('getEntries busca con POST porque los filtros van en el cuerpo', () => {
    const filtros = { startDate: '2026-03-01', endDate: '2026-03-31' };

    service.getEntries(filtros as never).subscribe();

    const peticion = httpMock().expectOne(`${api}/entry/search`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(filtros);
    peticion.flush({ data: [] });
  });

  it('createEntry apunta a la ruta de registro manual', () => {
    service.createEntry({ pointId: 'p1' } as never).subscribe();

    // `POST /entry` escribe sin comprobar turno ni dependencias; `/entry/manual`
    // es la que resuelve el empleado por documento y fecha la marcacion. La
    // pantalla de alta usa la segunda.
    const peticion = httpMock().expectOne(`${api}/entry/manual`);
    expect(peticion.request.method).toBe('POST');
    peticion.flush({ _id: 'x1' });
  });

  it('getEntry pide una marcacion por id', () => {
    service.getEntry('x1').subscribe();

    httpMock().expectOne(`${api}/entry/x1`).flush({ _id: 'x1' });
  });

  it('updateEntry usa PATCH sobre el id', () => {
    service.updateEntry('x1', { observation: 'corregido' } as never).subscribe();

    const peticion = httpMock().expectOne(`${api}/entry/x1`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({ observation: 'corregido' });
    peticion.flush({});
  });

  it('deleteEntry usa DELETE sobre el id', () => {
    service.deleteEntry('x1').subscribe();

    const peticion = httpMock().expectOne(`${api}/entry/x1`);
    expect(peticion.request.method).toBe('DELETE');
    peticion.flush({});
  });

  it('getEntriesEmployee compone la ruta con empleado, nombrada y fecha en ese orden', () => {
    service.getEntriesEmployee('e1', '9', '09-03-2026').subscribe();

    // Tres cadenas seguidas en la URL: intercambiar dos compila igual y el
    // backend devuelve una jornada vacia sin ningun error.
    httpMock()
      .expectOne(`${api}/entry/employee-and-named/e1/9/09-03-2026`)
      .flush({} as never);
  });

  it('getAllEmployees pide el maestro completo', () => {
    service.getAllEmployees().subscribe();

    httpMock().expectOne(`${api}/employee`).flush([]);
  });

  it('sendReport envia los filtros al endpoint de reporte', () => {
    service.sendReport({ startDate: '2026-03-01' }).subscribe();

    const peticion = httpMock().expectOne(`${api}/entry/report`);
    expect(peticion.request.method).toBe('POST');
    peticion.flush({});
  });

  it('propaga el error de la API', (done) => {
    service.getEntry('x1').subscribe({
      error: (e) => {
        expect(e.status).toBe(500);
        done();
      },
    });

    httpMock().expectOne(`${api}/entry/x1`).flush({}, { status: 500, statusText: 'Server Error' });
  });
});
