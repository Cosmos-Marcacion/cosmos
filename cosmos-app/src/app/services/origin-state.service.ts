import { Injectable, signal } from '@angular/core';
@Injectable({
  providedIn: 'root',
})
export class OriginStateService {

  private origin = signal<string | null>(null);

  setOrigin(origin: string) {
    this.origin.set(origin);
  }

  getOrigin() {
    return this.origin();
  }

}

