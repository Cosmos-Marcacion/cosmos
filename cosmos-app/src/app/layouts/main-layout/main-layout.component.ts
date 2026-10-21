import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { UserStateService } from '../../services/user-state.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { Icon } from '../../components/icon/icon';
import { TabBar } from './components/tab-bar/tab-bar';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, Icon, TabBar],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent {
  private readonly userStateService = inject(UserStateService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly router = inject(Router);

  readonly user = this.userStateService.getUser();

  // Estado como senales: con la aplicacion sin Zone.js son ellas las que
  // programan el repintado. Antes eran campos sueltos que solo se refrescaban
  // porque el evento de click ya disparaba una comprobacion; cualquier cambio
  // desde otro sitio se habria quedado sin pintar.
  readonly profileMenuVisible = signal(false);

  toggleProfileMenu() {
    this.profileMenuVisible.update(v => !v);
  }

  closeProfileMenu() {
    this.profileMenuVisible.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closeProfileMenu();
  }

  /**
   * Cierre de sesion.
   *
   * Vivia al fondo del cajon lateral. Al pasar la navegacion a la barra
   * inferior, el cajon desaparece y esto se coloca donde se busca: en la ficha
   * de la cuenta.
   */
  confirmLogout() {
    this.closeProfileMenu();
    this.confirmationService.show('¿Estás seguro de querer cerrar sesión?', () => {
      this.userStateService.logout();
      this.router.navigate(['/login']);
    });
  }
}
