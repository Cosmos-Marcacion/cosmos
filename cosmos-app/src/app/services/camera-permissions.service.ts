import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Camera, PermissionStatus } from '@capacitor/camera';

import { BehaviorSubject } from 'rxjs';

export type CameraPermissionState = PermissionStatus['camera'];

export interface CameraPermissionStatus {
  camera: CameraPermissionState;
}

export interface CameraConstraints {
  width?: { ideal?: number; min?: number; max?: number };
  height?: { ideal?: number; min?: number; max?: number };
  facingMode?: 'user' | 'environment' | 'left' | 'right';
  frameRate?: { ideal?: number; min?: number; max?: number };
  aspectRatio?: number;
}

/** Estados en los que el sistema todavia puede mostrar su dialogo de permiso. */
export function canAskCameraPermission(state: CameraPermissionState | undefined): boolean {
  return state === 'prompt' || state === 'prompt-with-rationale';
}

@Injectable({
  providedIn: 'root'
})
export class CameraPermissionsService {


  // Signals para el estado del servicio
  private readonly _permissionStatus = signal<CameraPermissionStatus | null>(null);
  private readonly _isCameraAvailable = signal(false);
  private readonly _isInitialized = signal(false);

  // Computed signals
  readonly permissionStatus = this._permissionStatus.asReadonly();
  readonly isCameraAvailable = this._isCameraAvailable.asReadonly();
  readonly isInitialized = this._isInitialized.asReadonly();

  // Subjects para comunicación reactiva
  private readonly _permissionChanged$ = new BehaviorSubject<CameraPermissionStatus | null>(null);
  private readonly _cameraStateChanged$ = new BehaviorSubject<boolean>(false);

  // Observables públicos
  readonly permissionChanged$ = this._permissionChanged$.asObservable();
  readonly cameraStateChanged$ = this._cameraStateChanged$.asObservable();

  constructor() {
    this.initializeService();
  }

  /**
   * Inicializa el servicio
   *
   * El estado se leia una sola vez, en el constructor. Si la persona concedia
   * la camara desde Ajustes con la app abierta, al volver la app seguia
   * creyendo que no tenia permiso. Ahora se vuelve a leer en cada `resume`.
   */
  private async initializeService(): Promise<void> {
    try {
      await this.checkPermissions();
      this._isInitialized.set(true);
    } catch (error) {
      console.error('Error al inicializar el servicio de permisos de cámara:', error);
    }

    if (this.isMobile) {
      App.addListener('resume', () => {
        this.checkPermissions().catch(error =>
          console.error('Error al releer permisos de cámara al volver a la app:', error)
        );
      }).catch(error => console.error('No se pudo escuchar el regreso a la app:', error));
    }
  }

