import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { environment } from '../environments/environment';
import { componentProviders, httpMock } from '../testing/setup';

/**
 * El spec original comprobaba que la pagina renderizaba
 * "Hello, cosmos-front" en un `<h1>`: la plantilla que trae el CLI y que se
 * sustituyo el primer dia. Llevaba fallando desde entonces sin decir nada util.
 *
 * Lo que si importa de la raiz es que monta el `router-outlet` y las tres capas
 * superpuestas —aviso, confirmacion y cargador—, porque si una de ellas no se
 * declara, la pantalla se queda esperando una respuesta que nadie muestra.
 */
describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: componentProviders(),
    }).compileComponents();
  });

  /** El constructor de `App` consulta la sesion; hay que atender esa peticion. */
  const atenderSesion = () => {
    httpMock().expectOne(`${environment.api}/employee/loggued`).flush([]);
  };

  it('se construye', () => {
    const fixture = TestBed.createComponent(App);

    expect(fixture.componentInstance).toBeTruthy();
    atenderSesion();
  });

  it('monta el router-outlet', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('router-outlet')).not.toBeNull();
    atenderSesion();
  });

  it('consulta el estado de sesion al arrancar', () => {
    TestBed.createComponent(App);

    const peticion = httpMock().expectOne(`${environment.api}/employee/loggued`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush([]);
  });

  it('sin aviso, confirmacion ni carga no pinta ninguna capa superpuesta', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('app-notification')).toBeNull();
    expect(html.querySelector('app-confirmation')).toBeNull();
    expect(html.querySelector('app-loader')).toBeNull();
    atenderSesion();
  });

  it('un fallo al consultar la sesion no impide montar la aplicacion', () => {
    const fixture = TestBed.createComponent(App);

    httpMock()
      .expectOne(`${environment.api}/employee/loggued`)
      .flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // La consulta de sesion es informativa. Si su fallo tumbara el arranque, una
    // caida del backend dejaria la pantalla en blanco en vez de en el login.
    expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).not.toBeNull();
  });
});
