import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ExcelDownloadConfig {
  title: string;
  filters: { [key: string]: any };
  data: any[];
  headers: { header: string; value: string }[];
  fileName?: string;
}

@Component({
  selector: 'app-excel-download',
  imports: [CommonModule],
  templateUrl: './excel-download.component.html',
  styleUrl: './excel-download.component.scss',
})
export class ExcelDownloadComponent {
  @Input() config!: ExcelDownloadConfig;
  @Output() downloadEvent = new EventEmitter<ExcelDownloadConfig>();

  downloadExcel() {
    this.downloadEvent.emit(this.config);
  }

  getFilterText(): string {
    if (!this.config.filters) return '';

    const filterEntries = Object.entries(this.config.filters);
    if (filterEntries.length === 0) return '';

    return filterEntries.map(([key, value]) => `${key}: ${value}`).join(', ');
  }
}
