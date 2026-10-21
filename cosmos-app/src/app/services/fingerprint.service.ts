import { inject, Injectable, NgZone, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, lastValueFrom } from 'rxjs';
import { PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { fingercosmosPlugin } from '../interfaces/definition';
import { Router } from '@angular/router';
import { NavigationStateService } from './navigation-state.service';
import { NotificationService } from './notification.service';
import { FeedbackSoundService } from './feedback-sound.service';
import { identificationParams } from './mark-identification';

const ZKTecoFingerprint = registerPlugin<fingercosmosPlugin>('fingercosmos');
import { environment } from '../../environments/environment';
// import { IEmployeeResponse } from '../modules/employee-register/interfaces/employee.interface';

export interface EnrollmentStatus {
  step: number;
  message: string;
  progress: number;
}

export interface IdentificationResult {
  match: boolean;
  userId?: string;
  employeeId?: string;
  score?: number;
  timestamp?: number;
}

export interface DeviceStatus {
  connected: boolean;
  message: string;
}

// Eliminado RegisteredUser: no gestionamos usuarios en front.

// Sin tipos de almacenamiento local de huellas en frontend

@Injectable({
  providedIn: 'root'
})
export class FingerprintService {

  private ngZone = inject(NgZone);
  private http = inject(HttpClient);
  private baseUrl = environment.api;

  // Signals para estado reactivo
  public isConnected = signal<boolean>(false);
  public deviceInfo = signal<string>('');
  public enrollmentStatus = signal<EnrollmentStatus | null>(null);
  public identificationResult = signal<IdentificationResult | null>(null);
  public toast = signal<string>('');
  public capturing = signal<boolean>(false);
  public mode = signal<'idle' | 'register' | 'identify'>('idle');

  // Sin almacenamiento local de templates. El matching y persistencia se delegan al backend.
  // Mapas locales de huellas para matching por igualdad de template
  private fingerprintsMap = new Map<string, string>(); // templateBase64 -> employeeId
  public fingerprintsLoaded = signal<boolean>(false);

  // Observables para compatibilidad
  private enrollmentStatusSubject = new BehaviorSubject<EnrollmentStatus | null>(null);
  public enrollmentStatus$: Observable<EnrollmentStatus | null> = this.enrollmentStatusSubject.asObservable();

  private identificationResultSubject = new BehaviorSubject<IdentificationResult | null>(null);
  public identificationResult$: Observable<IdentificationResult | null> = this.identificationResultSubject.asObservable();

  private listenerHandles: PluginListenerHandle[] = [];

  // Campos de depuración (último template capturado)
  public lastCapturedTemplate = signal<string | null>(null);
  public lastCapturedQuality = signal<number | null>(null);
  public lastCapturedLen = signal<number | null>(null);

  private router = inject(Router);
  private navigationStateService = inject(NavigationStateService);
  private notificationService = inject(NotificationService);
  private sound = inject(FeedbackSoundService);
  /**
   * Inicializa la conexión con el dispositivo ZKTeco SLK20r
   */
  async initializeScanner(): Promise<boolean> {
    try {
      const result = await ZKTecoFingerprint.initialize();

      this.ngZone.run(() => {
        this.isConnected.set(result.connected);
        this.deviceInfo.set(result.deviceInfo || '');
      });

      if (result.connected) {
        this.setupListeners();
        // Cargar referencias en el plugin para matching local por SDK (si ya las tenemos en memoria)
        if (this.fingerprintsLoaded()) {
          await this.pushReferencesToPlugin();
        }
        // Asegurar que la captura no se detenga automáticamente
        try {
          await this.configureDevice({ timeout: 0 });
        } catch (err) {
          console.warn('No se pudo configurar timeout del dispositivo', err);
        }
      }

      return result.connected;
    } catch (error) {
      console.error('Error al inicializar el escáner:', error);
      this.ngZone.run(() => {
        this.isConnected.set(false);
        this.deviceInfo.set('Error de conexión');
      });
      throw error;
    }
  }
  /** Empuja las referencias locales cargadas al plugin nativo para matching por SDK. */
  private async pushReferencesToPlugin(threshold: number = 0): Promise<void> {
    try {
      const refs = Array.from(this.fingerprintsMap.entries()).map(([tpl, empId]) => ({ employeeId: empId, template: tpl }));
      await (ZKTecoFingerprint as any).loadReferences({ refs, threshold });
    } catch (err) {
      console.warn('No se pudieron enviar referencias al plugin', err);
    }
  }

  /**
   * Registra una nueva huella digital para un empleado
   */
  async registerFingerprint(userId: string, employeeId: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.isConnected()) {
        throw new Error('El dispositivo no está conectado');
      }

      const result = await ZKTecoFingerprint.startRegistration({ userId, employeeId });

      if (result.success) {
        // Mensaje de guía UX
        this.toast.set('');
        this.capturing.set(true);
        this.mode.set('register');
      }

      return result;
    } catch (error) {
      console.error('Error durante el registro:', error);
      throw error;
    }
  }

  /**
   * Persiste el template en backend y marca al empleado como con huella
   */
  saveFingerprint(employeeId: string, templateBase64: string, templateLen?: number | null, quality?: number | null) {
    const url = `${this.baseUrl}/fingerprint/save`;
    const payload = {
      employeeId,
      template: templateBase64,
      quality: typeof quality === 'number' ? quality : undefined,
      templateLen: typeof templateLen === 'number' ? templateLen : undefined,
    };

    return this.http.post(url, payload)
  }

  // Eliminado updateEmployeeIssetFinger. Backend decide estado del empleado.

  // Eliminado uso de /fingerprint/identity para identificación local

  /** Reinicia identificación del huellero tras un proceso (seguro, sin depender de estados). */
  private async restartIdentification(delayMs: number = 300): Promise<void> {
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      if (!this.isConnected()) return;
      await ZKTecoFingerprint.startIdentification();
    } catch (err) {
      console.warn('No se pudo reiniciar la identificación', err);
    }
  }

  /** Carga todas las huellas registradas desde backend para matching local. */
  async loadAllFingerprints(): Promise<number> {
    try {
      const url = `${this.baseUrl}/fingerprint`;
      const list = await lastValueFrom(this.http.get<any[]>(url));
      this.fingerprintsMap.clear();
      for (const row of list || []) {
        const tpl: unknown = (row?.template ?? row?.fingerprint ?? row?.tpl);
        const id: unknown = (row?.employeeId ?? row?.employee?._id ?? row?.id ?? row?._id);
        if (typeof tpl === 'string' && tpl.length > 0 && typeof id === 'string' && id.length > 0) {
          this.fingerprintsMap.set(tpl, id);
        }
      }
      this.fingerprintsLoaded.set(true);
      // Enviar referencias al plugin para matching avanzado
      await this.pushReferencesToPlugin();
      return this.fingerprintsMap.size;
    } catch (err) {
      console.warn('No se pudo cargar huellas desde backend', err);
      this.fingerprintsLoaded.set(false);
      return 0;
    }
  }

  /** Matching local básico por igualdad de template. */
  findLocalMatch(templateBase64?: string | null): string | null {
    if (!templateBase64) return null;
    const found = this.fingerprintsMap.get(templateBase64);
    return found ?? null;
  }

  // Sin helper de persistencia adicional en front.

  /**
   * Inicia el proceso de identificación/autenticación
   */
  async identifyFingerprint(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.isConnected()) {
        throw new Error('El dispositivo no está conectado');
      }

      const result = await ZKTecoFingerprint.startIdentification();
      this.toast.set(' en el sensor para identificar');
      this.capturing.set(true);
      this.mode.set('identify');

      // El resultado real viene a través del listener fingerprintEvent
      return result;
    } catch (error) {
      console.error('Error durante la identificación:', error);
      throw error;
    }
  }

  /**
   * Elimina una huella digital registrada
   */
  async deleteFingerprint(userId: string): Promise<{ success: boolean, userId: string }> {
    try {
      const result = await ZKTecoFingerprint.deleteFingerprint({ userId });

      // Sin refresco local; la fuente de verdad es backend.

      return result;
    } catch (error) {
      console.error('Error al eliminar huella:', error);
      throw error;
    }
  }

  // Eliminado manejo de usuarios registrados en front.

  /**
   * Verifica el estado de conexión del dispositivo
   */
  async checkConnection(): Promise<{ connected: boolean, deviceInfo?: string }> {
    try {
      const result = await ZKTecoFingerprint.checkConnection();

      this.ngZone.run(() => {
        this.isConnected.set(result.connected);
        this.deviceInfo.set(result.deviceInfo || '');
      });

      return result;
    } catch (error) {
      console.error('Error al verificar conexión:', error);
      throw error;
    }
  }

  /**
   * Configura parámetros del dispositivo
   */
  async configureDevice(options: {
    timeout?: number;
    sensitivity?: number;
    beepEnabled?: boolean
  }): Promise<{ success: boolean }> {
    try {
      return await ZKTecoFingerprint.configureDevice(options);
    } catch (error) {
      console.error('Error al configurar dispositivo:', error);
      throw error;
    }
  }

  /**
   * Configura los listeners para eventos del dispositivo
   */
  private async setupListeners(): Promise<void> {
    try {
      // Listener para eventos generales del fingerprint
      const fingerprintListener = await ZKTecoFingerprint.addListener('fingerprintEvent', (data: any) => {
        this.ngZone.run(() => {
          console.log('Evento fingerprint recibido: TYPE', JSON.stringify(data));
          // alert('Evento fingerprint recibido:' + JSON.stringify(data));

          switch (data.type) {
            case 'success':
              // Éxito en registro
              this.enrollmentStatus.set({
                step: 3,
                message: data.message,
                progress: 100
              });
              this.enrollmentStatusSubject.next({
                step: 3,
                message: data.message,
                progress: 100
              });
              this.toast.set(data.message);
              this.capturing.set(false);
              this.mode.set('idle');
              break;

            case 'error':
              // Error en cualquier operación
              this.enrollmentStatus.set({
                step: -1,
                message: data.message,
                progress: 0
              });
              this.enrollmentStatusSubject.next({
                step: -1,
                message: data.message,
                progress: 0
              });
              this.toast.set(data.message);
              this.capturing.set(false);
              this.mode.set('idle');
              break;

            case 'identification': {
              // Guardar últimos datos capturados (para depuración)
              this.lastCapturedTemplate.set(data.template || null);
              this.lastCapturedQuality.set(typeof data.quality === 'number' ? data.quality : null);
              this.lastCapturedLen.set(typeof data.templateLen === 'number' ? data.templateLen : null);

              // Confiar en el resultado del plugin (algoritmo SDK). Fallback a igualdad si viniera sin match y tenemos template
              let employeeId: string | undefined = data.employeeId;
              if (!employeeId) {
                const eq = this.findLocalMatch(data.template);
                if (eq) employeeId = eq;
              }
              if (employeeId) {
                this.navigationStateService.markInternalNavigation();
                this.router.navigate([`/validacion-registro/${employeeId}`], {
                  queryParams: identificationParams({
                    method: 'huella',
                    score: typeof data.score === 'number' ? data.score : undefined,
                  }),
                });
                this.toast.set(`Identificado: ${employeeId}`);
              } else {
                // Sin coincidencia se vuelve a /marcacion. Antes se hacia en
                // silencio (`toast` no se pinta en ninguna pantalla) y parecia
                // que la app se habia saltado el paso: quien marcaba no sabia
                // si reintentar o cambiar de metodo.
                this.toast.set('No se encontró coincidencia');
                this.ngZone.run(() => {
                  this.notificationService.show('No te hemos reconocido. Vuelve a intentarlo o usa otro método.', 'error');
                  this.sound.error();
                });
                this.navigationStateService.markInternalNavigation();
                this.router.navigate(['/marcacion']);
              }
              this.capturing.set(false);
              this.mode.set('idle');
              void this.restartIdentification();
              break;
            }

            case 'registration': {
              const empId: string = data.employeeId || data.userId;
              this.saveFingerprint(empId, data.template, data.templateLen, data.quality)
                .subscribe({
                  next: () => {
                    // Actualizar cache local y reenviar referencias al plugin
                    if (typeof data.template === 'string' && empId) {
                      this.fingerprintsMap.set(data.template, empId);
                      this.fingerprintsLoaded.set(true);
                      void this.pushReferencesToPlugin();
                    }
                    this.enrollmentStatus.set({ step: 3, message: `Huella registrada para ${empId}`, progress: 100 });
                    this.enrollmentStatusSubject.next({ step: 3, message: `Huella registrada para ${empId}`, progress: 100 });
                    this.toast.set(`Huella registrada para ${empId}`);
                  },
                  error: () => {
                    this.enrollmentStatus.set({ step: -1, message: `Error al registrar huella para ${empId}`, progress: 0 });
                    this.enrollmentStatusSubject.next({ step: -1, message: `Error al registrar huella para ${empId}`, progress: 0 });
                    this.toast.set('Error al registrar huella');
                    // `complete` no se emite tras un error: sin esto `capturing`
                    // quedaba en true y el boton "Registrar" no volvia a activarse.
                    this.capturing.set(false);
                    this.mode.set('idle');
                    void this.restartIdentification();
                  },
                  complete: () => {
                    this.capturing.set(false);
                    this.mode.set('idle');
                    // Reiniciar identificación tras finalizar registro
                    void this.restartIdentification();
                  }
                });
              break;
            }
          }
        });
      });

      this.listenerHandles.push(fingerprintListener);
    } catch (error) {
      console.error('Error al configurar listeners:', error);
    }
  }

  /**
   * Limpia todos los listeners
   */
  private cleanupListeners(): void {
    this.listenerHandles.forEach(handle => {
      if (handle) {
        handle.remove();
      }
    });
    this.listenerHandles = [];
  }

  /**
   * Limpia el estado de registro
   */
  clearEnrollmentStatus(): void {
    this.ngZone.run(() => {
      this.enrollmentStatus.set(null);
      this.enrollmentStatusSubject.next(null);
    });
  }

  /**
   * Limpia el resultado de identificación
   */
  clearIdentificationResult(): void {
    this.ngZone.run(() => {
      this.identificationResult.set(null);
      this.identificationResultSubject.next(null);
    });
  }

  /**
   * Método de compatibilidad para el registro (alias de registerFingerprint)
   */
  async register(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Usar un employeeId por defecto si no se proporciona
      const result = await this.registerFingerprint(userId, userId);
      return result;
    } catch (error) {
      console.error('Error durante el registro:', error);
      throw error;
    }
  }

  /**
   * Destruye el servicio y limpia recursos
   */
  ngOnDestroy(): void {
    this.cleanupListeners();
  }

  // async register(_id: string): Promise<any> {
  //   const options$: any = this.http.post<PublicKeyCredentialCreationOptionsJSON>(
  //     `${this.backendUrl}/fingerprint/register-options`,
  //     { _id }
  //   );
  //   const options: any = await firstValueFrom(options$);
  //   const userId = options?.user?.id; // Obtenemos el ID de usuario (_id de Mongoose)


  //   let regResponse: RegistrationResponseJSON;
  //   try {
  //     regResponse = await startRegistration(options);
  //   } catch (error) {
  //     console.error(error);
  //     throw new Error('No se pudo crear la credencial.');
  //   }


  //   const verification$: any = this.http.post(
  //     `${this.backendUrl}/fingerprint/verify-registration`,
  //     { ...regResponse, userId } // Enviamos el userId para asociarlo
  //   );

  //   return firstValueFrom(verification$);
  // }

  // async login(): Promise<any> {
  //   const options$: any = this.http.post<PublicKeyCredentialRequestOptionsJSON>(
  //     `${this.backendUrl}/fingerprint/login-options`,
  //     {}
  //   );
  //   const options = await firstValueFrom(options$);

  //   let authResponse: AuthenticationResponseJSON;
  //   try {
  //     authResponse = await startAuthentication(options as any);
  //   } catch (error) {
  //     console.error(error);
  //     throw new Error('No se pudo autenticar.');
  //   }

  //   const verification$: any = this.http.post(
  //     `${this.backendUrl}/fingerprint/verify-login`,
  //     authResponse
  //   );

  //   return firstValueFrom(verification$);
  // }

}
