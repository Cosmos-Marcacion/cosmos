import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import Users from './users';
import { environment } from '../../../environments/environment';
import { componentProviders, httpMock } from '../../../testing/setup';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';

/**
 * El listado de usuarios usa dos rutas distintas segun quien mire: la cuenta
 * raiz ve a todo el mundo y el resto no la ve a ella. Es una regla de
 * visibilidad, y la unica forma de comprobar que se aplica es mirar a que
 * endpoint se llama.
 */
describe('Users', () => {
  let component: Users;
  let fixture: ComponentFixture<Users>;
  let router: Router;
  let estadoUsuario: UserStateService;
  let notificaciones: NotificationService;
  const api = environment.api;

  const pagina = {
    data: [
      { _id: 'u1', name: 'Ana', email: 'ana@cosmos.com.pe' },
      { _id: 'u2', name: 'Luis', email: 'luis@cosmos.com.pe' },
    ],
    total: 2,
    page: 1,
    limit: 10,
  };

  const entrarComo = (rol: string) => {
    estadoUsuario.setUser({
      _id: 'u9',
      name: 'Quien mira',
      email: 'admin@cosmos.com.pe',
      role: { name: rol },
    } as never);
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Users],
      providers: componentProviders(),
    }).compileComponents();

    fixture = TestBed.createComponent(Users);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    estadoUsuario = TestBed.inject(UserStateService);
    notificaciones = TestBed.inject(NotificationService);
    spyOn(router, 'navigate');
    spyOn(notificaciones, 'show');
  });

  afterEach(() => estadoUsuario.logout());

  it('la cuenta raiz ve el listado completo', () => {
    entrarComo('Super');

    fixture.detectChanges();

    httpMock().expectOne((r) => r.url.startsWith(`${api}/user/10/1`)).flush(pagina);
    expect(component.users.length).toBe(2);
  });

  it('un administrador normal no ve la cuenta raiz', () => {
    entrarComo('Admin');

    fixture.detectChanges();

    // Ver la cuenta raiz en el listado es el primer paso para intentar tomarla:
    // el filtrado se hace en el servidor y esta llamada es la que lo pide.
    httpMock().expectOne((r) => r.url.includes('/user/except-super/')).flush(pagina);
  });

  it('sin sesion tampoco se lista la cuenta raiz', () => {
    fixture.detectChanges();

    httpMock().expectOne((r) => r.url.includes('/user/except-super/')).flush(pagina);
  });

  it('cambiar de pagina conserva la ruta que corresponde al rol', () => {
    entrarComo('Admin');
    fixture.detectChanges();
    httpMock().expectOne((r) => r.url.includes('except-super')).flush(pagina);

    component.pageChange(2);

    httpMock().expectOne((r) => r.url.includes('/user/except-super/10/2')).flush(pagina);
  });

  it('buscar envia el termino al dejar de escribir, no por tecla', () => {
    jasmine.clock().install();
    try {
      entrarComo('Super');
      fixture.detectChanges();
      httpMock().expectOne((r) => r.url.startsWith(`${api}/user/10/1`)).flush(pagina);

      component.searchUsers({ target: { value: 'an' } } as unknown as Event);
      component.searchUsers({ target: { value: 'ana' } } as unknown as Event);
      httpMock().expectNone((r) => r.url.includes('search='));

      jasmine.clock().tick(300);

      httpMock().expectOne((r) => r.url.includes('search=ana')).flush(pagina);
      expect(component.searchTerm).toBe('ana');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('anadir y editar navegan al formulario', () => {
    entrarComo('Super');
    fixture.detectChanges();
    httpMock().expectOne((r) => r.url.startsWith(`${api}/user/`)).flush(pagina);

    component.addUser();
    expect(router.navigate).toHaveBeenCalledWith(['/usuarios/agregar']);

    component.clickOptions('edit', 'u1');
    expect(router.navigate).toHaveBeenCalledWith(['/usuarios/agregar', 'u1']);
  });

  it('borrar no llama a la API antes de que se confirme', () => {
    entrarComo('Super');
    fixture.detectChanges();
    httpMock().expectOne((r) => r.url.startsWith(`${api}/user/`)).flush(pagina);

    component.clickOptions('delete', 'u1');

    httpMock().expectNone(`${api}/user/u1`);
  });

  it('nadie puede borrar su propia cuenta', () => {
    estadoUsuario.setUser({
      _id: 'u1',
      name: 'Ana',
      email: 'ana@cosmos.com.pe',
      role: { name: 'Super' },
    } as never);
    fixture.detectChanges();
    httpMock().expectOne((r) => r.url.startsWith(`${api}/user/`)).flush(pagina);

    component.clickOptions('delete', 'u1');

    // Sin esta guarda, un administrador se deja fuera del sistema con un clic y
    // hace falta tocar la base de datos para devolverle el acceso.
    expect(notificaciones.show).toHaveBeenCalledWith(
      'No puedes eliminar tu propio usuario',
      'error'
    );
    httpMock().expectNone(`${api}/user/u1`);
  });

  it('el reporte de Excel deja fuera la columna de acciones', () => {
    entrarComo('Super');
    fixture.detectChanges();
    httpMock().expectOne((r) => r.url.startsWith(`${api}/user/`)).flush(pagina);

    expect(component.getExcelConfig().headers.map((h) => h.header)).not.toContain('Acciones');
  });
});
