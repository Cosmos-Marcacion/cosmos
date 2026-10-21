import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { map, switchMap, throwError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { TalksService } from '../services/talks.service';
import { EmployeesService } from '../services/employees.service';
import { FormsModule } from '@angular/forms';
import { IAssistantEmployee, IEmployeeResponse, ITalkResponse } from '../interfaces/talk.interface';
import { IHeaderList } from '../../../interfaces/header-list.interface';
import { ConfirmationService } from '../../../services/confirmation.service';
import { NotificationService } from '../../../services/notification.service';
import { CapPipe } from '../../../pipes/cap-pipe';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-assistants',
  imports: [FormsModule, CapPipe, DatePipe],
  templateUrl: './assistants.html',
  styleUrl: './assistants.scss',
})
export default class Assistants {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private talksService = inject(TalksService);
  private employeesService = inject(EmployeesService);
  private confirmationService = inject(ConfirmationService);
  private notificationService = inject(NotificationService);
  // Sin Zone.js y bajo el armazon OnPush, lo que llega por HTTP no repinta solo.
  private cdr = inject(ChangeDetectorRef);
  id: string = this.route.snapshot.params['id'];
  employeeId: string = '';
  employees: IEmployeeResponse[] = [];
  employeeTemp: IEmployeeResponse[] = [];
  headers: IHeaderList[] = [
    {
      header: 'Nombre',
      value: 'name',
    },
    {
      header: 'Documento',
      value: 'document',
    },
    {
      header: 'Acciones',
      value: 'actions',
      options: ['delete'],
    },
  ];
  assistants: IAssistantEmployee[] = [];
  workerDate: string = this.route.snapshot.params['workerDate'];
  turn: string = this.route.snapshot.params['turn'];
  talk!: ITalkResponse
  checkedAll: boolean = false;

  ngOnInit() {
    this.getTalk();
    this.getEmployees();
    this.getAssistants();
  }

  getAssistants() {
    this.talksService
      .getAssistantsByWorkerDateAndTurn(this.workerDate, this.turn, this.id)
      .subscribe({
        next: response => {
          this.assistants = response ?? [];
          // `every` sobre una lista vacia da `true`: sin personal en la nombrada
          // la casilla "Seleccionar todos" salia marcada.
          this.checkedAll =
            this.assistants.length > 0 && this.assistants.every(assistant => assistant.isAssistant);
          this.cdr.markForCheck();
        },
        error: () => {
          this.assistants = [];
          this.checkedAll = false;
          this.cdr.markForCheck();
        },
      });
  }

  confirmAddAssistantsByWorkerDateAndTurn() {
    this.confirmationService.show(
      '¿Estás seguro de querer agregar los asistentes?',
      () => {
        this.addAssistants();
      }
    );
  }

  addAssistants() {

  }

  getTalk() {
    this.talksService.getTalk(this.id).subscribe((talk) => {
      this.talk = talk;
      this.cdr.markForCheck();
    });
  }

  goBack() {
    this.router.navigate(['/capacitaciones']);
  }

  selectAll() {
    // Solo los que aun no asisten: el backend crea un registro por id sin
    // comprobar si ya existe, y antes se duplicaban los que ya estaban.
    const employeeIds = this.assistants
      .filter(assistant => !assistant.isAssistant)
      .map(assistant => assistant._id);
    if (employeeIds.length === 0) {
      this.getAssistants();
      return;
    }
    this.talksService.saveAllAssistants(employeeIds, this.id).subscribe(() => {
      this.notificationService.show(
        'Asistentes agregados correctamente',
        'success'
      );
      this.getAssistants();
    });
  }

  deleteAll() {
    this.talksService.deleteByTalkId(this.id).subscribe(() => {
      this.notificationService.show(
        'Asistentes eliminados correctamente',
        'success'
      );
      this.getAssistants();
    });
  }

  confirmSelectAll() {
    this.confirmationService.show(
      '¿Estás seguro de querer seleccionar todos los asistentes?',
      () => {
        this.selectAll()
      }
    );
  }

  confirmDeleteAll() {
    this.confirmationService.show(
      '¿Estás seguro de querer eliminar todos los asistentes?',
      () => {
        this.deleteAll();
      }
    );
  }

  onSelectAll(event: Event) {
    const value = (event.target as HTMLInputElement).checked;
    if (value) {
      this.confirmSelectAll();
    } else {
      this.confirmDeleteAll();
    }
  }

  selectAssistant(event: Event, id: string) {
    const value = (event.target as HTMLInputElement).checked;
    if (value) {
      this.addAssistant(id);
    } else {
      this.deleteAssistant(id);
    }
  }

  addAssistant(id: string) {
    this.talksService.addEmployee({
      talkId: this.id,
      employeeId: id,
    }).subscribe({
      next: () => {
        this.notificationService.show(
          'Asistente agregado correctamente',
          'success'
        );
        this.getAssistants();
      },
      // La casilla ya se marco en pantalla; se vuelve a pintar el estado real.
      error: () => this.getAssistants(),
    });
  }

  confirmDelete(id: string) {
    this.confirmationService.show(
      '¿Estás seguro de querer eliminar este asistente?',
      () => {
        this.deleteAssistant(id);
      }
    );
  }

  /**
   * Quita a un empleado de **esta** charla.
   *
   * Antes se llamaba a `delete-by-employee-id`, que borra el primer registro de
   * asistencia del empleado que encuentre, sea de la charla que sea: desmarcar
   * a alguien aqui podia sacarlo de otra charla y dejarlo en esta. Ahora se
   * busca su registro dentro de la charla y se borra ese.
   */
  deleteAssistant(employeeId: string) {
    this.talksService
      .getEmployeesByTalk(this.id)
      .pipe(
        map(records => records.find(record => record.employee?._id === employeeId)),
        switchMap(record =>
          record
            ? this.talksService.deleteAssistantRecord(record._id)
            : throwError(() => new Error('not-found'))
        )
      )
      .subscribe({
        next: () => {
          this.notificationService.show('Asistente eliminado correctamente', 'success');
          this.getAssistants();
        },
        error: error => {
          if (error?.message === 'not-found') {
            this.notificationService.show('El empleado no figura como asistente de esta charla', 'error');
          }
          this.getAssistants();
        },
      });
  }

  getEmployees() {
    this.employeesService.getEmployees().subscribe((employees) => {
      this.employeeTemp = employees ?? [];
    });
  }

  selectEmployee(employee: IEmployeeResponse) {
    this.employees = [];
    if (this.assistants.some(assistant => assistant._id === employee._id && assistant.isAssistant)) {
      this.notificationService.show('El empleado ya es asistente de esta charla', 'error');
      return;
    }
    this.addEmployee(employee);
  }

  addEmployee(employee: IEmployeeResponse) {
    this.talksService
      .addEmployee({
        talkId: this.id,
        employeeId: employee._id,
      })
      .subscribe((response) => {
        this.notificationService.show(
          'Asistente agregado correctamente',
          'success'
        );
        this.getAssistants();
      });
  }

  searchEmployee(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.employeeId = value;
    this.employees = this.employeeTemp.filter(
      (employee) =>
        (employee.firstName ?? '').toLowerCase().includes(value.toLowerCase()) ||
        (employee.lastName ?? '').toLowerCase().includes(value.toLowerCase())
    );
  }
}
