import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import FingerprintRegister from './fingerprint-register';
import { EnrollmentStatus, FingerprintService } from '../../services/fingerprint.service';
import { NotificationService } from '../../services/notification.service';
import { environment } from '../../../environments/environment';

/** Lector simulado: el real depende del plugin nativo de Capacitor. */
class FingerprintServiceStub {
  enrollmentStatus = signal<EnrollmentStatus | null>(null);
  isConnected = signal(true);
  capturing = signal(false);
  toast = signal('');
  clearEnrollmentStatus() {
    this.enrollmentStatus.set(null);
  }
  clearIdentificationResult() {}
  initializeScanner() {
    return Promise.resolve(true);
  }
  registerFingerprint() {
    return Promise.resolve({ success: true });
  }
  ngOnDestroy() {}
}

describe('FingerprintRegister', () => {
  let stub: FingerprintServiceStub;

  beforeEach(() => {
    stub = new FingerprintServiceStub();
    TestBed.configureTestingModule({
      imports: [FingerprintRegister],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: FingerprintService, useValue: stub },
        { provide: ActivatedRoute, useValue: { snapshot: { params: { id: 'e1' } } } },
      ],
    });
  });

  it('avisa y vuelve a la ficha cuando la huella queda registrada', async () => {
    const notify = spyOn(TestBed.inject(NotificationService), 'show');
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    jasmine.clock().install();
    try {
      const fixture = TestBed.createComponent(FingerprintRegister);
      fixture.detectChanges();
      TestBed.inject(HttpTestingController)
        .expectOne(`${environment.api}/employee/e1`)
        .flush({ _id: 'e1', firstName: 'Ana', lastName: 'Diaz', document: '1' });
      // Deja terminar el `ngOnInit` asincrono. Antes, al llegar aqui, el
      // `effect()` creado tras los `await` lanzaba NG0203 y no existia.
      await Promise.resolve();
      await Promise.resolve();

      stub.enrollmentStatus.set({ step: 3, message: 'ok', progress: 100 });
      fixture.detectChanges();

      expect(notify).toHaveBeenCalledWith('Huella registrada correctamente', 'success');
      jasmine.clock().tick(1500);
      expect(navigate).toHaveBeenCalledWith(['/registro/e1']);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('muestra el motivo cuando el registro falla', () => {
    const fixture = TestBed.createComponent(FingerprintRegister);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${environment.api}/employee/e1`).flush({ _id: 'e1' });

    stub.enrollmentStatus.set({ step: -1, message: 'Error al registrar huella para e1', progress: 0 });
    fixture.detectChanges();

    expect(fixture.componentInstance.message()).toBe('Error al registrar huella para e1');
  });
});
