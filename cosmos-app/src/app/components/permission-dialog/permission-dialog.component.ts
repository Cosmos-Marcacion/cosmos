import { Component, computed, inject, signal } from '@angular/core';
import {
  CameraPermissionsService,
  CameraPermissionState,
  canAskCameraPermission,
} from '../../services/camera-permissions.service';
import { PermissionDialogService } from '../../services/permission-dialog.service';
import { Icon } from '../icon/icon';

/** Texto y tono de cada estado del permiso. */
export function describePermissionState(state: CameraPermissionState | undefined): {
  text: string;
  tone: 'ok' | 'bad' | 'pending';
} {
  switch (state) {
    case 'granted':
      return { text: 'Permitido', tone: 'ok' };
    case 'limited':
      return { text: 'Permitido con límites', tone: 'ok' };
    case 'denied':
      return { text: 'Denegado', tone: 'bad' };
    case 'prompt':
    case 'prompt-with-rationale':
      return { text: 'Sin decidir', tone: 'pending' };
    default:
      return { text: 'Comprobando...', tone: 'pending' };
  }
}

/**
 * Dialogo de permiso de camara.
 *
 * El boton "Permitir" solo aparecia con el estado `prompt` exacto: con
 * `prompt-with-rationale` (Android, tras rechazarlo una vez) no habia ninguna
 * accion. "Ir a Configuracion" abria un `confirm` y un `alert`, que bloquean el
 * WebView; ahora las instrucciones se muestran en el propio dialogo.
 */
@Component({
  selector: 'app-permission-dialog',
  standalone: true,
  imports: [Icon],
  template: `
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        class="c-card c-card-pad max-w-sm w-full mx-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-dialog-title"
      >
        <div class="text-center mb-4">
          <div class="w-16 h-16 bg-color1-10 text-color1 rounded-full flex items-center justify-center mx-auto mb-3">
            <app-icon name="camera" class="size-8" [strokeWidth]="1.8" />
          </div>
        </div>

        <h3 id="permission-dialog-title" class="c-title text-lg text-center mb-2">Permiso de cámara</h3>

        <p class="text-color1 text-center mb-6 text-sm leading-relaxed">
          La app usa la cámara para el reconocimiento facial al marcar asistencia.
        </p>

        <div class="mb-6 p-3 bg-color1-10 rounded-lg">
          <div class="flex items-center justify-between">
            <span class="text-sm gilroy-bold text-color1">Estado del permiso:</span>
            <span
              class="text-sm px-2 py-1 rounded-full"
              [class.bg-green-100]="status().tone === 'ok'"
              [class.text-green-800]="status().tone === 'ok'"
              [class.bg-red-100]="status().tone === 'bad'"
              [class.text-red-800]="status().tone === 'bad'"
              [class.bg-yellow-100]="status().tone === 'pending'"
              [class.text-yellow-800]="status().tone === 'pending'"
            >
              {{ status().text }}
            </span>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          @if (canAsk()) {
            <button type="button" class="c-btn c-btn-primary c-btn-block" [disabled]="isLoading()" (click)="requestPermission()">
              {{ isLoading() ? 'Solicitando...' : 'Permitir acceso a la cámara' }}
            </button>
          }

          @if (isDenied()) {
            <button type="button" class="c-btn c-btn-ghost c-btn-block" (click)="showSettings.set(true)">
              Cómo activarlo en Ajustes
            </button>
            @if (showSettings()) {
              <p class="text-sm text-color1 text-center" role="note">{{ settingsInstructions }}</p>
            }
          }

          <button type="button" class="c-btn c-btn-ghost c-btn-block" (click)="closeDialog()">Cerrar</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class PermissionDialogComponent {
  private cameraPermissionsService = inject(CameraPermissionsService);
  private permissionDialogService = inject(PermissionDialogService);

  /** Se lee del servicio, que lo vuelve a comprobar al regresar desde Ajustes. */
  private readonly camera = computed(() => this.cameraPermissionsService.permissionStatus()?.camera);

  readonly status = computed(() => describePermissionState(this.camera()));
  readonly canAsk = computed(() => canAskCameraPermission(this.camera()));
  readonly isDenied = computed(() => this.camera() === 'denied');

  readonly isLoading = signal(false);
  readonly showSettings = signal(false);
  readonly settingsInstructions = this.cameraPermissionsService.settingsInstructions();

  ngOnInit() {
    this.cameraPermissionsService.checkPermissions().catch(error =>
      console.error('Error al verificar estado de permisos:', error)
    );
  }

  async requestPermission() {
    this.isLoading.set(true);
    try {
      const granted = await this.cameraPermissionsService.requestCameraPermission();
      if (granted) {
        this.closeDialog();
      }
    } catch (error) {
      console.error('Error al solicitar permiso:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  closeDialog() {
    this.permissionDialogService.hideDialog();
  }
}
