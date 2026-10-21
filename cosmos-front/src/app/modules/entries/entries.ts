import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EntriesService } from './services/entries.service';
import { IHeaderList } from '../../interfaces/header-list.interface';
import {
  IEntryResponseSearch,
  IEntrySearch,
  IEntrySearchResponse,
  IFormatEntry,
} from './interfaces/entries.interface';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NotificationService } from '../../services/notification.service';
import { IEmployeeResponse } from '../../interfaces/employee.interface';
import { ExcelService } from '../../services/excel.service';
import { ExcelDownloadConfig } from '../../components/excel-download/excel-download.component';
import { TURNS } from '../../constants/turns.contant';
import { ServerTable } from '../../components/server-table/server-table';
import { lastValueFrom } from 'rxjs';

/** Hoy en la zona del navegador, como `yyyy-mm-dd`. `toISOString` da el dia UTC. */
function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-entries',
  imports: [CommonModule, FormsModule, ServerTable, RouterLink],
  templateUrl: './entries.html',
  styleUrl: './entries.scss',
})
export default class Entries {
  private entriesService = inject(EntriesService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private notificationService = inject(NotificationService);
  private excelService = inject(ExcelService);

  entries: IFormatEntry[] = [];
  entriesTemp: IFormatEntry[] = [];
  headers: IHeaderList[] = [
    {
      header: 'Nombre',
      value: 'employee',
    },
    {
      header: 'Navío',
      value: 'ship',
    },
    {
      header: 'Cargo',
      value: 'position',
    },
    {
      header: 'Documento',
      value: 'document',
    },
    {
      header: 'Fecha de trabajo',
      value: 'workerDate',
    },
    {
      header: 'Marcaciones',
      value: 'markings',
    },
    {
      header: 'Remate',
      value: 'isRemate',
    },
    {
      header: 'Turno',
      value: 'turn',
    },
  ];

  total: number = 0;
  page: number = 1;
  limit: number = 10;
  turns: string[] = TURNS

  searchTerm: string = '';
  selectedShip: string = '';
  selectedPosition: string = '';
  workerDate: string = localToday();

  isMobile: boolean = false;
  employees: IEmployeeResponse[] = [];
  selectedEmployee: string = '';
  selectedEmployeeId: string = '';
  selectedTurn: string = '';

  ships: string[] = [];
  positions: string[] = [];
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  showExcelDownload: boolean = true;

  ngOnInit() {
    this.applyQueryFilters();
    this.getEmployees();
    this.checkScreenSize();
    this.getEntries();
  }

  /**
   * La vista por nombrada enlaza aquí con la fecha y el turno de la nombrada
   * abierta; sin leerlos el listado se abriría siempre en el día de hoy.
   */
  private applyQueryFilters() {
    const params = this.route.snapshot.queryParamMap;
    const workerDate = params.get('workerDate');
    const turn = params.get('turn');
    if (workerDate) this.workerDate = workerDate;
    if (turn) this.selectedTurn = turn;
  }

  checkScreenSize() {
    this.isMobile = window.innerWidth < 768;
    window.addEventListener('resize', () => {
      this.isMobile = window.innerWidth < 768;
    });
  }

  /**
   * Nombre, nave y cargo viajan a la API. Antes se filtraba en el navegador
   * sobre la pagina ya recibida: quien estaba en la pagina 2 no aparecia al
   * buscarlo, y al pasar de pagina el filtro se perdia sin avisar.
   */
  getFilters() {
    const filters: IEntrySearch = {
      page: this.page,
      limit: this.limit,
      workerDate: this.workerDate,
      turn: this.selectedTurn,
    };
    const search = this.searchTerm.trim();
    if (search) filters.search = search;
    if (this.selectedShip) filters.ship = this.selectedShip;
    if (this.selectedPosition) filters.position = this.selectedPosition;
    return filters;
  }

  getEntries() {
    const filters: IEntrySearch = this.getFilters();
    this.entriesService.getEntries(filters).subscribe((entries) => {
      this.assignEntries(entries);
    });
  }

  /** Opciones de nave y cargo: las de la jornada si la API las envia, si no las de la pagina. */
  getSelects(response?: IEntrySearchResponse) {
    const ships = response?.ships ?? this.entries.map((entry) => entry.ship);
    const positions = response?.positions ?? this.entries.map((entry) => entry.position);
    this.ships = [...new Set(ships)];
    this.positions = [...new Set(positions)];
  }

  formatEntries(entries: IEntryResponseSearch[]): IFormatEntry[] {
    return entries.map((entry) => ({
      namedId: entry.named.staff_transmission_id,
      employeeId: entry.employee._id,
      employee: entry.employee.firstName + ' ' + entry.employee.lastName,
      document: entry.employee.document,
      signature: `${entry.employee.firstName
        .split(' ')[0]
        .toUpperCase()} ${entry.employee.lastName.split(' ')[0].toUpperCase()}`,
      ship: entry.named.vessel_description,
      position: entry.listStaffDetail.staff_role_type_description,
      workerDate: entry.named.worker_date,
      // La salida es el punto que diga el backend, no un `order` fijo: el
      // recorrido cambia de tamano al agregar o quitar puntos.
      markings: `${entry.entries.length}/${entry.totalPoints} ${entry.endPointId && entry.entries.some((ent) => ent.pointId?._id === entry.endPointId) ? '-S' : ''}`,
      entries: entry.entries,
      isRemate: entry.entries.some((ent) => ent.isRemate === true),
      isAbsence: entry.entries.some((ent) => ent.isAbsence === true),
      turn: entry.named.shift_description,
    }));
  }

  assignEntries(entries: IEntrySearchResponse) {
    this.entries = this.formatEntries(entries.data);
    this.entriesTemp = [...this.entries];
    this.total = entries.total;
    this.page = entries.page;
    this.limit = entries.limit;
    this.getSelects(entries);
  }

  pageChange(event: { page: number; limit: number }) {
    this.page = event.page;
    this.limit = event.limit;
    this.getEntries();
  }

  addEntry() {
    this.router.navigate(['/marcaciones/agregar']);
  }

  editEntry(id: string) {
    this.router.navigate(['/marcaciones/agregar', id]);
  }

  getMarkingsDisplay(markings: { completed: number; total: number }): string {
    return `${markings.completed}/${markings.total}`;
  }

  getMarkingsClass(markings: { completed: number; total: number }): string {
    return markings.completed === markings.total
      ? 'bg-blue-600 text-white'
      : 'bg-blue-100 text-blue-600';
  }

  clearFilters() {
    this.searchTerm = '';
    this.selectedShip = '';
    this.selectedPosition = '';
    this.selectedTurn = '';
    // Dia local: con `toISOString` pasadas las 19:00 en Lima salia el de manana.
    this.workerDate = localToday();
    this.selectedEmployee = '';
    this.selectedEmployeeId = '';
    this.page = 1;
    this.getEntries();
  }

  getEmployees() {
    this.entriesService.getAllEmployees().subscribe((employees) => {
      this.employees = employees;
    });
  }

  /** Nave o cargo: se vuelve a pedir desde la primera pagina. */
  search() {
    this.page = 1;
    this.getEntries();
  }

  /** Nombre: espera a que se deje de escribir para no pedir una pagina por tecla. */
  searchByName() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => this.search(), 300);
  }

  ngOnDestroy() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
  }

  getExcelConfig(): ExcelDownloadConfig {

    return {
      title: 'Reporte de Marcaciones',
      filters: {
        'Día de Trabajo': this.workerDate,
        Navío: this.selectedShip,
        Cargo: this.selectedPosition,
        Turno: this.selectedTurn,
        Búsqueda: this.searchTerm,
      },
      data: this.entries,
      headers: this.headers
        .filter((header) => header.value && header.value !== 'actions')
        .map((header) => ({
          header: header.header,
          value: header.value!,
        })),
      fileName: 'Reporte_Marcaciones',
    };
  }

  /** La hoja lleva todo lo filtrado, no solo la pagina que se esta viendo. */
  async onExcelDownload(config: ExcelDownloadConfig) {
    const all = await lastValueFrom(
      this.entriesService.getEntries({ ...this.getFilters(), page: 1, limit: Math.max(this.total, 1) })
    );
    const rows = this.formatEntries(all.data).filter((entry) => !entry.isAbsence);
    await this.excelService.downloadExcel({
      ...config,
      data: rows,
    });
  }
}
