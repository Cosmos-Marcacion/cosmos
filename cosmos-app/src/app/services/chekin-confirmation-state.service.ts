import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ChekinConfirmationStateService {

  private router = inject(Router)

  message = new BehaviorSubject('');
  type = new BehaviorSubject<'success' | 'error'>('success');
  visible = new BehaviorSubject(false);

  show(message: string, type: 'success' | 'error' = 'success', route: string = '/') {
    this.message.next(message)
    this.type.next(type)
    this.visible.next(true)
    setTimeout(() => {
      this.hide()
      this.router.navigate([route])
    }, 2000)
  }

  hide() {
    this.visible.next(false)
  }

  isVisible() {
    return this.visible.asObservable();
  }
}
