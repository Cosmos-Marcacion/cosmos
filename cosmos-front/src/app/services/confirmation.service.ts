import { Injectable, signal } from '@angular/core';

/**
 * Cómo se presenta una confirmación.
 *
 * "Sí / No" sirve para cerrar sesión, pero no para "descartar el borrador":
 * delante de una acción que borra trabajo, lo que se lee en el botón es lo
 * único que dice qué va a pasar. `confirmLabel` deja nombrar la acción, y
 * `danger` la pinta como lo que es.
 */
export interface ConfirmationOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  /** Detalle bajo el mensaje: qué se pierde, qué se conserva. */
  detail?: string;
  /** La acción destruye algo y el botón lo advierte. */
  danger?: boolean;
  /** Qué hacer si se cancela. Hace falta para deshacer lo ya movido en pantalla. */
  onCancel?: () => void;
}

@Injectable({
  providedIn: 'root'
})
export class ConfirmationService {

  private _message = signal<string>('');
  private _visible = signal<boolean>(false);
  private _callback = signal<() => void>(() => { });
  private _options = signal<ConfirmationOptions>({});

  message = this._message.asReadonly();
  visible = this._visible.asReadonly();
  callback = this._callback.asReadonly();
  options = this._options.asReadonly();

  show(message: string, callback: () => void, options: ConfirmationOptions = {}) {
    this._message.set(message);
    this._callback.set(callback);
    this._options.set(options);
    this._visible.set(true);
  }

  hide() {
    this._visible.set(false);
    this._message.set('');
    this._callback.set(() => { });
    this._options.set({});
  }

  confirm() {
    const callback = this.callback();
    this.hide();
    callback();
  }

  cancel() {
    const { onCancel } = this._options();
    this.hide();
    onCancel?.();
  }

}
