import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { Icon, IconName } from '../../../../components/icon/icon';

/**
 * Barra de navegacion inferior.
 *
 * Sustituye al cajon lateral como navegacion principal. En un movil sujeto con
 * una mano, el pulgar llega comodamente a la franja inferior y no a la esquina
 * superior izquierda, que es donde estaba el boton de menu: para cambiar de
 * pantalla habia que recolocar el telefono, abrir el cajon y elegir. Aqui los
 * cuatro destinos estan a un toque y siempre visibles, asi que ademas se ve
 * en todo momento donde estas.
 *
 * El cierre de sesion se va a la ficha de cuenta de la cabecera, que es donde
 * se busca.
 */
interface Tab {
  path: string;
  label: string;
  icon: IconName;
  iconActive: IconName;
}

const TABS: Tab[] = [
  { path: '/inicio', label: 'Inicio', icon: 'home', iconActive: 'homeFill' },
  { path: '/registro', label: 'Registro', icon: 'user', iconActive: 'userFill' },
  { path: '/marcacion', label: 'Marcación', icon: 'clock', iconActive: 'clockFill' },
  { path: '/capacitaciones', label: 'Charlas', icon: 'book', iconActive: 'bookFill' },
];

@Component({
  selector: 'app-tab-bar',
  standalone: true,
  imports: [Icon],
  templateUrl: './tab-bar.html',
  styleUrl: './tab-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabBar {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly tabs = TABS;

  private readonly currentUrl = signal(this.router.url);

  /**
   * Destino activo.
   *
   * Se resuelve una vez por navegacion y no una por pestana, y se elige la
   * coincidencia mas larga para que `/capacitaciones/agregar` marque Charlas.
   */
  readonly activePath = computed(() => {
    const url = this.currentUrl();
    return (
      TABS.map(t => t.path)
        .filter(path => url === path || url.startsWith(`${path}/`))
        .sort((a, b) => b.length - a.length)[0] ?? ''
    );
  });

  /** Posicion del indicador, en porcentaje del ancho de la barra. */
  readonly activeIndex = computed(() => {
    const active = this.activePath();
    const index = TABS.findIndex(t => t.path === active);
    return index < 0 ? null : index;
  });

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(event =>
        this.currentUrl.set(event.urlAfterRedirects === '/' ? '/inicio' : event.urlAfterRedirects)
      );
  }

  go(path: string) {
    // Volver a pulsar la pestana activa no vuelve a navegar: en Angular seria
    // una recarga completa del componente sin motivo.
    if (this.activePath() === path) {
      return;
    }
    this.router.navigate([path]);
  }
}
