import { TestBed } from '@angular/core/testing';
import { UsersService } from './users.service';
import { environment } from '../../../../environments/environment';
import { httpProviders, httpMock, expectNoPendingRequests } from '../../../../testing/setup';

describe('UsersService', () => {
  let service: UsersService;
  const api = environment.api;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: httpProviders() });
    service = TestBed.inject(UsersService);
  });

  afterEach(expectNoPendingRequests);

  it('getUsers pide limite y pagina en la ruta', () => {
    service.getUsers(10, 2).subscribe();

    httpMock().expectOne(`${api}/user/10/2?search=`).flush({ data: [] });
  });

  it('getUsers pasa el termino de busqueda', () => {
    service.getUsers(10, 1, 'ana').subscribe();

    httpMock().expectOne(`${api}/user/10/1?search=ana`).flush({ data: [] });
  });

  it('getUsers codifica el termino', () => {
    service.getUsers(10, 1, 'a&b').subscribe();

    const peticion = httpMock().expectOne(`${api}/user/10/1?search=${encodeURIComponent('a&b')}`);
    expect(peticion.request.url).toContain('%26');
    peticion.flush({ data: [] });
  });

  it('getUsersExceptSuper usa una ruta propia', () => {
    service.getUsersExceptSuper(10, 1).subscribe();

    // La pantalla de usuarios no debe listar la cuenta raiz. Si esta llamada
    // cayera en la ruta generica, esa cuenta apareceria en el listado.
    httpMock().expectOne(`${api}/user/except-super/10/1?search=`).flush({ data: [] });
  });

  it('getUser pide por id con su prefijo propio', () => {
    service.getUser('u1').subscribe();

    httpMock().expectOne(`${api}/user/by-id/u1`).flush({ _id: 'u1' });
  });

  it('createUser envia el usuario en el cuerpo', () => {
    const usuario = { email: 'ana@cosmos.com.pe', name: 'Ana' };

    service.createUser(usuario as never).subscribe();

    const peticion = httpMock().expectOne(`${api}/user`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(usuario);
    peticion.flush({ _id: 'u1' });
  });

  it('deleteUser usa DELETE sobre el id', () => {
    service.deleteUser('u1').subscribe();

    const peticion = httpMock().expectOne(`${api}/user/u1`);
    expect(peticion.request.method).toBe('DELETE');
    peticion.flush({});
  });

  it('propaga el error de la API', (done) => {
    service.getUser('u1').subscribe({
      error: (e) => {
        expect(e.status).toBe(403);
        done();
      },
    });

    httpMock().expectOne(`${api}/user/by-id/u1`).flush({}, { status: 403, statusText: 'Forbidden' });
  });
});
