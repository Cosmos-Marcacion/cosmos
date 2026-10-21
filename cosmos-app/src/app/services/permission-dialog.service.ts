import { Injectable, inject, signal } from '@angular/core';

import { Capacitor } from '@capacitor/core';
import { CameraPermissionsService } from './camera-permissions.service';

@Injectable({
  providedIn: 'root'
})
export class PermissionDialogService {
  private cameraPermissionsService = inject(CameraPermissionsService);


  // Signal para controlar la visibilidad del diálogo
  private isVisible$ = signal(false);

  // Signal para el estado de los permisos
  private permissionStatus$ = signal<any>(null);

  /**
   * Observable para la visibilidad del diálogo
   */
  get isVisible() {
    return this.isVisible$.asReadonly();
  }

  /**
   * Observable para el estado de los permisos
   */
  get permissionStatus() {
    return this.permissionStatus$.asReadonly();
  }

  /**
   * Muestra el diálogo de permisos
   */
  showDialog(): void {
    this.isVisible$.set(true);
    this.checkPermissions();
  }

  /**
   * Oculta el diálogo de permisos
   */
  hideDialog(): void {
    this.isVisible$.set(false);
  }

  /**
   * Verifica los permisos actuales
   */
  private async checkPermissions(): Promise<void> {
    try {
      const status = await this.cameraPermissionsService.checkPermissions();
      this.permissionStatus$.set(status);
    } catch (error) {
      console.error('Error al verificar permisos:', error);
    }
  }

  /**
   * Solicita permisos de cámara
   */
  async requestCameraPermission(): Promise<boolean> {
    try {
      const granted = await this.cameraPermissionsService.requestCameraPermission();

      if (granted) {
        // Actualizar el estado
        this.permissionStatus$.set({ camera: 'granted' });

        // Ocultar el diálogo después de un breve delay
        setTimeout(() => this.hideDialog(), 1500);

        return true;
      } else {
        // Actualizar el estado si fue denegado
        await this.checkPermissions();
        return false;
      }
    } catch (error) {
      console.error('Error al solicitar permiso de cámara:', error);
      return false;
    }
  }

  /**
   * Verifica si se necesitan mostrar los permisos
   */
  async shouldShowPermissions(): Promise<boolean> {
    try {
      return await this.cameraPermissionsService.shouldShowPermissions();
    } catch (error) {
      console.error('Error al verificar si se deben mostrar permisos:', error);
      return false;
    }
  }

  /**
   * Inicializa la verificación de permisos
   */
  async initializePermissions(): Promise<void> {
    try {
      // El servicio se inicializa automáticamente en el constructor
      // Solo verificar si se debe mostrar el diálogo
      const shouldShow = await this.shouldShowPermissions();
      if (shouldShow) {
        this.showDialog();
      }
    } catch (error) {
      console.error('Error al inicializar permisos:', error);
    }
  }

  /**
   * Abre la configuración de la aplicación
   */
  async openAppSettings(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        // En Android, mostrar instrucciones para ir a configuración
        console.log('Por favor, ve a Configuración > Aplicaciones > Cosmos App > Permisos y habilita la cámara');

        // Aquí podrías usar App.openSettings() si estuviera disponible
        // await App.openSettings();
      } catch (error) {
        console.error('Error al abrir configuración de la aplicación:', error);
      }
    }
  }
}
