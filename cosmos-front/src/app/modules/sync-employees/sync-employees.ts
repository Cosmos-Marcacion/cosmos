import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SyncEmployeesService } from './services/sync-employees.service';
import { NotificationService } from '../../services/notification.service';
import { finalize } from 'rxjs';
import { ISyncEmployeesResponse, IEmployeeWithStatus, ISyncRun } from './interfaces/sync-employees.interface';

/**
 * Celda de CSV: entre comillas y con las comillas internas dobladas. Antes un
 * nombre con comillas partia la fila. Si empieza por = + - @ se antepone un
 * apostrofo para que Excel no lo ejecute como formula.
 */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

@Component({
  selector: 'app-sync-employees',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sync-employees.html',
  styleUrl: './sync-employees.scss'
})
export default class SyncEmployees implements OnInit {
  private syncEmployeesService = inject(SyncEmployeesService);
  private notificationService = inject(NotificationService);

  // Signals para el estado reactivo
  public isSyncing = signal(false);
  public syncResult = signal<ISyncEmployeesResponse | null>(null);
  public showResults = signal(false);
  public isDownloadingCsv = signal(false);

  /**
   * Historial de ejecuciones. Antes la pantalla abria siempre en "Listo para
   * sincronizar" sin decir cuando fue la ultima ni como termino (CKI11).
   */
  public runs = signal<ISyncRun[]>([]);
  public runsState = signal<'loading' | 'ready' | 'error'>('loading');
  public lastRun = computed(() => this.runs()[0] ?? null);
  public readonly statusLabel: Record<ISyncRun['status'], string> = {
    running: 'En curso',
    success: 'Correcta',
    partial: 'Con errores',
    failed: 'Fallida',
  };

  ngOnInit(): void {
    this.loadRuns();
  }

  loadRuns(): void {
    this.runsState.set('loading');
    this.syncEmployeesService.getSyncRuns().subscribe({
      next: (runs) => {
        this.runs.set(runs);
        this.runsState.set('ready');
      },
      error: () => this.runsState.set('error'),
    });
  }

  /**
   * Ejecuta la sincronización de empleados
   */
  async syncEmployees(): Promise<void> {
    try {
      this.isSyncing.set(true);
      this.showResults.set(false);

      this.syncEmployeesService
        .syncEmployees()
        // `finalize` y no `complete`: un observable que termina en error nunca
        // completa, asi que con `complete` el boton se quedaba deshabilitado
        // tras un fallo y no habia forma de reintentar sin recargar.
        .pipe(finalize(() => {
          this.isSyncing.set(false);
          // Exito o fallo, la ejecucion queda registrada: se refresca el historial.
          this.loadRuns();
        }))
        .subscribe({
        next: (result) => {
          this.syncResult.set(result);
          this.showResults.set(true);

          if (result.errors && result.errors.length > 0) {
            this.notificationService.show(
              `Sincronización completada con ${result.errors.length} errores`,
              'error'
            );
          } else {
            this.notificationService.show(
              `Sincronización correcta: ${result.newEmployees} empleados creados y ${result.existingEmployees} actualizados`,
              'success'
            );
          }
        },
          error: () => {
            this.notificationService.show(
              'Error al sincronizar empleados',
              'error'
            );
          },
        });
    } catch (error) {
      console.error('Error inesperado:', error);
      this.isSyncing.set(false);
      this.notificationService.show(
        'Error inesperado durante la sincronización',
        'error'
      );
    }
  }
  /**
   * Limpia los resultados mostrados
   */
  clearResults(): void {
    this.syncResult.set(null);
    this.showResults.set(false);
  }

  /**
   * Descarga un archivo CSV con la información de empleados y su estado
   */
  async downloadEmployeesCsv(): Promise<void> {
    try {
      this.isDownloadingCsv.set(true);

      this.syncEmployeesService
        .getEmployeesWithStatus()
        .pipe(finalize(() => this.isDownloadingCsv.set(false)))
        .subscribe({
        next: (employees) => {
          this.generateAndDownloadCsv(employees);
          this.notificationService.show(
            `CSV descargado exitosamente con ${employees.length} empleados`,
            'success'
          );
        },
          error: () => {
            this.notificationService.show(
              'Error al descargar el archivo CSV',
              'error'
            );
          },
        });
    } catch (error) {
      console.error('Error inesperado:', error);
      this.isDownloadingCsv.set(false);
      this.notificationService.show(
        'Error inesperado durante la descarga',
        'error'
      );
    }
  }

  /**
   * Genera y descarga el archivo CSV
   * @param employees Lista de empleados con estado
   */
  private generateAndDownloadCsv(employees: IEmployeeWithStatus[]): void {
    // Encabezados del CSV
    const headers = ['Nombre', 'Apellido', 'Documento', 'Estado de Registro Facial'];

    // Convertir datos a formato CSV
    const csvContent = [
      headers.map(csvCell).join(','),
      ...employees.map(employee => [
        employee.firstName,
        employee.lastName,
        employee.document,
        employee.status
      ].map(csvCell).join(','))
    ].join('\r\n');

    // El BOM hace que Excel lea el fichero como UTF-8: sin el, "PEÑA" salia
    // como "PEÃ‘A".
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `empleados_estado_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Limpiar el objeto URL
    URL.revokeObjectURL(url);
  }
}
