import { Injectable, computed, signal } from '@angular/core';

export type NotificationType = 'success' | 'error' | 'warning';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly state = signal<{
    message: string;
    type: NotificationType;
    visible: boolean;
  }>({ message: '', type: 'success', visible: false });

  readonly message = computed(() => this.state().message);
  readonly type = computed(() => this.state().type);
  readonly visible = computed(() => this.state().visible);

  /**
   * Temporizador de cierre.
   *
   * Se guarda para poder cancelarlo. Antes cada `show()` programaba el suyo sin
   * anular el anterior: dos avisos seguidos dejaban dos temporizadores vivos y
   * el del primero cerraba el segundo antes de que diera tiempo a leerlo.
   */
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(message: string, type: NotificationType = 'success', time: number = 5000) {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.state.set({ message, type, visible: true });
    this.timer = setTimeout(() => this.hide(), time);
  }

  hide() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.state.update(s => ({ ...s, visible: false }));
  }

  /** Se conserva el nombre por compatibilidad con quien ya lo consumia. */
  isVisible() {
    return this.visible;
  }
}
