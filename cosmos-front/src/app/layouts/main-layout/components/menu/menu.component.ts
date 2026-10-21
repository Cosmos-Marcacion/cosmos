import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UserStateService } from '../../../../services/user-state.service';
import { ConfirmationService } from '../../../../services/confirmation.service';
import { PLATFORM_MODULES } from '../../../../constants/platform-modules.constant';

/**
 * Una entrada del menu.
 *
 * `path` es a donde lleva y `match` con que trozo de la URL se considera
 * activa: Formatos lleva al maestro (`/formatos/maestro`) pero tiene que
 * quedarse resaltado en cualquier pantalla de `/formatos`.
 */
interface MenuItem {
  key: string;
  label: string;
  path: string;
  match: string;
}

/**
 * Menu lateral de modulos.
 *
 * ## Por que las entradas son datos y no nueve bloques de plantilla
 *
 * Estaban escritas a mano, una por una, con su icono en linea: 293 lineas para
 * nueve entradas que solo se diferencian en el icono, la etiqueta y la ruta.
 * Cualquier cambio transversal —y el modo compacto lo es— habia que repetirlo
 * nueve veces, con nueve oportunidades de que una se quedara atras.
 *
 * Las etiquetas y las rutas salen de `PLATFORM_MODULES`, que ya es la lista
 * que comparten el guardia de rutas y la pantalla de perfiles. Aqui solo se
 * declara en que orden se pintan y con que icono, que es lo unico que es
 * decision de este menu. El icono sigue en la plantilla, por clave: meterlo en
 * TypeScript obligaria a marcar el SVG como seguro y a desactivar la
 * sanitizacion, que es mucho pagar por no escribir un `@switch`.
 *
 * ## El modo compacto
 *
 * Con `compact` la columna se queda en los iconos. La etiqueta desaparece de
 * la vista pero no del arbol de accesibilidad: el enlace conserva su nombre
 * por `aria-label`, asi que un lector de pantalla sigue anunciando "Usuarios"
 * y no "enlace".
 */
@Component({
  selector: 'app-menu',
  imports: [],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.scss',
})
export class MenuComponent {
  /** La columna esta plegada: solo iconos. */
  readonly compact = input<boolean>(false);

  readonly closeMenu = output<void>();

  private readonly router = inject(Router);
  private readonly userStateService = inject(UserStateService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);

  /** Orden de aparicion. Formatos se resalta en todo `/formatos`. */
  private static readonly ORDEN: { key: string; match?: string }[] = [
    { key: 'panel' },
    { key: 'usuarios' },
    { key: 'perfiles' },
    { key: 'marcaciones' },
    { key: 'puertos' },
    { key: 'puntos' },
    { key: 'formatos', match: '/formatos' },
    { key: 'generador' },
    { key: 'sincronizar-empleados' },
  ];

  readonly items: MenuItem[] = MenuComponent.ORDEN.map(({ key, match }) => {
    const modulo = PLATFORM_MODULES.find(m => m.key === key);
    if (!modulo) {
      // Una clave que no esta en el catalogo es un error de programacion, no
      // un permiso que falte: se ve al arrancar y no en produccion.
      throw new Error(`El menú referencia un módulo que no existe: ${key}`);
    }
    return { key, label: modulo.label, path: modulo.path, match: match ?? modulo.path };
  });

  readonly path = signal('');

  constructor() {
    this.path.set(this.router.url === '/' ? '/panel' : this.router.url);
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(event => this.path.set(event.url === '/' ? '/panel' : event.url));
  }

  logout() {
    this.userStateService.logout();
    this.router.navigate(['/login']);
  }

  confirmation() {
    this.confirmationService.show('¿Estás seguro de querer cerrar sesión?', () => {
      this.logout();
    });
  }

  close() {
    this.closeMenu.emit();
  }

  navigateToPath(path: string) {
    this.router.navigate([path]);
    this.close();
  }

  isSelected(match: string) {
    return this.path().includes(match);
  }

  /**
   * Si el perfil de quien mira puede abrir un modulo.
   *
   * El menu se filtra con esto, pero no es lo que protege: la ruta se puede
   * escribir a mano y la API tambien. Quien decide de verdad es el guardia del
   * backend; aqui solo se evita ofrecer una opcion que va a dar 403.
   */
  can(moduleKey: string): boolean {
    return this.userStateService.can(moduleKey);
  }

  /**
   * Las entradas que este perfil puede abrir, ya en orden.
   *
   * `computed` y no un metodo: la plantilla lo lee en cada pasada de deteccion
   * y filtrar nueve entradas cada vez, para un resultado que solo cambia
   * cuando cambia la sesion, es trabajo que no hace falta.
   */
  readonly visibles = computed(() =>
    this.items.filter(item => this.userStateService.permissions().includes(item.key))
  );
}
