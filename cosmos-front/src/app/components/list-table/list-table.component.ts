import { Component, Input, Output, EventEmitter } from '@angular/core';
import { IHeaderList } from '../../interfaces/header-list.interface';
import { CommonModule } from '@angular/common';
import { ExcelDownloadConfig } from '../excel-download/excel-download.component';
import { EmptyState } from '../empty-state/empty-state';

@Component({
  selector: 'app-list-table',
  imports: [CommonModule, EmptyState],
  templateUrl: './list-table.component.html',
  styleUrl: './list-table.component.scss',
})
export class ListTableComponent {
  @Input() headers: IHeaderList[] = [];
  @Input() data: any[] = [];
  @Output() optionsEvent = new EventEmitter<{ option: string; _id: string }>();
  @Input() total: number = 0;
  @Input() page: number = 1;
  @Input() limit: number = 10;
  @Output() pageChangeEvent = new EventEmitter<number>();
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

  toggleDetails(index: number) {
    this.data[index].isVisible = !this.data[index].isVisible;
  }

  trackByItemId(index: number, item: any): string {
    return item._id;
  }

  clickOptions(option: string, _id: string) {
    this.optionsEvent.emit({ option, _id });
  }

  pageChange(page: number) {
    this.pageChangeEvent.emit(page);
  }

  onExcelDownload() {
    if (this.excelConfig) {
      this.excelDownloadEvent.emit(this.excelConfig);
    }
  }
}
