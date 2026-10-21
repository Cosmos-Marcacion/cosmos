import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import Points from './points';
import { environment } from '../../../environments/environment';
import { componentProviders, httpMock } from '../../../testing/setup';

describe('Points', () => {
  let component: Points;
  let fixture: ComponentFixture<Points>;
  let router: Router;
  const api = environment.api;

  const puertos = {
    data: [
      { _id: 'pt1', name: 'Callao' },
      { _id: 'pt2', name: 'Paita' },
    ],
    total: 2,
    page: 1,
    limit: 0,
  };

  const puntos = {
    data: [
      { _id: 'p1', name: 'Garita', order: 1, dependOn: null },
      { _id: 'p2', name: 'Muelle', order: 2, dependOn: { name: 'Garita' } },
    ],
    total: 2,
    page: 1,
    limit: 10,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Points],
      providers: componentProviders(),
    }).compileComponents();

    fixture = TestBed.createComponent(Points);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
  });

  /** Arranca y encadena las dos peticiones de la carga inicial. */
  const arrancar = (listaPuertos = puertos) => {
    fixture.detectChanges();
    httpMock().expectOne((r) => r.url.startsWith(`${api}/port/`)).flush(listaPuertos);
    if (listaPuertos.data.length > 0) {
      httpMock().expectOne((r) => r.url.includes('/point/by-port/')).flush(puntos);
    }
  };

  it('carga primero los puertos y luego los puntos del primero', () => {
    arrancar();

    expect(component.ports.length).toBe(2);
    expect(component.portId).toBe('pt1');
  });

  it('sin puertos dados de alta no revienta ni pide puntos', () => {
    arrancar({ data: [], total: 0, page: 1, limit: 0 });

    // Es el estado de una instalacion recien puesta en marcha. Antes,
    // `ports[0]._id` lanzaba un TypeError y la pantalla quedaba en blanco sin
    // ningun mensaje que explicara por que.
    expect(component.points).toEqual([]);
    httpMock().expectNone((r) => r.url.includes('/point/by-port/'));
  });

  it('cambiar de puerto recarga los puntos de ese puerto', () => {
    arrancar();

    component.changePort('pt2');

    httpMock().expectOne((r) => r.url.includes('/point/by-port/pt2/')).flush(puntos);
    expect(component.portId).toBe('pt2');
  });

  it('un puerto vacio no dispara ninguna recarga', () => {
    arrancar();

    component.changePort('');

    httpMock().expectNone((r) => r.url.includes('/point/by-port/'));
    expect(component.portId).toBe('pt1');
  });

  it('formatPoints muestra un guion cuando el punto no depende de otro', () => {
    const [suelto, dependiente] = component.formatPoints(puntos.data as never);

    // La columna se pinta tal cual: con `undefined` saldria la palabra escrita
    // en la celda.
    expect(suelto.depend).toBe('-');
    expect(dependiente.depend).toBe('Garita');
  });

  it('buscar envia el termino al puerto en curso', () => {
    arrancar();

    component.searchUsers({ target: { value: 'garita' } } as unknown as Event);

    httpMock()
      .expectOne((r) => r.url.includes('/point/by-port/pt1/') && r.url.includes('search=garita'))
      .flush(puntos);
    expect(component.searchTerm).toBe('garita');
  });

  it('cambiar de pagina conserva el puerto seleccionado', () => {
    arrancar();
    component.changePort('pt2');
    httpMock().expectOne((r) => r.url.includes('/point/by-port/pt2/')).flush(puntos);

    component.pageChange(2);

    httpMock().expectOne((r) => r.url.includes('/point/by-port/pt2/10/2')).flush(puntos);
  });

  it('anadir y editar navegan al formulario', () => {
    arrancar();

    component.addPoint();
    expect(router.navigate).toHaveBeenCalledWith(['/puntos/agregar']);

    component.clickOptions('edit', 'p1');
    expect(router.navigate).toHaveBeenCalledWith(['/puntos/agregar', 'p1']);
  });

  it('borrar no llama a la API antes de que se confirme', () => {
    arrancar();

    component.clickOptions('delete', 'p1');

    httpMock().expectNone(`${api}/point/p1`);
  });
});
