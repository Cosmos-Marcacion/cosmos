import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import Auth, { canUsePanel } from './auth';
import { environment } from '../../../environments/environment';
import { componentProviders, httpMock } from '../../../testing/setup';
import { NotificationService } from '../../services/notification.service';
import { UserStateService } from '../../services/user-state.service';

/**
 * Pantalla de acceso. Es la unica del panel que decide quien entra, asi que los
 * casos se concentran en lo que no debe pasar: entrar con el formulario
 * incompleto, entrar sin el rol adecuado, o que un rechazo del servidor deje la
 * pantalla bloqueada en "cargando".
 */
describe('Auth', () => {
  let component: Auth;
  let fixture: ComponentFixture<Auth>;
  let router: Router;
  let notificaciones: NotificationService;
  let estadoUsuario: UserStateService;
  const api = environment.api;

  const credenciales = { email: 'ana@cosmos.com.pe', password: 'Secreta123' };

  const respuestaLogin = (rol: string) => ({
    access_token: 'token.firmado',
    email: credenciales.email,
    role: { name: rol },
    permissions: ['puertos'],
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Auth],
      providers: componentProviders(),
    }).compileComponents();

    fixture = TestBed.createComponent(Auth);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    notificaciones = TestBed.inject(NotificationService);
    estadoUsuario = TestBed.inject(UserStateService);
    spyOn(router, 'navigate');
    spyOn(notificaciones, 'show');
    fixture.detectChanges();
  });

  describe('validacion del formulario', () => {
    it('empieza invalido y vacio', () => {
      expect(component.form.invalid).toBeTrue();
    });

    it('no envia nada si el formulario esta incompleto', () => {
      component.form.patchValue({ email: 'ana@cosmos.com.pe', password: '' });

      component.login();

      httpMock().expectNone(`${api}/auth/login`);
    });

    it('pulsar Ingresar vacio muestra un mensaje por campo (CKI12)', async () => {
      const boton: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
      boton.click();
      await fixture.whenStable();
      fixture.detectChanges();

      const texto = fixture.nativeElement.textContent;
      expect(texto).toContain('Ingresa tu correo.');
      expect(texto).toContain('Ingresa tu contraseña.');
      httpMock().expectNone(`${api}/auth/login`);
    });

    it('rechaza un correo con formato invalido', () => {
      component.form.patchValue({ email: 'no-es-un-correo', password: 'Secreta123' });

      component.login();

      httpMock().expectNone(`${api}/auth/login`);
    });

    it('con credenciales completas el formulario es valido', () => {
      component.form.patchValue(credenciales);

      expect(component.form.valid).toBeTrue();
    });
  });

  describe('login', () => {
    const enviar = () => {
      component.form.patchValue(credenciales);
      component.login();
      return httpMock().expectOne(`${api}/auth/login`);
    };

    it('envia correo y contrasena a la API', () => {
      const peticion = enviar();

      expect(peticion.request.method).toBe('POST');
      expect(peticion.request.body).toEqual(credenciales);
      peticion.flush(respuestaLogin('Admin'));
    });

    it('un administrador entra y llega al panel', () => {
      enviar().flush(respuestaLogin('Admin'));

      expect(estadoUsuario.getUser()).toBeTruthy();
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('un perfil propio con pantallas entra al panel', () => {
      // Antes solo entraban "Admin" y "Super": un perfil creado en Perfiles
      // quedaba fuera aunque tuviera pantallas asignadas.
      enviar().flush(respuestaLogin('Supervisor de turno'));

      expect(estadoUsuario.getUser()).toBeTruthy();
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('un perfil sin ninguna pantalla no entra', () => {
      enviar().flush({ ...respuestaLogin('Invitado'), permissions: [] });

      expect(router.navigate).toHaveBeenCalledWith(['/login']);
      expect(notificaciones.show).toHaveBeenCalledWith(
        'No tienes permisos para acceder a este sistema',
        'error'
      );
    });

    it('la cuenta de la app (perfil User) no entra al panel', () => {
      enviar().flush(respuestaLogin('User'));

      // El backend valida credenciales, no si esa persona puede usar el panel.
      // "User" tiene Panel y Marcaciones porque la app usa esas rutas de la
      // API; sin esta comprobacion, las cuentas del muelle entrarian.
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
      expect(notificaciones.show).toHaveBeenCalledWith(
        'No tienes permisos para acceder a este sistema',
        'error'
      );
    });

    it('unas credenciales rechazadas avisan sin decir cual fallo', () => {
      enviar().flush({}, { status: 400, statusText: 'Bad Request' });

      expect(component.formError()).toContain('Correo o contraseña incorrectos');
      expect(router.navigate).not.toHaveBeenCalledWith(['/']);
    });

    it('el indicador de carga se apaga tras un rechazo', () => {
      enviar().flush({}, { status: 400, statusText: 'Bad Request' });

      // Si se quedara encendido, el boton seguiria deshabilitado y quien se
      // equivoco de contrasena no podria reintentar sin recargar la pagina.
      expect(component.isLoading()).toBeFalse();
    });

    it('el indicador de carga se apaga tras entrar', () => {
      enviar().flush(respuestaLogin('Admin'));

      expect(component.isLoading()).toBeFalse();
    });
  });

  describe('recuperacion de contrasena', () => {
    it('cambiar a "reset" arrastra el correo ya escrito', () => {
      component.form.patchValue({ email: 'ana@cosmos.com.pe' });

      component.setMode('reset');

      expect(component.resetForm.value.email).toBe('ana@cosmos.com.pe');
    });

    it('un correo no registrado se queda en recuperar y lo dice (CKI19)', () => {
      component.setMode('forgot');
      component.form.patchValue({ email: 'nadie@cosmos.com.pe' });

      component.sendCode();
      httpMock()
        .expectOne(`${api}/auth/password/send-code`)
        .flush({ message: 'Este correo no está registrado en Cosmos CheckIn.' }, { status: 404, statusText: 'Not Found' });

      expect(component.viewMode()).toBe('forgot');
      expect(component.formError()).toContain('no está registrado');
    });

    it('un fallo del correo muestra el mensaje del servidor, no uno generico (CKI18)', () => {
      component.setMode('forgot');
      component.form.patchValue({ email: 'ana@cosmos.com.pe' });

      component.sendCode();
      httpMock()
        .expectOne(`${api}/auth/password/send-code`)
        .flush({ message: 'No pudimos enviar el correo con el código. Inténtalo de nuevo en unos minutos.' }, { status: 503, statusText: 'Service Unavailable' });

      expect(component.viewMode()).toBe('forgot');
      expect(component.formError()).toContain('Inténtalo de nuevo');
    });

    it('con el codigo enviado pasa a nueva contrasena y bloquea el reenvio un minuto', () => {
      jasmine.clock().install();
      try {
        component.setMode('forgot');
        component.form.patchValue({ email: 'ana@cosmos.com.pe' });

        component.sendCode();
        httpMock().expectOne(`${api}/auth/password/send-code`).flush({ message: 'Te enviamos un código.' });

        expect(component.viewMode()).toBe('reset');
        expect(component.info()).toBe('Te enviamos un código.');
        expect(component.resendIn()).toBe(60);
        component.resendCode();
        httpMock().expectNone(`${api}/auth/password/send-code`);

        jasmine.clock().tick(60_000);
        expect(component.resendIn()).toBe(0);
      } finally {
        jasmine.clock().uninstall();
      }
    });

    it('el codigo debe tener exactamente seis digitos', () => {
      component.resetForm.patchValue({
        email: 'ana@cosmos.com.pe',
        code: '123',
        newPassword: 'NuevaClave1',
        confirmPassword: 'NuevaClave1',
      });

      expect(component.resetForm.controls.code.invalid).toBeTrue();
    });

    it('la contrasena nueva exige ocho caracteres con letra y numero', () => {
      for (const mala of ['corta', 'soloLetras', '12345678']) {
        component.resetForm.patchValue({ newPassword: mala });
        expect(component.resetForm.controls.newPassword.invalid).withContext(mala).toBeTrue();
      }
      component.resetForm.patchValue({ newPassword: 'NuevaClave1' });
      expect(component.resetForm.controls.newPassword.valid).toBeTrue();
    });

    it('no restablece si las dos contrasenas no coinciden', () => {
      component.resetForm.patchValue({
        email: 'ana@cosmos.com.pe',
        code: '123456',
        newPassword: 'NuevaClave1',
        confirmPassword: 'OtraClave1',
      });

      component.confirmReset();

      httpMock().expectNone(`${api}/auth/password/reset`);
      expect(notificaciones.show).toHaveBeenCalledWith('Las contraseñas no coinciden', 'error');
    });
  });

  it('el boton de ver contrasena tiene nombre accesible (CKI12)', async () => {
    const boton: HTMLButtonElement = fixture.nativeElement.querySelector('button[aria-controls="password"]');
    expect(boton.getAttribute('aria-label')).toBe('Mostrar contraseña');

    boton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(boton.getAttribute('aria-label')).toBe('Ocultar contraseña');
    expect(boton.getAttribute('aria-pressed')).toBe('true');
  });

  it('el interruptor de ver contrasena alterna', () => {
    expect(component.showPassword()).toBeFalse();

    component.toggleShowPassword();

    expect(component.showPassword()).toBeTrue();
  });
});

describe('canUsePanel', () => {
  it('Admin y Super entran aunque su lista de pantallas venga vacia', () => {
    expect(canUsePanel('Admin', [])).toBeTrue();
    expect(canUsePanel('Super', [])).toBeTrue();
  });

  it('User no entra aunque tenga pantallas', () => {
    expect(canUsePanel('User', ['panel', 'marcaciones'])).toBeFalse();
  });

  it('cualquier otro perfil entra si abre alguna pantalla del panel', () => {
    expect(canUsePanel('Supervisor de turno', ['marcaciones'])).toBeTrue();
    expect(canUsePanel('Supervisor de turno', [])).toBeFalse();
    expect(canUsePanel(undefined, ['desconocida'])).toBeFalse();
  });
});
