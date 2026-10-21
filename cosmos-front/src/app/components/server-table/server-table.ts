import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IHeaderList } from '../../interfaces/header-list.interface';
import { ShortTextPipe } from '../../pipes/short-text.pipe';
import { Pagination } from '../pagination/pagination';
import { EmptyState } from '../empty-state/empty-state';

/**
 * Tabla paginada en el servidor, con selector de filas por pagina.
 *
 * Sustituye a `app-table-prime`, que era el unico uso de PrimeNG en el panel:
 * arrastraba la libreria y su tema solo por la paginacion. La forma de las
 * entradas y del evento de pagina (`{ page, limit }`) es la misma, asi que el
 * Panel y Marcaciones solo cambian de etiqueta.
 */
@Component({
  selector: 'app-server-table',
  imports: [CommonModule, ShortTextPipe, Pagination, EmptyState],
  templateUrl: './server-table.html',
  styleUrl: './server-table.scss',
})
export class ServerTable {
  private router = inject(Router);

  @Input() headers: IHeaderList[] = [];
  @Input() data: any[] = [];
  @Input() limit: number = 10;
  @Input() page: number = 1;
  @Input() total: number = 0;
  @Input() limitOptions: number[] = [5, 10, 20, 50, 100];
  /** Nombre accesible de la tabla. */
  @Input() caption: string = '';
  // Estado vacio: ver EmptyState.
  @Input() loading: boolean = false;
  @Input() error: string | null = '';
  @Input() searchTerm: string | null = '';
  @Input() emptyMessage: string = 'No hay registros que mostrar.';
  @Input() noMatchMessage: string = '';
  @Output() pageChangeEvent = new EventEmitter<{ page: number; limit: number }>();

  onPageChange(page: number) {
    this.pageChangeEvent.emit({ page, limit: this.limit });
  }

  /** Al cambiar el tamano de pagina se vuelve a la primera: la actual puede no existir. */
  onLimitChange(value: string) {
    const limit = Number(value) || this.limit;
    this.pageChangeEvent.emit({ page: 1, limit });
  }

  /** `"3 / 8 -S"` -> partes que pinta la celda de marcaciones. */
  markings(value: string): { done: string; total: string; exit: string; complete: boolean } {
    const [done = '', rest = ''] = String(value ?? '').split('/');
    const total = rest.replace(' -S', '').trim();
    const exit = String(value ?? '').split('-')[1] ?? '';
    return { done: done.trim(), total, exit, complete: done.trim() === total };
  }

  viewEntries(employeeId: string, workerDate: string, turn: string) {
    this.router.navigate(['/marcaciones/ver', employeeId, workerDate, turn]);
  }
}
