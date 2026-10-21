import { TestBed } from '@angular/core/testing';
import { PointsService } from './points.service';
import { environment } from '../../../../environments/environment';
import { httpProviders, httpMock, expectNoPendingRequests } from '../../../../testing/setup';

/**
 * Lo que hace este servicio es construir URLs. Parece poca cosa hasta que se
 * mira el detalle: aqui vivia un `&search=` en vez de `?search=` que dejaba el
 * buscador de puntos sin efecto —el termino se pegaba al numero de pagina y el
 * backend nunca veia el parametro—, y nada en la pantalla lo delataba: la lista
 * simplemente salia entera.
 */
describe('PointsService', () => {
  let service: PointsService;
  const api = environment.api;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: httpProviders() });
    service = TestBed.inject(PointsService);
  });

  afterEach(expectNoPendingRequests);

  describe('getPoints', () => {
    it('pide la pagina con limite y pagina en la ruta', () => {
      service.getPoints(10, 2, '').subscribe();

      const peticion = httpMock().expectOne(`${api}/point/10/2`);
      expect(peticion.request.method).toBe('GET');
      peticion.flush({ data: [], total: 0, page: 2, limit: 10 });
    });

    it('el termino de busqueda abre la cadena de consulta con "?"', () => {
      service.getPoints(10, 1, 'garita').subscribe();

      // Este es el caso que da nombre al fichero. Con `&` —como estaba— la URL
      // salia `/point/10/1&search=garita`: el backend leia la pagina como
      // "1&search=garita", no veia ningun parametro de consulta, y devolvia la
      // lista entera como si nadie hubiera buscado nada.
      const peticion = httpMock().expectOne(`${api}/point/10/1?search=garita`);
      expect(peticion.request.url).toContain('/point/10/1?search=');
      expect(peticion.request.url).not.toContain('1&search');
      peticion.flush({ data: [], total: 0, page: 1, limit: 10 });
    });

    it('codifica el termino para que no rompa la URL', () => {
      service.getPoints(10, 1, 'muelle & grua').subscribe();

      // El termino se concatena a mano en la URL, asi que Angular no lo escapa
      // por su cuenta: sin `encodeURIComponent` el `&` abriria un segundo
      // parametro y el backend recibiria solo "muelle ".
      const peticion = httpMock().expectOne(
        `${api}/point/10/1?search=${encodeURIComponent('muelle & grua')}`
      );
      expect(peticion.request.url).toContain('%26');
      peticion.flush({ data: [], total: 0, page: 1, limit: 10 });
    });

    it('sin busqueda no anade el parametro', () => {
      service.getPoints(10, 1, '').subscribe();

      const peticion = httpMock().expectOne(`${api}/point/10/1`);
      expect(peticion.request.url).not.toContain('search');
      peticion.flush({ data: [], total: 0, page: 1, limit: 10 });
    });

    it('devuelve el cuerpo de la respuesta tal cual', (done) => {
      const respuesta = { data: [{ _id: 'p1' }], total: 1, page: 1, limit: 10 };

      service.getPoints(10, 1, '').subscribe((r) => {
        expect(r).toEqual(respuesta as never);
        done();
      });

      httpMock().expectOne(`${api}/point/10/1`).flush(respuesta);
    });
  });

  describe('getPointsByPort', () => {
    it('incluye el puerto en la ruta', () => {
      service.getPointsByPort('pt1', 10, 1, '').subscribe();

      httpMock().expectOne(`${api}/point/by-port/pt1/10/1`).flush({ data: [] });
    });

    it('el termino de busqueda va como parametro de consulta', () => {
      service.getPointsByPort('pt1', 10, 1, 'garita').subscribe();

      httpMock().expectOne(`${api}/point/by-port/pt1/10/1?search=garita`).flush({ data: [] });
    });
  });

  describe('operaciones sobre un punto', () => {
    it('getPoint pide el punto por id', () => {
      service.getPoint('p1').subscribe();

      const peticion = httpMock().expectOne(`${api}/point/p1`);
      expect(peticion.request.method).toBe('GET');
      peticion.flush({ _id: 'p1' });
    });

    it('createPoint envia el punto en el cuerpo', () => {
      const punto = { name: 'Garita', portId: 'pt1' };

      service.createPoint(punto as never).subscribe();

      const peticion = httpMock().expectOne(`${api}/point`);
      expect(peticion.request.method).toBe('POST');
      expect(peticion.request.body).toEqual(punto);
      peticion.flush({ _id: 'p1' });
    });

    it('updatePoint usa PATCH y no PUT', () => {
      service.updatePoint('p1', { name: 'Otro' } as never).subscribe();

      const peticion = httpMock().expectOne(`${api}/point/p1`);
      // El backend expone `@Patch(':id')`. Con PUT la respuesta seria un 404 y
      // el formulario mostraria "no se pudo guardar" sin mas explicacion.
      expect(peticion.request.method).toBe('PATCH');
      peticion.flush({ _id: 'p1' });
    });

    it('deletePoint usa DELETE', () => {
      service.deletePoint('p1').subscribe();

      const peticion = httpMock().expectOne(`${api}/point/p1`);
      expect(peticion.request.method).toBe('DELETE');
      peticion.flush({});
    });
  });

  it('propaga el error de la API a quien se suscribe', (done) => {
    service.getPoint('p1').subscribe({
      error: (error) => {
        expect(error.status).toBe(500);
        done();
      },
    });

    httpMock()
      .expectOne(`${api}/point/p1`)
      .flush({ message: 'fallo' }, { status: 500, statusText: 'Server Error' });
  });
});
