import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Icon } from '../../components/icon/icon';
import { DataComponent } from '../../components/data/data.component';
import { TalksService } from './services/talks.service';
import { Router } from '@angular/router';
import { ConfirmationService } from '../../services/confirmation.service';
import { ITalkFilters, ITalkResponse } from './interfaces/talk.interface';
import { IHeaderList } from '../../interfaces/header-list.interface';
import { FormsModule } from '@angular/forms';
import { TalksExcelService } from './services/talks-excel.service';
import { TURNS } from '../../constants/turns.contant';
import { TALK_TYPES } from '../../constants/talk-type.constant';
import { NotificationService } from '../../services/notification.service';

/**
 * Fecha de hoy en la hora del dispositivo, en `yyyy-mm-dd`.
 *
 * `toISOString()` da la fecha en UTC: en Peru, a partir de las 19:00 ya es
 * manana y el filtro por defecto dejaba fuera las charlas del dia.
 */
export function localToday(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

@Component({
  selector: 'app-talks',
  standalone: true,
  imports: [DataComponent, FormsModule, Icon],
  templateUrl: './talks.html',
  styleUrl: './talks.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Talks {
  private talksService = inject(TalksService);
  private router = inject(Router);
  private confirmationService = inject(ConfirmationService);
  private talksExcelService = inject(TalksExcelService);
  private notificationService = inject(NotificationService);

  // Como senales: sin Zone.js, asignar un campo suelto desde el `subscribe` de
  // una peticion no programa repintado por si mismo.
  readonly talks = signal<ITalkResponse[]>([]);
  readonly loading = signal(true);
  /** Panel de filtros plegado: en un movil ocupaba media pantalla. */
  readonly filtersOpen = signal(false);
  headers: IHeaderList[] = [
    {
      header: 'header',
      items: [
        {
          up: 'workerDate',
          down: 'turn',
        },
        {
          up: 'N° Registro',
          down: 'registerNumber',
        },
      ],
    },
    {
      header: 'Fecha',
      value: 'workerDate',
    },
    {
      header: 'Turno',
      value: 'turn',
    },
    {
      header: 'Número de registro',
      value: 'registerNumber',
    },
    {
      header: 'Tipo',
      value: 'type',
    },
    {
      header: 'Tema',
      value: 'topic',
    },
    {
      header: 'Área',
      value: 'area',
    },
    {
      header: 'Lugar',
      value: 'place',
    },
    {
      header: 'Hora Inicio',
      value: 'startTime',
    },
    {
      header: 'Hora Fin',
      value: 'endTime',
    },
    {
      header: 'Horas',
      value: 'hours',
    },
    {
      header: 'Acciones',
      value: 'actions',
      options: ['edit', 'delete', 'add-employee', 'download'],
    },
  ];
  readonly total = signal(0);
  readonly page = signal(1);
  readonly limit = signal(10);
  turns: string[] = TURNS;
  talkTypes: string[] = TALK_TYPES;
  filters: ITalkFilters = {
    startDate: localToday(),
    endDate: localToday(),
    turn: '',
    registerNumber: '',
    type: '',
  };

  ngOnInit() {
    this.getTalks();
  }

  /**
   * Carga una pagina. Con `append` se suma a lo ya pintado: es lo que hace el
   * boton "Ver mas" de la tabla, que antes emitia el evento sin que nadie lo
   * escuchara y no pasaba de las primeras diez charlas.
   */
  getTalks(page = 1, append = false) {
    if (!append) {
      this.loading.set(true);
    }
    this.talksService.getTalks(this.filters, page, this.limit()).subscribe({
      next: talks => {
        const rows = (talks.data ?? []).map(talk => ({
          ...talk,
          workerDate: this.formatDate(talk.workerDate),
        }));
        this.talks.set(append ? [...this.talks(), ...rows] : rows);
        this.total.set(Number(talks.total) || 0);
        this.page.set(Number(talks.page) || page);
        this.limit.set(Number(talks.limit) || this.limit());
        this.loading.set(false);
      },
      error: () => {
        if (!append) {
          this.talks.set([]);
        }
        this.loading.set(false);
      },
    });
  }

  loadMore(page: number) {
    this.getTalks(page, true);
  }

  toggleFilters() {
    this.filtersOpen.update(v => !v);
  }

  formatDate(date: string): string {
    if (!date) {
      return '';
    }
    const [year, month, day] = date.toString().split('-');
    return `${day}/${month}/${year}`;
  }

  reverseFormatDate(date: string): string {
    const [day, month, year] = date.toString().split('/');
    return `${year}-${month}-${day}`;
  }

  changeDate() {
    this.getTalks();
  }

  clickOptions(option: string, _id: string) {
    if (option === 'edit') {
      this.editTalk(_id);
    } else if (option === 'delete') {
      this.deleteTalk(_id);
    } else if (option === 'add-employee') {
      const talk = this.talks().find((talk) => talk._id === _id);
      const originalDate = talk?.workerDate
        ? this.reverseFormatDate(talk.workerDate)
        : '';
      this.router.navigate([
        '/capacitaciones/asistentes',
        _id,
        originalDate,
        talk?.turn || '',
      ]);
    } else if (option === 'download') {
      this.downloadTalk(_id);
    }
  }

  search() {
    this.getTalks();
  }

  downloadTalk(id: string) {
    this.talksService.getTalk(id).subscribe((talk) => {
      const workerDate = talk.workerDate;
      const turn = talk.turn;

      this.talksService
        .getAssistantsByWorkerDateAndTurn(workerDate, turn, id)
        .subscribe((assistants) => {
          const employees = assistants.map((assistant) => ({
            _id: assistant._id,
            id: parseInt(assistant.document) || 0,
            firstName: assistant.name.split(' ')[0] || '',
            lastName: assistant.name.split(' ').slice(1).join(' ') || '',
            document: assistant.document,
            signature: assistant.signature || '',
            isAssistant: assistant.isAssistant,
            position: assistant.position,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }));

          this.talksExcelService
            .generateTrainingReport({
              talk: talk,
              employees: employees.filter((employee) => employee.isAssistant),
            })
            // En movil la entrega del archivo termina en la hoja de compartir y
            // cerrarla sin elegir nada rechaza la promesa: eso no es un error.
            // Cualquier otro fallo si se avisa; antes se tragaba y el boton
            // parecia no hacer nada.
            .catch(error => {
              if (!/cancel/i.test(String(error?.message ?? error))) {
                console.error('[talks] no se pudo generar el Excel', error);
                this.notificationService.show('No se pudo generar el Excel de la charla', 'error');
              }
            });
        });
    });
  }

  addTalk() {
    this.router.navigate(['/capacitaciones/agregar']);
  }

  editTalk(id: string) {
    this.router.navigate(['/capacitaciones/agregar', id]);
  }

  deleteTalk(id: string) {
    this.confirmationService.show(
      '¿Estás seguro de querer eliminar esta capacitación?',
      () => {
        this.talksService.deleteTalk(id).subscribe(() => {
          this.getTalks();
        });
      }
    );
  }
}
