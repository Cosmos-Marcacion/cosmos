import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/library';
import { Router } from '@angular/router';
import { NavigationStateService } from '../../../services/navigation-state.service';
import { EmployeeRegisterService } from '../../employee-register/services/employee-register.service';
import { identificationParams } from '../../../services/mark-identification';

/** Id de la ficha en la base (el QR que imprime la plataforma lo lleva). */
const OBJECT_ID = /^[a-f\d]{24}$/i;
/** DNI (8 digitos) o carne de extranjeria (hasta 12) dentro del codigo leido. */
const DOCUMENT_IN_CODE = /\d{8,12}/;

/**
 * Lo que se puede buscar a partir del codigo leido: el id de la ficha tal cual,
 * o el primer numero de documento que aparezca. El codigo de barras del DNI
 * trae el numero junto a otros datos, por eso se busca dentro y no se exige
 * que el codigo sea solo el numero.
 */
export function parseScannedCode(raw: string): { kind: 'id' | 'document'; value: string } | null {
  const text = (raw ?? '').trim();
  if (OBJECT_ID.test(text)) {
    return { kind: 'id', value: text };
  }
  const match = text.match(DOCUMENT_IN_CODE);
  return match ? { kind: 'document', value: match[0] } : null;
}

export type ScanStatus = 'scanning' | 'loading' | 'not-found' | 'unreadable' | 'error';

@Component({
  selector: 'app-dni-scan',
  imports: [
    CommonModule,
    ZXingScannerModule
  ],
  templateUrl: './dni-scan.html',
  styleUrl: './dni-scan.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class DniScan {

  dispositivoSeleccionado!: MediaDeviceInfo;


  private router = inject(Router);
  private navigationStateService = inject(NavigationStateService);
  private employeeRegisterService = inject(EmployeeRegisterService);


  formatosPermitidos: BarcodeFormat[] = [
    BarcodeFormat.PDF_417,
    BarcodeFormat.CODE_128,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.ITF,
  ];

  readonly scannerEnabled = signal(true);
  readonly status = signal<ScanStatus>('scanning');
  /** Documento de la ultima lectura, para el mensaje de "no encontrado". */
  readonly searched = signal('');


  /**
   * Se dispara cuando se detectan las cámaras.
   * @param devices - Lista de dispositivos de video encontrados.
   */
  onCamerasFound(devices: MediaDeviceInfo[]): void {
    if (!devices || devices.length === 0) {
      console.error('No se encontraron cámaras.');
      return;
    }

    // Buscar cámara frontal por label (user-facing)
    const camaraFrontal = devices.find(device => /front|user|face|selfie/i.test(device.label));
    const dispositivoPreferido = camaraFrontal ?? devices[0];

    // Evitar re-asignación innecesaria
    if (!this.dispositivoSeleccionado || this.dispositivoSeleccionado.deviceId !== dispositivoPreferido.deviceId) {
      this.dispositivoSeleccionado = { ...dispositivoPreferido };
    }
  }

  /**
   * Antes el valor leido iba tal cual a `/validacion-registro/:id`. Un DNI no
   * es el id de la ficha: el backend respondia 500 y la pantalla quedaba vacia.
   * Ahora un documento se busca primero, como en la marcacion por DNI.
   */
  manejarEscaneoExitoso(resultado: string): void {
    if (this.status() === 'loading') {
      return;
    }
    const code = parseScannedCode(resultado);
    if (!code) {
      this.status.set('unreadable');
      return;
    }
    if (code.kind === 'id') {
      this.goToCheckin(code.value);
      return;
    }

    this.searched.set(code.value);
    this.status.set('loading');
    this.scannerEnabled.set(false);
    this.employeeRegisterService.getByDni(code.value).subscribe({
      next: (employee) => {
        if (!employee) {
          this.status.set('not-found');
          return;
        }
        this.goToCheckin(employee._id);
      },
      error: (error: unknown) => {
        const notFound = error instanceof HttpErrorResponse && error.status === 404;
        this.status.set(notFound ? 'not-found' : 'error');
      },
    });
  }

  /** Vuelve a leer tras un aviso. */
  scanAgain(): void {
    this.status.set('scanning');
    this.scannerEnabled.set(true);
  }

  onCancelar(): void {
    this.scannerEnabled.set(false);
    this.router.navigate(['/marcacion']);
  }

  private goToCheckin(employeeId: string): void {
    this.scannerEnabled.set(false);
    this.status.set('scanning');
    this.navigationStateService.markInternalNavigation();
    this.router.navigate([`/validacion-registro/${employeeId}`], {
      queryParams: identificationParams({ method: 'qr' }),
    });
  }
}
