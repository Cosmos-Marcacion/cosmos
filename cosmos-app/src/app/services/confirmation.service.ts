import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ConfirmationService {

  private _message = signal<string>('');
  private _visible = signal<boolean>(false);
  private _callback = signal<() => void>(() => { });

  message = this._message.asReadonly();
  visible = this._visible.asReadonly();
  callback = this._callback.asReadonly();

  show(message: string, callback: () => void) {
    this._message.set(message);
    this._callback.set(callback);
    this._visible.set(true);
  }

  hide() {
    this._visible.set(false);
    this._message.set('');
    this._callback.set(() => { });
  }

  confirm() {
    this.callback()();
    this.hide();
  }

  cancel() {
    this.hide();
  }

}
