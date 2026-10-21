import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { IHeaderList } from '../../interfaces/header-list.interface';
import { ShortTextPipe } from '../../pipes/short-text.pipe';
import { Pagination } from '../pagination/pagination';
import { CommonModule } from '@angular/common';
import {
  ExcelDownloadComponent,
  ExcelDownloadConfig,
} from '../excel-download/excel-download.component';
import { Router } from '@angular/router';
import { EmptyState } from '../empty-state/empty-state';

@Component({
  selector: 'app-table',
  imports: [ShortTextPipe, Pagination, CommonModule, ExcelDownloadComponent, EmptyState],
  templateUrl: './table.component.html',
  styleUrl: './table.component.scss',
})
export class TableComponent {
  private router = inject(Router)
  @Input() headers: IHeaderList[] = [];
  @Input() data: any[] = [];
  @Output() optionsEvent = new EventEmitter<{ option: string; _id: string }>();
  @Input() total: number = 0;
  @Input() page: number = 1;
  @Input() limit: number = 10;
  @Output() pageChangeEvent = new EventEmitter<number>();
  @Input() reorderable: boolean = true;
  @Input() showExcelDownload: boolean = false;
  @Input() excelConfig?: ExcelDownloadConfig;
  @Output() excelDownloadEvent = new EventEmitter<ExcelDownloadConfig>();
  // Estado vacio: ver EmptyState.
  @Input() loading: boolean = false;
  @Input() error: string | null = '';
  @Input() searchTerm: string | null = '';
  @Input() emptyMessage: string = 'No hay registros que mostrar.';
  @Input() noMatchMessage: string = '';
  /** Muestra 'Reintentar' en el estado de error; quien lo active escucha `retryEvent`. */
  @Input() retryable: boolean = false;
  @Output() retryEvent = new EventEmitter<void>();
  private draggedRow: any;
  private draggedRowNext: any;

  options(option: string, _id: string) {
    this.optionsEvent.emit({ option, _id });
  }

  trackByItemId(index: number, item: any): string {
    return item._id;
  }

  /** Columnas visibles, para que la fila del estado vacio ocupe todo el ancho. */
  get columnCount(): number {
    return Math.max(1, this.headers.filter((h) => h.header !== 'header').length);
  }

  pageChange(page: number) {
    this.pageChangeEvent.emit(page);
  }

  onExcelDownload(config: ExcelDownloadConfig) {
    this.excelDownloadEvent.emit(config);
  }

  onDragStart(event: DragEvent, row: any) {
    this.draggedRow = row;
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', JSON.stringify(row));
    (event.target as HTMLElement).classList.add('dragging');
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    const targetRow = (event.target as HTMLElement).closest('tr');
    if (targetRow) {
      targetRow.classList.add('drag-over');
    }
  }

  onDragLeave(event: DragEvent) {
    const targetRow = (event.target as HTMLElement).closest('tr');
    if (targetRow) {
      targetRow.classList.remove('drag-over');
    }
  }

  onDrop(targetRowData: any) {
    this.draggedRowNext = targetRowData;
  }

  onDragEnd(event: DragEvent) {
    (event.target as HTMLElement).classList.remove('dragging');
    this.reorder();
  }

  reorder() {
    this.data.find((row) => row._id === this.draggedRowNext._id).order =
      this.draggedRow.order;
    this.data.find((row) => row._id === this.draggedRow._id).order =
      this.draggedRowNext.order;
    this.data = [...this.data.sort((a, b) => a.order - b.order)];
  }

  viewEntries(employeeId: string, workerDate: string, turn: string) {
    this.router.navigate(['/marcaciones/ver', employeeId, workerDate, turn]);
  }
}
