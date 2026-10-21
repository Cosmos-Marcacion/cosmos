import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, Location, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { EntriesService } from '../services/entries.service';
import { IEntryResponseRes, IListStaffEmployee } from '../interfaces/entries.interface';
import { IEmployeeResponse } from '../../../interfaces/employee.interface';
import { IPointResponse } from '../../points/interfaces/point.interface';
import { PointsService } from '../../points/services/points.service';
import { NotificationService } from '../../../services/notification.service';
import { ConfirmationService } from '../../../services/confirmation.service';

/** Lo que se esta escribiendo en la fila abierta. */
export interface IEntryDraft {
  pointId: string;
  date: string;
  time: string;
  observation: string;
}

/** Fila nueva: aun no tiene id. */
export const NEW_ENTRY = 'nueva';

const pad = (value: number) => value.toString().padStart(2, '0');
const TIME_RE = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

@Component({
  selector: 'app-view-entries',
  imports: [DatePipe, NgTemplateOutlet],
  templateUrl: './view-entries.html',
  styleUrl: './view-entries.scss'
})
export default class ViewEntries {

  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private location = inject(Location)
  private entriesService = inject(EntriesService)
  private pointsService = inject(PointsService)
  private notificationService = inject(NotificationService)
  private confirmationService = inject(ConfirmationService)

  readonly NEW_ENTRY = NEW_ENTRY
  readonly observations = ['Accidente', 'Enfermedad', 'Permiso', 'Otros']

  employeeId = this.route.snapshot.params['employeeId']
  workerDate = this.route.snapshot.params['workerDate']
  namedId = this.route.snapshot.params['namedId']

  entries = signal<IEntryResponseRes[]>([])
  named = signal<IListStaffEmployee | null>(null)
  employee = signal<IEmployeeResponse | null>(null)
  points = signal<IPointResponse[]>([])
  loaded = signal(false)

  /** Id de la fila que se edita, `NEW_ENTRY` si es una nueva, o nulo. */
  editingId = signal<string | null>(null)
  draft = signal<IEntryDraft>({ pointId: '', date: '', time: '', observation: '' })
  isSaving = signal(false)

  readonly isValidTime = computed(() => TIME_RE.test(this.draft().time))
  readonly canSave = computed(() => {
    const draft = this.draft()
    return !!draft.pointId && !!draft.date && this.isValidTime() && !this.isSaving()
  })

  /** Puntos del recorrido que el trabajador aun no tiene marcados en la jornada. */
  readonly missingPoints = computed(() => {
    const marked = new Set(this.entries().map(entry => entry.pointId?._id).filter(Boolean))
    return [...this.points()]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .filter(point => !marked.has(point._id))
  })

  /** Se puede registrar una marcacion: hace falta el documento y la nombrada. */
  readonly canCreate = computed(() => !!this.employee()?.document && !!this.named())

  ngOnInit() {
    this.getEntriesEmployee()
    this.pointsService.getPoints(0, 1, '').subscribe(res => this.points.set(res.data))
  }

  /**
   * La fecha de trabajo en `aaaa-mm-dd`, que es lo que pide la API.
   *
   * El Panel y el listado la mandan como `dd/mm/aaaa`, pero el detalle de la
   * nombrada ya la manda en ISO. Partirla siempre por `/` convertía la ISO en
   * "undefined-undefined-2026-09-10": la lista salía vacía y la edición
   * guardaba una fecha inválida.
   */
  formatDate(date: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
    const [day, month, year] = date.split('/')
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  get workerDateIso() {
    return this.formatDate(this.workerDate)
  }

  getEntriesEmployee() {
    this.entriesService.getEntriesEmployee(this.employeeId, this.namedId, this.workerDateIso).subscribe({
      next: (res) => {
        this.entries.set(res.entries ?? [])
        this.named.set(res.named ?? null)
        this.employee.set(res.employee ?? null)
        this.loaded.set(true)
      },
      error: () => this.loaded.set(true),
    })
  }

  /** Vuelve a donde se vino (detalle de la nombrada o listado); si se entró por enlace, al tablero. */
  goBack() {
    const navigationId = (this.location.getState() as { navigationId?: number } | null)?.navigationId ?? 1
    if (navigationId > 1) {
      this.location.back()
      return
    }
    this.router.navigate(['/marcaciones'])
  }

  // Fecha y hora locales de la marcacion. Se toma el dia de la propia marcacion
  // y no el de la jornada: la salida del turno de noche cae al dia siguiente, y
  // con la fecha de la jornada se guardaba 24 horas antes.
  private splitDate(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return { date: this.workerDateIso, time: '' }
    }
    return {
      date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    }
  }

  startEdit(entry: IEntryResponseRes) {
    this.editingId.set(entry._id)
    this.draft.set({
      pointId: entry.pointId?._id ?? '',
      ...this.splitDate(entry.date),
      observation: entry.observation ?? '',
    })
  }

  startNew(pointId = '') {
    this.editingId.set(NEW_ENTRY)
    this.draft.set({
      pointId: pointId || this.missingPoints()[0]?._id || '',
      date: this.workerDateIso,
      time: '',
      observation: '',
    })
  }

  cancelEdit() {
    this.editingId.set(null)
  }

  setDraft(field: keyof IEntryDraft, event: Event) {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value
    this.draft.update(draft => ({ ...draft, [field]: value }))
  }

  save() {
    const id = this.editingId()
    if (!id || !this.canSave()) return
    const draft = this.draft()
    const time = draft.time.padStart(5, '0')

    if (id === NEW_ENTRY) {
      const employee = this.employee()
      const named = this.named()
      if (!employee?.document || !named) return
      this.submit(
        this.entriesService.createEntry({
          // `/entry/manual` busca al trabajador por documento.
          employeeId: employee.document,
          pointId: draft.pointId,
          date: this.workerDateIso,
          markDate: draft.date !== this.workerDateIso ? draft.date : undefined,
          time,
          namedId: named.staff_transmission_id,
          observation: draft.observation,
        }),
        'Marcación registrada'
      )
      return
    }

    // Con espacio en vez de `T` la cadena no es ISO: Safari devuelve
    // `Invalid Date` y `toISOString()` lanzaba sin avisar al usuario.
    const date = new Date(`${draft.date}T${time}:00`)
    this.submit(
      this.entriesService.updateEntry(id, {
        pointId: draft.pointId,
        date: date.toISOString(),
        observation: draft.observation,
      }),
      'Marcación actualizada'
    )
  }

  private submit(request: Observable<unknown>, message: string) {
    this.isSaving.set(true)
    request.subscribe({
      next: () => {
        this.isSaving.set(false)
        this.editingId.set(null)
        this.notificationService.show(message, 'success')
        this.getEntriesEmployee()
      },
      // El interceptor ya muestra el mensaje de la API; aquí solo se libera el botón.
      error: () => this.isSaving.set(false),
    })
  }

  deletePoint(entry: IEntryResponseRes) {
    const name = entry.pointId?.name ?? 'punto eliminado'
    this.confirmationService.show(`¿Eliminar la marcación de "${name}"? No se puede deshacer.`, () => {
      this.entriesService.deleteEntry(entry._id).subscribe(() => {
        this.notificationService.show('Marcación eliminada', 'success')
        this.getEntriesEmployee()
      })
    })
  }
}
