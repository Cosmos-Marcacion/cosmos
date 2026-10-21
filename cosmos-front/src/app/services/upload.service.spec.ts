import { TestBed } from '@angular/core/testing';
import { UploadService } from './upload.service';
import { environment } from '../../environments/environment';
import { httpProviders, httpMock, expectNoPendingRequests } from '../../testing/setup';

describe('UploadService', () => {
  let service: UploadService;
  const api = environment.api;
  const archivo = () => new File(['contenido'], 'foto.png', { type: 'image/png' });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: httpProviders() });
    service = TestBed.inject(UploadService);
  });

  afterEach(expectNoPendingRequests);

  it('sube el archivo con POST', () => {
    service.upload(archivo()).subscribe();

    const peticion = httpMock().expectOne(`${api}/upload`);
    expect(peticion.request.method).toBe('POST');
    peticion.flush({ url: 'https://cdn/foto.png' });
  });

  it('envia un FormData con el archivo bajo la clave "file"', () => {
    service.upload(archivo()).subscribe();

    const peticion = httpMock().expectOne(`${api}/upload`);
    const cuerpo = peticion.request.body as FormData;

    // El backend lo lee con `FileInterceptor('file')`: con cualquier otra clave
    // el archivo llega vacio y la respuesta es un 400 poco explicativo.
    expect(cuerpo instanceof FormData).toBeTrue();
    expect((cuerpo.get('file') as File).name).toBe('foto.png');
    peticion.flush({ url: '' });
  });

  it('no fija el Content-Type a mano', () => {
    service.upload(archivo()).subscribe();

    const peticion = httpMock().expectOne(`${api}/upload`);
    // Lo tiene que poner el navegador para incluir el `boundary` del multipart;
    // fijarlo a mano deja el cuerpo imposible de parsear en el servidor.
    expect(peticion.request.headers.has('Content-Type')).toBeFalse();
    peticion.flush({ url: '' });
  });

  it('el tipo de recurso por defecto es imagen', () => {
    service.upload(archivo()).subscribe();

    const peticion = httpMock().expectOne(`${api}/upload`);
    expect((peticion.request.body as FormData).get('resourceType')).toBe('image');
    peticion.flush({ url: '' });
  });

  it('respeta el tipo de recurso que se le pase', () => {
    service.upload(archivo(), 'signature').subscribe();

    const peticion = httpMock().expectOne(`${api}/upload`);
    expect((peticion.request.body as FormData).get('resourceType')).toBe('signature');
    peticion.flush({ url: '' });
  });

  it('propaga el rechazo por tamano o tipo', (done) => {
    service.upload(archivo()).subscribe({
      error: (e) => {
        expect(e.status).toBe(400);
        done();
      },
    });

    httpMock().expectOne(`${api}/upload`).flush({}, { status: 400, statusText: 'Bad Request' });
  });
});
