import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ListTableComponent } from '../list-table/list-table.component';
import { TableComponent } from '../table/table.component';
import { IHeaderList } from '../../interfaces/header-list.interface';
import { ExcelDownloadConfig } from '../excel-download/excel-download.component';

@Component({
  selector: 'app-data',
  imports: [ListTableComponent, TableComponent],
  templateUrl: './data.component.html',
  styleUrl: './data.component.scss',
})
export class DataComponent {
  @Input() headers: IHeaderList[] = [];
  @Input() data: any[] = [];
  @Output() optionsEvent = new EventEmitter<{ option: string; _id: string }>();
  @Input() total: number = 0;
  @Input() page: number = 1;
  @Input() limit: number = 10;
  @Input() showExcelDownload: boolean = false;
  @Input() excelConfig?: ExcelDownloadConfig;
  @Output() pageChangeEvent = new EventEmitter<number>();
  @Output() excelDownloadEvent = new EventEmitter<ExcelDownloadConfig>();
  /**
   * Estado vacio. `searchTerm` distingue "sin coincidencias" de "sin registros";
   * `loading` y `error` evitan que una consulta en curso o fallida se lea como
   * un listado vacio. Todas tienen valor por defecto: quien no las pase ve
   * "No hay registros que mostrar.".
   */
  @Input() loading: boolean = false;
  @Input() error: string | null = '';
  @Input() searchTerm: string | null = '';
  @Input() emptyMessage: string = 'No hay registros que mostrar.';
  @Input() noMatchMessage: string = '';
  /** Muestra 'Reintentar' en el estado de error; quien lo active escucha `retryEvent`. */
  @Input() retryable: boolean = false;
  @Output() retryEvent = new EventEmitter<void>();

  clickOptions(option: string, _id: string) {
    this.optionsEvent.emit({ option, _id });
  }

  pageChange(page: number) {
    this.pageChangeEvent.emit(page);
  }

  onExcelDownload(config: ExcelDownloadConfig) {
    this.excelDownloadEvent.emit(config);
  }
}
