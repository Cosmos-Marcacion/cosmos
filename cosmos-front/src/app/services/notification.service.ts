import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * `warning` es para lo que salió adelante pero con una salvedad que el usuario
 * debe leer, como un formato emitido con personal truncado.
 */
export type NotificationType = 'success' | 'error' | 'warning';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  message = new BehaviorSubject('');
  type = new BehaviorSubject<NotificationType>('success');
  visible = new BehaviorSubject(false);

  show(message: string, type: NotificationType = 'success') {
    this.message.next(message);
    this.type.next(type);
    this.visible.next(true);

    setTimeout(() => this.hide(), 5000);
  }

  hide() {
    this.visible.next(false);
  }

  isVisible() {
    return this.visible.asObservable();
  }
}
