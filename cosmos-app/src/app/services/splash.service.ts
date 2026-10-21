import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SplashService {
  private splashVisible = new BehaviorSubject<boolean>(this.shouldShowSplash());

  constructor() {
    if (this.shouldShowSplash()) {
      setTimeout(() => {
        this.hideSplash();
        sessionStorage.removeItem('pageReloaded');
      }, 1500);
    }

    window.addEventListener('beforeunload', () => {
      sessionStorage.setItem('pageReloaded', 'true');
    });

    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        sessionStorage.removeItem('pageReloaded');
      }
    });
  }

  private shouldShowSplash(): boolean {
    const isReload = sessionStorage.getItem('pageReloaded') === 'true';

    const isFirstLoad = !sessionStorage.getItem('hasLoaded');
    if (isFirstLoad) {
      sessionStorage.setItem('hasLoaded', 'true');
    }

    return isReload && !isFirstLoad;
  }

  getSplashVisible(): Observable<boolean> {
    return this.splashVisible.asObservable();
  }

  hideSplash(): void {
    this.splashVisible.next(false);
  }

  showSplash(): void {
    this.splashVisible.next(true);
  }

  forceShowSplash(): void {
    this.showSplash();
    setTimeout(() => {
      this.hideSplash();
    }, 3000);
  }
}
