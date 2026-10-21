import { TestBed } from '@angular/core/testing';
import { PortsService } from './ports.service';
import { environment } from '../../../../environments/environment';
import { httpProviders, httpMock, expectNoPendingRequests } from '../../../../testing/setup';

describe('PortsService', () => {
  let service: PortsService;
  const api = environment.api;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: httpProviders() });
    service = TestBed.inject(PortsService);
  });

  afterEach(expectNoPendingRequests);

  describe('getPorts', () => {
    it('el primer argumento va al primer segmento de la ruta', () => {
      // Trampa documentada: los parametros se llaman `(page, limit)` pero la
      // ruta del backend es `:limit/:page`, asi que quien llama tiene que pasar
      // el limite primero, y es justo lo que hace la pantalla de puertos. El
      // nombre miente; el contrato es este y queda fijado aqui.
      service.getPorts(10, 2).subscribe();

      httpMock().expectOne(`${api}/port/10/2`).flush({ data: [] });
    });

    it('el termino de busqueda va como parametro de consulta', () => {
      service.getPorts(10, 1, 'callao').subscribe();

      httpMock().expectOne(`${api}/port/10/1?search=callao`).flush({ data: [] });
    });

    it('codifica el termino', () => {
      service.getPorts(10, 1, 'a&b').subscribe();

      const peticion = httpMock().expectOne(
        `${api}/port/10/1?search=${encodeURIComponent('a&b')}`
      );
      expect(peticion.request.url).toContain('%26');
      peticion.flush({ data: [] });
    });

    it('sin busqueda no anade el parametro', () => {
      service.getPorts(10, 1).subscribe();

      const peticion = httpMock().expectOne(`${api}/port/10/1`);
      expect(peticion.request.url).not.toContain('search');
      peticion.flush({ data: [] });
    });
  });

  it('getPort pide por id', () => {
    service.getPort('pt1').subscribe();

    httpMock().expectOne(`${api}/port/pt1`).flush({ _id: 'pt1' });
  });

  it('createPort envia el puerto en el cuerpo', () => {
    const puerto = { name: 'Callao', address: 'Av. 1' };

    service.createPort(puerto as never).subscribe();

    const peticion = httpMock().expectOne(`${api}/port`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(puerto);
    peticion.flush({ _id: 'pt1' });
  });

  it('updatePort usa PATCH', () => {
    service.updatePort('pt1', { name: 'Otro' } as never).subscribe();

    const peticion = httpMock().expectOne(`${api}/port/pt1`);
    expect(peticion.request.method).toBe('PATCH');
    peticion.flush({ _id: 'pt1' });
  });

  it('deletePort usa DELETE', () => {
    service.deletePort('pt1').subscribe();

    const peticion = httpMock().expectOne(`${api}/port/pt1`);
    expect(peticion.request.method).toBe('DELETE');
    peticion.flush({});
  });

  it('propaga el error de la API', (done) => {
    service.getPort('pt1').subscribe({
      error: (e) => {
        expect(e.status).toBe(404);
        done();
      },
    });

    httpMock().expectOne(`${api}/port/pt1`).flush({}, { status: 404, statusText: 'Not Found' });
  });
});
