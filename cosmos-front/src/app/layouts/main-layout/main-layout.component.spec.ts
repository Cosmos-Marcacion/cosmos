import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { MainLayoutComponent } from './main-layout.component';
import { componentProviders } from '../../../testing/setup';
import { UserStateService } from '../../services/user-state.service';
import { ConfirmationService } from '../../services/confirmation.service';

describe('MainLayoutComponent', () => {
  let component: MainLayoutComponent;
  let fixture: ComponentFixture<MainLayoutComponent>;
  let router: Router;
  let estadoUsuario: UserStateService;
  let confirmacion: ConfirmationService;

  beforeEach(async () => {
    // El estado plegado del menu se recuerda en localStorage: sin limpiarlo,
    // una prueba que lo pliega decide con que valor arranca la siguiente.
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [MainLayoutComponent],
      providers: [
        ...componentProviders(),
        {
          // El titulo se lee de la ruta hija activa; la ruta de prueba por
          // defecto no tiene hijas.
          provide: ActivatedRoute,
          useValue: { snapshot: { children: [{ title: 'Puertos' }] } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MainLayoutComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    estadoUsuario = TestBed.inject(UserStateService);
    confirmacion = TestBed.inject(ConfirmationService);
    spyOn(router, 'navigate');
  });

  it('muestra el titulo de la pantalla activa', () => {
    expect(component.title()).toBe('Puertos');
  });

  describe('columna de modulos', () => {
    it('empieza desplegada y se pliega', () => {
      expect(component.menuPlegado()).toBeFalse();

      component.togglePlegado();

      expect(component.menuPlegado()).toBeTrue();
    });

    it('recuerda que quedo plegada', () => {
      component.togglePlegado();

      // Quien trabaja en un portatil la pliega una vez, no en cada entrada.
      const otra = TestBed.createComponent(MainLayoutComponent);
      expect(otra.componentInstance.menuPlegado()).toBeTrue();
    });
  });

  describe('el logotipo', () => {
    it('lleva a la primera pantalla que el perfil puede abrir', () => {
      spyOn(estadoUsuario, 'permissions').and.returnValue(['marcaciones', 'usuarios']);

      component.goHome();

      // No a `/panel` fijo: ese perfil no lo tiene y el guardia lo devolveria
      // con un aviso de error.
      expect(router.navigate).toHaveBeenCalledWith(['/marcaciones']);
    });

    it('en movil cierra el menu al navegar', () => {
      component.toggleMenu();

      component.goHome();

      expect(component.menuVisible).toBeFalse();
    });
  });

  it('el menu lateral empieza cerrado', () => {
    expect(component.menuVisible).toBeFalse();
    expect(component.profileMenuVisible).toBeFalse();
  });

  it('el menu lateral se abre y se cierra', () => {
    component.toggleMenu();
    expect(component.menuVisible).toBeTrue();

    component.toggleMenu();
    expect(component.menuVisible).toBeFalse();
  });

  it('pulsar fuera cierra el menu de perfil', () => {
    component.toggleProfileMenu();

    component.onBackdropClick();

    expect(component.profileMenuVisible).toBeFalse();
  });

  it('cerrar sesion pide confirmacion antes de nada', () => {
    spyOn(confirmacion, 'show');

    component.confirmation();

    // Sin el dialogo, un roce en el movil cerraria la sesion de quien esta a
    // mitad de un registro.
    expect(confirmacion.show).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('al confirmar, cierra sesion y lleva al login', () => {
    spyOn(estadoUsuario, 'logout');

    component.logout();

    expect(estadoUsuario.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('la confirmacion ejecuta el cierre de sesion cuando se acepta', () => {
    let aceptar: (() => void) | undefined;
    spyOn(confirmacion, 'show').and.callFake((_mensaje: string, alAceptar: () => void) => {
      aceptar = alAceptar;
    });
    spyOn(estadoUsuario, 'logout');

    component.confirmation();
    aceptar?.();

    expect(estadoUsuario.logout).toHaveBeenCalled();
  });
});
