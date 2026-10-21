import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataComponent } from '../../components/data/data.component';
import { IHeaderList } from '../../interfaces/header-list.interface';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmationService } from '../../services/confirmation.service';
import { IPortResponse } from './interfaces/port.interface';
import { PortsService } from './services/ports.service';
import { ExcelService } from '../../services/excel.service';
import { ExcelDownloadConfig } from '../../components/excel-download/excel-download.component';

@Component({
  selector: 'app-ports',
  imports: [DataComponent, ReactiveFormsModule, FormsModule, CommonModule],
  templateUrl: './ports.html',
  styleUrl: './ports.scss',
})
export default class Ports {
  private portsService = inject(PortsService);
  private router = inject(Router);
  private confirmationService = inject(ConfirmationService);
  private excelService = inject(ExcelService);
  ports: IPortResponse[] = [];
  headers: IHeaderList[] = [
    {
      header: 'Nombre',
      value: 'name',
    },
    {
      header: 'Dirección',
      value: 'address',
    },
    {
      header: 'Acciones',
      value: 'actions',
      options: ['edit', 'delete'],
    },
  ];
  total: number = 0;
  page: number = 1;
  limit: number = 104;

  showExcelDownload: boolean = true;
  searchTerm: string = '';

  ngOnInit() {
    this.getPorts();
  }

  getPorts(search: string = '') {
    this.portsService
      .getPorts(this.limit, this.page, search)
      .subscribe((ports) => {
        this.ports = ports.data;
        this.total = ports.total;
        this.page = ports.page;
        this.limit = ports.limit;
      });
  }

  pageChange(page: number) {
    this.page = page;
    // Sin el termino, pasar de pagina soltaba el filtro de busqueda.
    this.getPorts(this.searchTerm);
  }

  searchUsers(event: Event) {
    const value = (event.target as HTMLInputElement).value.trim();
    this.searchTerm = value;
    this.page = 1;
    this.getPorts(value);
  }

  clickOptions(option: string, _id: string) {
    if (option === 'edit') {
      this.editPort(_id);
    } else if (option === 'delete') {
      this.deletePort(_id);
    }
  }

  addPort() {
    this.router.navigate(['/puertos/agregar']);
  }

  editPort(id: string) {
    this.router.navigate(['/puertos/agregar', id]);
  }

  deletePort(id: string) {
    this.confirmationService.show(
      '¿Estás seguro de querer eliminar este puerto?',
      () => {
        this.portsService.deletePort(id).subscribe(() => {
          if (this.ports.length === 1 && this.page > 1) {
            this.page--;
          }
          this.getPorts(this.searchTerm);
        });
      }
    );
  }

  getExcelConfig(): ExcelDownloadConfig {
    return {
      title: 'Reporte de Puertos',
      filters: {
        Búsqueda: this.searchTerm || '-',
      },
      data: this.ports,
      headers: this.headers
        .filter((header) => header.value && header.value !== 'actions')
        .map((header) => ({
          header: header.header,
          value: header.value!,
        })),
      fileName: 'Reporte_Puertos',
    };
  }

  async onExcelDownload(config: ExcelDownloadConfig) {
    await this.excelService.downloadExcel(config);
  }
}
