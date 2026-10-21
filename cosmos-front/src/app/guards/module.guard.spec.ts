import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router } from '@angular/router';
import { moduleGuard } from './module.guard';
import { UserStateService } from '../services/user-state.service';
import { NotificationService } from '../services/notification.service';
import { PLATFORM_MODULES, firstAllowedPath } from '../constants/platform-modules.constant';

/**
 * El guardia de módulo del frontend.
 *
 * Ocultar la opción del menú no basta: la URL se puede escribir, y quedaba una
 * pantalla que carga, lanza sus peticiones y las ve fallar con 403 una a una.
 * Esto corta antes y lleva a donde el usuario sí puede estar.
 *
 * No protege nada por sí solo —quien edite el `localStorage` verá la pantalla y
 * ninguna de sus peticiones funcionará—, y por eso el backend tiene su propio
 * guardia. Lo que se prueba aquí es que la aplicación se comporte.
 */
describe('moduleGuard', () => {
  let navegado: unknown[][];
  let avisos: { message: string; type: string }[];
  let usuario: { permissions: string[] } | null;

  function correr(moduleKey: string): boolean {
    navegado = [];
    avisos = [];

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Router, useValue: { navigate: (commands: unknown[]) => navegado.push(commands) } },
        {
          provide: NotificationService,
          useValue: { show: (message: string, type: string) => avisos.push({ message, type }) },
        },
        {
          provide: UserStateService,
          useValue: {
            permissions: () => usuario?.permissions ?? [],
            getUser: () => usuario,
          },
        },
      ],
    });

    return TestBed.runInInjectionContext(
      () => moduleGuard(moduleKey)(null as never, null as never)
    ) as boolean;
  }

  it('deja pasar a quien tiene el módulo', () => {
    usuario = { permissions: ['panel', 'marcaciones'] };
    expect(correr('marcaciones')).toBeTrue();
    expect(navegado).toEqual([]);
  });

  it('a quien no lo tiene lo lleva a su primera pantalla, no al login', () => {
    // Sacarlo al login sería decirle que su sesión no vale, que no es el caso:
    // vale, y tiene otras pantallas.
    usuario = { permissions: ['marcaciones'] };

    expect(correr('usuarios')).toBeFalse();
    expect(navegado).toEqual([['/marcaciones']]);
    expect(avisos[0].type).toBe('error');
  });

  it('sin sesión manda el login', () => {
    usuario = null;
    expect(correr('panel')).toBeFalse();
    expect(navegado).toEqual([['/login']]);
    // Y sin aviso: no es que le falte un permiso, es que no ha entrado.
    expect(avisos).toEqual([]);
  });

  it('un perfil sin ningún módulo no entra a ninguna parte', () => {
    usuario = { permissions: [] };
    expect(correr('panel')).toBeFalse();
    expect(navegado).toEqual([['/login']]);
  });
});

describe('catálogo de módulos del frontend', () => {
  it('la primera pantalla permitida respeta el orden del menú', () => {
    // Se entra por donde el menú empieza, no por la primera que se encuentre en
    // los permisos: el orden de un array guardado no significa nada.
    expect(firstAllowedPath(['generador', 'panel'])).toBe('/panel');
    expect(firstAllowedPath(['generador'])).toBe('/generador');
  });

  it('sin permisos no hay a dónde ir', () => {
    expect(firstAllowedPath([])).toBe('/login');
  });

  it('las claves son únicas y cada módulo lleva su ruta', () => {
    const keys = PLATFORM_MODULES.map(module => module.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(PLATFORM_MODULES.filter(module => !module.path.startsWith('/'))).toEqual([]);
  });

  /**
   * Este catálogo es el espejo del backend. Si divergen, el menú ofrece una
   * pantalla que la API no reconoce, o al revés: un permiso concedido que no
   * aparece en ninguna parte.
   */
  it('cubre los módulos que el backend concede', () => {
    const esperados = [
      'panel', 'marcaciones', 'usuarios', 'perfiles', 'puertos',
      'puntos', 'formatos', 'generador', 'sincronizar-empleados',
    ];
    expect(PLATFORM_MODULES.map(module => module.key)).toEqual(esperados);
  });
});
