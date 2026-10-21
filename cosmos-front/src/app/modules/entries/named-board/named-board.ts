import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NamedBoardService } from '../services/named-board.service';
import { apiErrorMessage } from '../../../interceptors/handled-error';
import { NotificationService } from '../../../services/notification.service';
import { TURNS } from '../../../constants/turns.contant';
import { TALK_TYPES } from '../../../constants/talk-type.constant';
import { IFormatType, INamedBoardRow } from '../interfaces/named-board.interface';

/**
 * Marcaciones, por nombrada.
 *
 * La unidad de trabajo real es la nombrada: cada navío que llega en una fecha y
 * un turno, con su personal. Esta pantalla es el índice; todo el detalle (quién
 * marcó, quiénes firman, la capacitación y los formatos) vive en su propia
 * vista, a un clic de la tarjeta.
 */
@Component({
  selector: 'app-named-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './named-board.html',
  styleUrl: './named-board.scss',
})
export default class NamedBoard {
  private readonly boardService = inject(NamedBoardService);
  private readonly notification = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly turns = TURNS;
  readonly rows = signal<INamedBoardRow[]>([]);
  readonly formatTypes = signal<IFormatType[]>([]);
  readonly loading = signal(true);
  /** Fallo de la consulta; sin esto un error se leia como "no hay nombradas". */
  readonly loadError = signal(false);
  /** Nombrada cuya descarga está en curso, para no bloquear toda la pantalla. */
  readonly downloadingId = signal<number | null>(null);

  workerDate = new Date(
    Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
  ).toISOString().split('T')[0];
  selectedTurn = '';
  /**
   * Senal y no campo: `visibleRows` es un `computed` y solo se recalcula con
   * senales. Con un campo normal, escribir en Buscar no filtraba nada hasta que
   * cambiaban las filas.
   */
  readonly searchTerm = signal('');

  readonly visibleRows = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.rows();
    return this.rows().filter(r =>
      `${r.vesselDescription} ${r.staffVesselId} ${r.staffVesselNumber} ${r.voyageNumber}`
        .toLowerCase()
        .includes(term)
    );
  });

  /** Resumen del día, para saber de un vistazo qué queda por configurar. */
  readonly summary = computed(() => {
    const rows = this.rows();
    return {
      total: rows.length,
      ready: rows.filter(r => r.ready).length,
      staff: rows.reduce((total, r) => total + r.staffCount, 0),
      assisted: rows.reduce((total, r) => total + r.assistCount, 0),
    };
  });

  ngOnInit() {
    // Al volver del detalle se conserva el día que se estaba mirando.
    const date = this.route.snapshot.queryParamMap.get('date');
    if (date) {
      this.workerDate = date;
    }
    this.boardService.getFormatTypes().subscribe(types => this.formatTypes.set(types));
    this.load();
  }

  /** `yyyy-mm-dd` a `dd/mm/yyyy`, que es lo que espera el servicio externo. */
  private toApiDate(iso: string): string {
    return iso.split('-').reverse().join('/');
  }

  load() {
    const date = this.toApiDate(this.workerDate);
    this.loading.set(true);
    this.loadError.set(false);
    this.boardService
      .getBoard({ sInitialDate: date, sFinalDate: date, turn: this.selectedTurn || undefined })
      .subscribe({
        next: rows => {
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.loadError.set(true);
          this.loading.set(false);
        },
      });
  }

  changeDate(days: number) {
    const date = new Date(`${this.workerDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    this.workerDate = date.toISOString().split('T')[0];
    this.load();
  }

  today() {
    this.workerDate = new Date(
      Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
    ).toISOString().split('T')[0];
    this.load();
  }

  /** Abre el detalle completo de la nombrada. */
  open(row: INamedBoardRow) {
    this.router.navigate(['/marcaciones/nombrada', row.staffTransmissionId], {
      queryParams: { date: row.workerDateIso },
    });
  }

  download(row: INamedBoardRow, event: Event) {
    event.stopPropagation();

    if (!row.formatType) {
      // El formato lo decide el tipo de nave que envía Cosmos; no hay nada que elegir.
      this.notification.show(
        `El tipo de nave ${this.vesselTypeLabel(row)} no tiene formato. Solo ET, GR, ME, CO y BB.`,
        'error'
      );
      return;
    }

    this.downloadingId.set(row.staffTransmissionId);
    this.boardService.downloadFormat(row.staffTransmissionId, row.workerDate).subscribe({
      next: result => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(result.blob);
        link.download = result.fileName;
        link.click();
        URL.revokeObjectURL(link.href);
        this.downloadingId.set(null);

        this.notification.show(
          result.pages > 1
            ? `Formato descargado con ${result.staffCount} personas en ${result.pages} páginas`
            : `Formato descargado con ${result.staffCount} personas`,
          'success'
        );
        this.load();
      },
      error: error => {
        this.downloadingId.set(null);
        this.notification.show(apiErrorMessage(error, 'No se pudo generar el formato'), 'error');
      },
    });
  }

  formatLabel(id: string): string {
    return this.formatTypes().find(t => t.id === id)?.label ?? 'Sin definir';
  }

  /** `GR · GRANEL`, tal como llega de Cosmos. */
  vesselTypeLabel(row: INamedBoardRow): string {
    const type = row.vesselType;
    if (!type?.code) return row.formatType ? this.formatLabel(row.formatType) : 'Sin tipo';
    return type.description ? `${type.code} · ${type.description}` : type.code;
  }

  /** Capacitación de la nombrada, resumida para la tarjeta. */
  talkLabel(row: INamedBoardRow): string {
    const type = TALK_TYPES.find(t => t.id === row.talkType)?.label;
    if (!type) return 'Sin registrar';
    return row.talkTopicsCount > 0 ? `${type} · ${row.talkTopicsCount} tema(s)` : type;
  }

  /** Porcentaje de personal con marcación, para la barra de la tarjeta. */
  attendanceRate(row: INamedBoardRow): number {
    if (!row.staffCount) return 0;
    return Math.round((row.assistCount / row.staffCount) * 100);
  }
}
