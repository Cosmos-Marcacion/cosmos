import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FingerprintService } from '../../services/fingerprint.service';
import { NavigationStateService } from '../../services/navigation-state.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-fingerprint',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fingerprint.html',
  styleUrl: './fingerprint.scss'
})
export default class Fingerprint implements OnInit, OnDestroy {

  public fingerprintService = inject(FingerprintService);
  private router = inject(Router);
  private navigationStateService = inject(NavigationStateService);
  private notificationService = inject(NotificationService);

  // Signals para estado reactivo
  public isConnected = this.fingerprintService.isConnected;
  public deviceInfo = this.fingerprintService.deviceInfo;
  public identificationResult = this.fingerprintService.identificationResult;

  public isLoading = signal<boolean>(false);
  public errorMessage = signal<string>('');
  public successMessage = signal<string>('');

  // UI mínima para identificación únicamente
  public identifying = computed(() => this.fingerprintService.mode() === 'identify' || this.fingerprintService.capturing());

  async ngOnInit(): Promise<void> {
    // Limpieza de estado previo
    this.fingerprintService.clearIdentificationResult();
    this.fingerprintService.clearEnrollmentStatus();

    // Esperar un poco antes de inicializar para dar tiempo a que el dispositivo esté listo
    await new Promise<void>((r) => setTimeout(() => r(), 800));
    await this.initializeDevice();

    // Precarga de huellas desde backend para matching local por igualdad de template
    try {
      const count = await this.fingerprintService.loadAllFingerprints();
      if (count > 0) {
        this.successMessage.set(`Huellas cargadas: ${count}`);
        setTimeout(() => this.successMessage.set(''), 1500);
      }
    } catch { }

    // La navegación ahora la realiza el servicio al identificar; este componente solo inicia y muestra estado
  }

  ngOnDestroy(): void {
    this.fingerprintService.ngOnDestroy();
  }

  // Eliminado pooling; ahora usamos effect reactivo condicionado por identityArmed

  async initializeDevice(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const connected = await this.fingerprintService.initializeScanner();
      if (connected) {
        this.successMessage.set('Dispositivo ZKTeco SLK20r conectado exitosamente');
        setTimeout(() => {
          this.successMessage.set('')
          this.identifyFingerprint()
        }, 1500);
      } else {
        this.errorMessage.set('No se pudo conectar al dispositivo ZKTeco SLK20r');
      }
    } catch (error) {
      this.errorMessage.set(`Error al inicializar: ${error}`);
    } finally {
      this.isLoading.set(false);
    }
  }

  async identifyFingerprint(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');
    // Armar flujo de identidad explícitamente
    this.fingerprintService.clearIdentificationResult();

    try {
      await this.fingerprintService.identifyFingerprint();
    } catch (error) {
      this.errorMessage.set(`Error durante la identificación: ${error}`);
    } finally {
      this.isLoading.set(false);
    }
  }
}
