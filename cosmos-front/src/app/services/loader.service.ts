import { Injectable, ApplicationRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LoaderService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  constructor(private appRef: ApplicationRef) { }

  show() {
    // Ejecutamos el cambio de estado en la siguiente vuelta del ciclo de detección
    Promise.resolve().then(() => {
      this.loadingSubject.next(true);
      this.appRef.tick();
    });
  }

  hide() {
    Promise.resolve().then(() => {
      this.loadingSubject.next(false);
      this.appRef.tick();
    });
  }

  isLoading() {
    return this.loadingSubject.getValue();
  }
}
