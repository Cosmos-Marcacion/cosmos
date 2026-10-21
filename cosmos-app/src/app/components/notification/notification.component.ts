import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NotificationService } from '../../services/notification.service';
import { Icon, IconName } from '../icon/icon';

@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [Icon],
  templateUrl: './notification.component.html',
  styleUrl: './notification.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationComponent {
  readonly notificationService = inject(NotificationService);

  readonly type = this.notificationService.type;
  readonly message = this.notificationService.message;

  readonly icon = computed<IconName>(() => {
    switch (this.type()) {
      case 'success':
        return 'check';
      case 'error':
        return 'close';
      default:
        return 'alert';
    }
  });

  hide() {
    this.notificationService.hide();
  }
}
