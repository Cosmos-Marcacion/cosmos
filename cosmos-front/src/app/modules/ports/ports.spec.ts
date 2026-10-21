import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import Ports from './ports';
import { environment } from '../../../environments/environment';
import { componentProviders, httpMock } from '../../../testing/setup';

describe('Ports', () => {
  let component: Ports;
  let fixture: ComponentFixture<Ports>;
  let router: Router;
  const api = environment.api;

  const paginaDePuertos = {
    data: [
      { _id: 'pt1', name: 'Callao', address: 'Av. Mora 1' },
      { _id: 'pt2', name: 'Paita', address: 'Muelle 3' },
    ],
    total: 2,
    page: 1,
    limit: 104,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Ports],
      providers: componentProviders(),
    }).compileComponents();

    fixture = TestBed.createComponent(Ports);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
  });

  /** Arranca el componente y responde a la carga inicial. */
  const arrancar = (respuesta = paginaDePuertos) => {
    fixture.detectChanges();
    httpMock().expectOne((r) => r.url.startsWith(`${api}/port/`)).flush(respuesta);
  };

  it('carga los puertos al entrar', () => {
    arrancar();

    expect(component.ports.length).toBe(2);
    expect(component.total).toBe(2);
  });

  it('la carga inicial no envia termino de busqueda', () => {
    fixture.detectChanges();

    const peticion = httpMock().expectOne(`${api}/port/104/1`);
    expect(peticion.request.url).not.toContain('search');
    peticion.flush(paginaDePuertos);
  });

  it('toma pagina y limite de la respuesta, no de lo que pidio', () => {
    fixture.detectChanges();
    httpMock()
      .expectOne((r) => r.url.startsWith(`${api}/port/`))
      .flush({ ...paginaDePuertos, page: 3, limit: 25 });

    // Si el servidor acota la pagina, el paginador tiene que reflejar lo que de
    // verdad se sirvio; quedarse con lo pedido lo deja describiendo otra cosa.
    expect(component.page).toBe(3);
    expect(component.limit).toBe(25);
  });

  it('cambiar de pagina vuelve a pedir con la pagina nueva', () => {
    arrancar();

    component.pageChange(2);

    httpMock().expectOne(`${api}/port/104/2`).flush(paginaDePuertos);
  });

  it('buscar envia el termino y lo recuerda', () => {
    arrancar();

    component.searchUsers({ target: { value: 'callao' } } as unknown as Event);

    httpMock().expectOne(`${api}/port/104/1?search=callao`).flush(paginaDePuertos);
    expect(component.searchTerm).toBe('callao');
  });

  it('el boton de anadir lleva al formulario vacio', () => {
    arrancar();

    component.addPort();

    expect(router.navigate).toHaveBeenCalledWith(['/puertos/agregar']);
  });

  it('editar lleva al formulario con el id del puerto', () => {
    arrancar();

    component.clickOptions('edit', 'pt1');

    expect(router.navigate).toHaveBeenCalledWith(['/puertos/agregar', 'pt1']);
  });

  it('borrar no llama a la API antes de que se confirme', () => {
    arrancar();

    component.clickOptions('delete', 'pt1');

    // El borrado pasa por un dialogo. Si la peticion saliera al pulsar el boton,
    // el "estas seguro" seria decorativo y el puerto ya estaria borrado.
    httpMock().expectNone(`${api}/port/pt1`);
  });

  it('una opcion desconocida no navega ni borra', () => {
    arrancar();

    component.clickOptions('imprimir', 'pt1');

    expect(router.navigate).not.toHaveBeenCalled();
    httpMock().expectNone(`${api}/port/pt1`);
  });

  it('el reporte de Excel deja fuera la columna de acciones', () => {
    arrancar();

    const config = component.getExcelConfig();

    // "Acciones" son botones, no un dato: exportarlos produce una columna de
    // celdas vacias en el fichero que se manda al cliente.
    expect(config.headers.map((h) => h.header)).not.toContain('Acciones');
    expect(config.data.length).toBe(2);
  });

  it('el reporte recuerda el filtro con el que se genero', () => {
    arrancar();
    component.searchUsers({ target: { value: 'callao' } } as unknown as Event);
    httpMock().expectOne((r) => r.url.includes('search=callao')).flush(paginaDePuertos);

    expect(component.getExcelConfig().filters).toEqual({ 'Búsqueda': 'callao' });
  });
});
