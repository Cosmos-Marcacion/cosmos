import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MenuComponent } from './components/menu/menu.component';
import { UserStateService } from '../../services/user-state.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { firstAllowedPath } from '../../constants/platform-modules.constant';

/** Donde se recuerda si la columna de modulos quedo plegada. */
const CLAVE_MENU_PLEGADO = 'menu-plegado--cosmos-front-ls';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, MenuComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent {
  private readonly userStateService = inject(UserStateService);
  private readonly router = inject(Router);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly route = inject(ActivatedRoute);

  menuVisible = false;
  profileMenuVisible = false;
  user = this.userStateService.getUser();

  /**
   * La columna de modulos, plegada a una barra de iconos.
   *
   * Se recuerda entre visitas: quien trabaja en un portatil la pliega una vez
   * y no quiere volver a hacerlo en cada entrada. El `try` es por la ventana
   * de incognito y por los navegadores con el almacenamiento bloqueado, donde
   * leerlo lanza en vez de devolver vacio.
   */
  readonly menuPlegado = signal(MainLayoutComponent.leerPlegado());

  /**
   * El titulo de la pantalla, tomado del `title` de la ruta.
   *
   * Es una senal y no un metodo: leido desde la plantilla se recalculaba en
   * cada pasada de deteccion, y ademas sobre `snapshot`, que no se vuelve a
   * leer solo. Ahora se actualiza donde corresponde, al terminar de navegar.
   */
  private readonly titulo = signal(this.tituloActual());
  readonly title = computed(() => this.titulo());

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => this.titulo.set(this.tituloActual()));
  }

  private tituloActual(): string {
    return this.route.snapshot.children[0]?.title ?? '';
  }

  private static leerPlegado(): boolean {
    try {
      return localStorage.getItem(CLAVE_MENU_PLEGADO) === 'si';
    } catch {
      return false;
    }
  }

  togglePlegado() {
    const plegado = !this.menuPlegado();
    this.menuPlegado.set(plegado);
    try {
      localStorage.setItem(CLAVE_MENU_PLEGADO, plegado ? 'si' : 'no');
    } catch {
      // Sin almacenamiento el menu sigue plegandose; solo no se recuerda.
    }
  }

  /**
   * El logotipo vuelve a la pantalla principal.
   *
   * No a `/panel` fijo: esa ruta tiene su guardia de modulo, y a un perfil sin
   * el panel el guardia le saca un aviso de error y lo desvia. Se usa la misma
   * primera pantalla permitida que usa el guardia, asi que el logo lleva a
   * donde esa persona si puede estar.
   */
  goHome() {
    this.router.navigate([firstAllowedPath(this.userStateService.permissions())]);
    if (this.menuVisible) {
      this.toggleMenu();
    }
  }

  toggleMenu() {
    this.menuVisible = !this.menuVisible;
  }

  toggleProfileMenu() {
    this.profileMenuVisible = !this.profileMenuVisible;
  }

  closeProfileMenu() {
    this.profileMenuVisible = false;
  }

  onBackdropClick() {
    this.closeProfileMenu();
  }

  confirmation() {
    this.confirmationService.show('¿Estás seguro de querer cerrar sesión?', () => {
      this.logout();
    });
  }

  logout() {
    this.userStateService.logout();
    this.router.navigate(['/login']);
  }
}