  /**
   * Verifica si la aplicación está ejecutándose en un dispositivo móvil
   */
  get isMobile(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Verifica si la aplicación está ejecutándose en Android
   */
  get isAndroid(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  /**
   * Verifica si la aplicación está ejecutándose en iOS
   */
  get isIOS(): boolean {
    return Capacitor.getPlatform() === 'ios';
  }

  /**
   * Verifica si la aplicación está ejecutándose en el navegador
   */
  get isWeb(): boolean {
    return Capacitor.getPlatform() === 'web';
  }

  /**
   * Verifica los permisos de cámara
   */
  private async checkCameraPermission(): Promise<CameraPermissionState> {
    if (!this.isMobile) {
      return 'granted'; // En web, asumimos que está permitido
    }

    try {
      const permission = await Camera.checkPermissions();
      return permission.camera;
    } catch (error) {
      console.error('Error al verificar permisos de cámara:', error);
      return 'prompt';
    }
  }

  /**
   * Verifica el permiso de camara.
   *
   * Antes se llamaba tres veces a `Camera.checkPermissions()` por lectura y se
   * pedia un `storage` que el plugin de Capacitor 7 no devuelve (solo trae
   * `camera` y `photos`). La disponibilidad sale ahora de la misma lectura.
   */
  public async checkPermissions(): Promise<CameraPermissionStatus> {
    const status: CameraPermissionStatus = {
      camera: await this.checkCameraPermission()
    };
    this.applyStatus(status);
    return status;
  }

  private applyStatus(status: CameraPermissionStatus): void {
    this._permissionStatus.set(status);
    this._permissionChanged$.next(status);

    const isAvailable = this.isWeb
      ? !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
      : status.camera === 'granted';
    this._isCameraAvailable.set(isAvailable);
    this._cameraStateChanged$.next(isAvailable);
  }

  /**
   * Solicita permisos de cámara al usuario
   */
  async requestCameraPermission(): Promise<boolean> {
    if (!this.isMobile) {
      return true; // En web, no necesitamos solicitar permisos
    }

    try {
      const permission = await Camera.requestPermissions({ permissions: ['camera'] });
      this.applyStatus({ camera: permission.camera });
      return permission.camera === 'granted';
    } catch (error) {
      console.error('Error al solicitar permiso de cámara:', error);
      return false;
    }
  }

  /**
   * Verifica si la cámara está disponible y tiene permisos
   */
  async checkCameraAvailabilityStatus(): Promise<boolean> {
    if (!this.isMobile) {
      return true; // En web, siempre está disponible
    }
    const status = await this.checkPermissions();
    return status.camera === 'granted';
  }

  /**
   * Obtiene el stream de la cámara con las restricciones especificadas
   *
   * El permiso se lee en el momento, no del estado guardado, y el error de
   * `getUserMedia` se relanza tal cual: envolverlo en un `Error` nuevo perdia
   * el `name` que distingue "sin permiso" de "camara ocupada".
   */
  async getCameraStream(constraints: CameraConstraints = {}): Promise<MediaStream> {
    if (!(await this.checkCameraAvailabilityStatus())) {
      throw new DOMException('Sin permiso de cámara', 'NotAllowedError');
    }

    const defaultConstraints: MediaStreamConstraints = {
      video: {
        width: { ideal: 640, min: 320, max: 1280, ...constraints.width },
        height: { ideal: 480, min: 240, max: 720, ...constraints.height },
        facingMode: constraints.facingMode || 'user',
        frameRate: { ideal: 30, min: 15, max: 60, ...constraints.frameRate },
        aspectRatio: constraints.aspectRatio || 4 / 3
      },
      audio: false
    };

    try {
      return await navigator.mediaDevices.getUserMedia(defaultConstraints);
    } catch (error) {
      console.error('Error al obtener stream de cámara:', error);
      throw error;
    }
  }

  /**
   * Detiene un stream de cámara
   */
  stopCameraStream(stream: MediaStream): void {
    if (stream && stream.getTracks) {
      stream.getTracks().forEach(track => {
        track.stop();
      });
    }
  }

  /**
   * Obtiene la lista de dispositivos de cámara disponibles
   */
  async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (error) {
      console.error('Error al obtener dispositivos de cámara:', error);
      return [];
    }
  }

  /**
   * Cambia a una cámara específica
   */
  async switchCamera(stream: MediaStream, deviceId: string): Promise<MediaStream> {
    this.stopCameraStream(stream);
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false
      });
    } catch (error) {
      console.error('Error al cambiar de cámara:', error);
      throw error;
    }
  }

  /**
   * Obtiene el estado actual de los permisos
   */
  getCurrentPermissionStatus(): CameraPermissionStatus | null {
    return this._permissionStatus();
  }

  /**
   * Verifica si se necesitan mostrar los permisos
   */
  async shouldShowPermissions(): Promise<boolean> {
    if (!this.isMobile) {
      return false;
    }
    const status = await this.checkPermissions();
    return canAskCameraPermission(status.camera);
  }

  /**
   * Instrucciones para conceder la camara desde Ajustes. Capacitor no trae una
   * forma de abrir la ficha de la app sin un plugin nativo adicional.
   */
  settingsInstructions(): string {
    return this.isAndroid
      ? 'Ajustes > Aplicaciones > Cosmos Check-In > Permisos > Cámara > Permitir'
      : 'Ajustes > Cosmos Check-In > Cámara';
  }

  /**
   * Limpia todos los recursos del servicio
   */
  destroy(): void {
    this._permissionChanged$.complete();
    this._cameraStateChanged$.complete();
  }
}
