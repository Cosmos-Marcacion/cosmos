import { Component, inject } from '@angular/core';
import { DataComponent } from '../../components/data/data.component';
import { PointsService } from './services/points.service';
import { Router } from '@angular/router';
import { ConfirmationService } from '../../services/confirmation.service';
import { IPointResponse } from './interfaces/point.interface';
import { IHeaderList } from '../../interfaces/header-list.interface';
import { PortsService } from '../ports/services/ports.service';
import { IPortResponse } from '../ports/interfaces/port.interface';
import { FormsModule } from '@angular/forms';
import { ExcelService } from '../../services/excel.service';
import { ExcelDownloadConfig } from '../../components/excel-download/excel-download.component';

@Component({
  selector: 'app-points',
  imports: [DataComponent, FormsModule],
  templateUrl: './points.html',
  styleUrl: './points.scss',
})
export default class Points {
  private pointsService = inject(PointsService);
  private router = inject(Router);
  private confirmationService = inject(ConfirmationService);
  private portsService = inject(PortsService);
  private excelService = inject(ExcelService);
  points: IPointResponse[] = [];
  headers: IHeaderList[] = [
    {
      header: 'Nombre',
      value: 'name',
    },
    {
      header: 'Tolerancia anterior',
      value: 'previousTolerance',
    },
    {
      header: 'Tolerancia siguiente',
      value: 'nextTolerance',
    },
    {
      header: 'Depende de',
      value: 'depend',
    },
    {
      header: 'Acciones',
      value: 'actions',
      options: ['edit', 'delete'],
    },
  ];
  total: number = 0;
  page: number = 1;
  limit: number = 10;
  ports: IPortResponse[] = [];
  portId: string = '';

  showExcelDownload: boolean = true;
  searchTerm: string = '';
  loading: boolean = false;
  error: string = '';
  /** Explica por que la lista esta vacia: sin puertos o puerto sin puntos (CKI08). */
  emptyMessage: string = 'No hay registros que mostrar.';

  ngOnInit() {
    this.getPorts();
  }

  getPorts() {
    this.portsService.getPorts(0, 1, '').subscribe((ports) => {
      this.ports = ports.data;
      // Sin puertos dados de alta, `ports[0]._id` lanzaba un TypeError y la
      // pantalla se quedaba en blanco sin ningun mensaje. Es el estado normal de
      // una instalacion recien puesta en marcha, no un caso raro.
      const primero = this.ports[0];
      if (!primero) {
        this.points = [];
        this.total = 0;
        this.emptyMessage = 'No hay puertos registrados. Crea uno en Puertos para poder agregar puntos de marcación.';
        return;
      }
      this.portId = primero._id;
      this.getPointsByPort();
    });
  }

  formatPoints(points: IPointResponse[]) {
    return points.map((point) => ({
      ...point,
      depend: point.dependOn ? point.dependOn.name : '-',
    }));
  }

  getPointsByPort(search: string = '') {
    const port = this.ports.find((p) => p._id === this.portId);
    this.emptyMessage = `${port?.name ?? 'Este puerto'} no tiene puntos de marcación. Usa Agregar para crear el primero.`;
    this.loading = true;
    this.error = '';
    this.pointsService
      .getPointsByPort(this.portId, this.limit, this.page, search)
      .subscribe({
        next: (points) => {
          this.loading = false;
          this.points = this.formatPoints(points.data);
          this.total = points.total;
          this.page = points.page;
          this.limit = points.limit;
        },
        error: () => {
          this.loading = false;
          this.error = 'No se pudieron cargar los puntos de marcación.';
        },
      });
  }

  retry() {
    this.getPointsByPort(this.searchTerm);
  }

  changePort(portId: string) {
    if (portId) {
      this.portId = portId;
      // Otro puerto empieza en la primera pagina y con la busqueda puesta.
      this.page = 1;
      this.getPointsByPort(this.searchTerm);
    }
  }

  pageChange(page: number) {
    this.page = page;
    // Sin el termino, pasar de pagina soltaba el filtro de busqueda.
    this.getPointsByPort(this.searchTerm);
  }

  searchUsers(event: Event) {
    const value = (event.target as HTMLInputElement).value.trim();
    this.searchTerm = value;
    // Una busqueda nueva empieza en la primera pagina; desde la 3 salia vacia.
    this.page = 1;
    this.getPointsByPort(value);
  }

  clickOptions(option: string, _id: string) {
    if (option === 'edit') {
      this.editPoint(_id);
    } else if (option === 'delete') {
      this.deletePoint(_id);
    }
  }

  addPoint() {
    this.router.navigate(['/puntos/agregar']);
  }

  editPoint(id: string) {
    this.router.navigate(['/puntos/agregar', id]);
  }

  deletePoint(id: string) {
    this.confirmationService.show(
      '¿Estás seguro de querer eliminar este punto?',
      () => {
        this.pointsService.deletePoint(id).subscribe(() => {
          // Si era el ultimo de la pagina, se vuelve a la anterior.
          if (this.points.length === 1 && this.page > 1) {
            this.page--;
          }
          this.getPointsByPort(this.searchTerm);
        });
      }
    );
  }

  getExcelConfig(): ExcelDownloadConfig {
    const selectedPort = this.ports.find((port) => port._id === this.portId);
    return {
      title: 'Reporte de Puntos de Marcación',
      filters: {
        Puerto: selectedPort?.name || '-',
        Búsqueda: this.searchTerm || '-',
      },
      data: this.points,
      headers: this.headers
        .filter((header) => header.value && header.value !== 'actions')
        .map((header) => ({
          header: header.header,
          value: header.value!,
        })),
      fileName: 'Reporte_Puntos_Marcacion',
    };
  }

  async onExcelDownload(config: ExcelDownloadConfig) {
    await this.excelService.downloadExcel(config);
  }
}
