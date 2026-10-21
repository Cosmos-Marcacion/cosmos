import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IDashboardFilters,
  IDashboardFiltersKeywords,
  IFiltersDashboardData,
} from '../interfaces/dashboard.interface';
import { TURNS } from '../../../constants/turns.contant';
import { DashboardService } from '../services/dashboard.service';
import { IEmployeeResponse } from '../../../interfaces/employee.interface';
import { CapPipe } from '../../../pipes/cap-pipe';
import { CommonModule } from '@angular/common';

function today(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    .toISOString()
    .split('T')[0];
}

/**
 * Filtros del panel.
 *
 * Antes cada cambio (elegir un turno, una nave, una fecha, vaciar un buscador)
 * emitía la búsqueda por su cuenta, y cada emisión encadenaba tres peticiones
 * al servidor. Ajustar cuatro filtros costaba doce consultas, las respuestas
 * llegaban desordenadas y el panel pintaba las de la penúltima. Ahora los
 * filtros sólo actualizan el formulario y la consulta se lanza con el botón.
 */
@Component({
  selector: 'app-dashboard-filters',
  imports: [FormsModule, CapPipe, CommonModule],
  templateUrl: './dashboard-filters.html',
  styleUrl: './dashboard-filters.scss',
})
export class DashboardFilters {
  @ViewChild('employeeInput') employeeInput!: ElementRef;
  @ViewChild('shipInput') shipInput!: ElementRef;
  @ViewChild('positionInput') positionInput!: ElementRef;
  @ViewChild('namedInput') namedInput!: ElementRef;

  private dashboardService = inject(DashboardService);

  @Output() searchEvent: EventEmitter<IDashboardFilters> =
    new EventEmitter<IDashboardFilters>();
  /** Mientras el panel consulta, el botón no admite otra búsqueda. */
  @Input() loading = false;

  turns = TURNS;
  employeeId: string = '';
  startDate: string = today();
  endDate: string = today();
  ship: string = '';
  position: string = '';
  turn: string = '';
  namedId: string = '';
  dateError: string = '';
  /**
   * Aviso tras pulsar Limpiar. Las fechas no se vacian, vuelven a hoy: sin
   * fechas no hay consulta. Si el filtro ya era hoy, a la vista parecia que
   * Limpiar no habia hecho nada, que es lo que se reporto (CKI14).
   */
  clearedNotice = false;
  filters: IFiltersDashboardData = {
    employees: [],
    ships: [],
    positions: [],
    nameds: [],
  };
  currentEmployees: IEmployeeResponse[] = [];
  currentShips: string[] = [];
  currentPositions: string[] = [];
  currentNameds: string[] = [];
  keywords: IDashboardFiltersKeywords = {} as IDashboardFiltersKeywords;

  ngOnInit() {
    this.getFilters();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (!this.employeeInput?.nativeElement.contains(event.target)) {
      this.currentEmployees = [];
    }
    if (!this.shipInput?.nativeElement.contains(event.target)) {
      this.currentShips = [];
    }
    if (!this.positionInput?.nativeElement.contains(event.target)) {
      this.currentPositions = [];
    }
    if (!this.namedInput?.nativeElement.contains(event.target)) {
      this.currentNameds = [];
    }
  }

  getFilters() {
    this.dashboardService.getDashboardFilters().subscribe({
      next: (res) => {
        this.filters = res;
        // Única consulta automática: la carga inicial del panel.
        this.search();
      },
      // Sin catálogos el panel sigue siendo utilizable con fechas y turno.
      error: () => this.search(),
    });
  }

  getEmployees() {
    const keyword = this.keywords.employee?.toLowerCase().trim();
    this.currentEmployees = keyword
      ? this.filters.employees.filter((employee) =>
          `${employee.firstName} ${employee.lastName}`
            .toLowerCase()
            .includes(keyword)
        )
      : [...this.filters.employees];
    // Escribir sobre el buscador invalida la selección previa: sin esto, borrar
    // el nombre dejaba el `employeeId` puesto y la consulta seguía filtrando
    // por una persona que ya no aparecía en el campo.
    if (!keyword) {
      this.employeeId = '';
    }
  }

  getShips() {
    const keyword = this.keywords.ship?.toLowerCase().trim();
    this.currentShips = keyword
      ? this.filters.ships.filter((ship) => ship.toLowerCase().includes(keyword))
      : [...this.filters.ships];
    if (!keyword) {
      this.ship = '';
    }
  }

  getPositions() {
    const keyword = this.keywords.position?.toLowerCase().trim();
    this.currentPositions = keyword
      ? this.filters.positions.filter((position) =>
          position.toLowerCase().includes(keyword)
        )
      : [...this.filters.positions];
    if (!keyword) {
      this.position = '';
    }
  }

  getNameds() {
    const keyword = this.keywords.namedId?.toLowerCase().trim();
    this.currentNameds = keyword
      ? this.filters.nameds.filter((named) =>
          named.toLowerCase().includes(keyword)
        )
      : [...this.filters.nameds];
    if (!keyword) {
      this.namedId = '';
    }
  }

  selectEmployee(employee?: IEmployeeResponse) {
    if (employee?._id) {
      this.employeeId = employee._id;
      this.keywords.employee = `${this.capitalize(
        employee.firstName
      )} ${this.capitalize(employee.lastName)}`;
    } else {
      this.employeeId = '';
      this.keywords.employee = '';
    }
    this.currentEmployees = [];
  }

  selectShip(ship: string) {
    this.ship = ship;
    this.keywords.ship = ship ? this.capitalize(ship) : '';
    this.currentShips = [];
  }

  selectPosition(position: string) {
    this.position = position;
    this.keywords.position = position ? this.capitalize(position) : '';
    this.currentPositions = [];
  }

  selectNamed(named: string) {
    this.namedId = named;
    this.keywords.namedId = named ?? '';
    this.currentNameds = [];
  }

  /** Filtros activos, para avisar de que la vista no muestra el total. */
  get activeCount(): number {
    return [this.namedId, this.ship, this.turn, this.employeeId, this.position].filter(
      (value) => !!value
    ).length;
  }

  get isValid(): boolean {
    return !!this.startDate && !!this.endDate && this.startDate <= this.endDate;
  }

  validateDates() {
    this.dateError =
      this.isValid || !this.startDate || !this.endDate
        ? ''
        : 'La fecha de inicio no puede ser posterior a la de fin';
  }

  search() {
    this.clearedNotice = false;
    this.validateDates();
    if (!this.isValid || this.loading) {
      return;
    }
    this.reset();
    this.searchEvent.emit({
      employeeId: this.employeeId,
      startDate: this.startDate,
      endDate: this.endDate,
      ship: this.ship,
      position: this.position,
      turn: this.turn,
      namedId: this.namedId,
    });
  }

  clear() {
    this.employeeId = '';
    this.ship = '';
    this.position = '';
    this.turn = '';
    this.namedId = '';
    this.startDate = today();
    this.endDate = today();
    this.keywords = {} as IDashboardFiltersKeywords;
    this.dateError = '';
    this.reset();
    this.search();
    this.clearedNotice = true;
  }

  reset() {
    this.currentEmployees = [];
    this.currentShips = [];
    this.currentPositions = [];
    this.currentNameds = [];
  }

  capitalize(value: string) {
    if (!value) {
      return '';
    }
    return value.toLowerCase().charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }
}
