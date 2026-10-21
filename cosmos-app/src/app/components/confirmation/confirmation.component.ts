import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { ConfirmationService } from '../../services/confirmation.service';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-confirmation',
  standalone: true,
  imports: [Icon],
  templateUrl: './confirmation.component.html',
  styleUrl: './confirmation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmationComponent {
  readonly confirmationService = inject(ConfirmationService);

  /** Escape cancela, que es lo que espera cualquiera ante un dialogo. */
  @HostListener('document:keydown.escape')
  onEscape() {
    this.confirmationService.cancel();
  }
}
