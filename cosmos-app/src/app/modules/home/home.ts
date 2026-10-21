import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NamedService } from '../../services/named.service';
import {
  IEntryResponse,
  IListStaff,
  INamedResponseFormat,
  IShiftDescription,
} from './interfaces/named-payload.interface';
import { NotificationService } from '../../services/notification.service';
import { CapPipe } from '../../pipes/cap-pipe';
import { FormatService } from '../../services/format.service';
import { Icon } from '../../components/icon/icon';

/**
 * Fila de personal ya resuelta.
 *
 * Todo lo que la plantilla necesita se calcula aqui, una vez por respuesta.
 * Antes la plantilla llamaba a metodos: `getLastEntry()` aparecia cuatro veces
 * por fila (en la clase de fondo, en el nombre del punto y dos en la hora) y
 * cada llamada hacia un `.sort()` **sobre el array recibido**, mutandolo. Con
 * una nombrada de 150 personas eso son 600 ordenaciones en cada ciclo de
 * deteccion de cambios, y ademas `getTotalEntriesByNamed()` volvia a recorrer
 * el detalle entero llamando otra vez a `isComplete()`.
 */
interface StaffRow {
  staffId: number;
  employeeId: string;
  lastName: string;
  firstName: string;
  role: string;
  /** Marcada como falta: se pinta el contador en ambar y sin ultimo punto. */
  isAbsent: boolean;
  /**
   * Recorrido terminado: marco el punto de salida. Lo decide el backend; antes
   * se miraba `order === 8` y con menos puntos no se cumplia nunca.
   */
  isComplete: boolean;
  lastPointName: string;
  lastDate: string | null;
  record: string;
}

interface NamedCard {
  key: string;
  staffTransmissionId: number;
  staffVesselId: number;
  staffVesselNumber: string;
  voyageNumber: string;
  vesselDescription: string;
  pierDescription: string;
  workerDate: string;
  /** `presentes/total` mas ` S-n` con los que completaron el recorrido. */
  counter: string;
  rows: StaffRow[];
}

interface TurnGroup {
  turn: string;
  counter: string;
  cards: NamedCard[];
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule, CapPipe, DatePipe, Icon],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Home {
  private readonly router = inject(Router);
  private readonly notificationService = inject(NotificationService);
  private readonly formatService = inject(FormatService);
  private readonly namedService = inject(NamedService);

  // Estado como senales. Sin Zone.js, escribir un campo suelto desde el
  // `subscribe` de una peticion no programa repintado: la pantalla solo se
  // refrescaba porque el interceptor apagaba el indicador de carga y era **eso**
  // lo que disparaba la deteccion. Dependia de un efecto colateral ajeno.
  readonly date = signal(this.getCurrentDateUTC());
  readonly turns = signal<TurnGroup[]>([]);
  readonly loading = signal(true);
  readonly showDatePicker = signal(false);

  /** Turnos y nombradas desplegados, por su clave. */
  private readonly openTurns = signal<ReadonlySet<string>>(new Set());
  private readonly openCards = signal<ReadonlySet<string>>(new Set());

  readonly hasData = computed(() => this.turns().length > 0);
  readonly displayDate = computed(() => this.formatDisplayDate(this.date()));

  /** Fecha del selector nativo, que trabaja con `yyyy-mm-dd`. */
  get pickerDate(): string {
    return this.date();
  }
  set pickerDate(value: string) {
    this.date.set(value);
  }

  ngOnInit() {
    this.getNameds();
  }

  isTurnOpen(turn: string) {
    return this.openTurns().has(turn);
  }

  isCardOpen(key: string) {
    return this.openCards().has(key);
  }

  toggleTurn(turn: string) {
    this.openTurns.update(set => toggled(set, turn));
  }

  toggleCard(key: string) {
    this.openCards.update(set => toggled(set, key));
  }

  // === Fechas ==============================================================
  // La aritmetica de fechas se conserva tal cual: todo en UTC para que la
  // nombrada no cambie de dia segun el huso del dispositivo.

  private getCurrentDateUTC(): string {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private convertToUTCDate(dateString: string): string {
    const date = new Date(dateString + 'T00:00:00.000Z');
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private isValidUTCDate(dateString: string): boolean {
    const date = new Date(dateString + 'T00:00:00.000Z');
    return !isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(dateString);
  }

  private completeZero(value: string) {
    return value.length === 1 ? `0${value}` : value;
  }

  formatDisplayDate(dateString: string): string {
    const date = new Date(dateString + 'T00:00:00.000Z');
    const day = date.getUTCDate().toString().padStart(2, '0');
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}/${date.getUTCFullYear()}`;
  }

  private getDates() {
    const date = new Date(this.date() + 'T00:00:00.000Z');
    const dateFormatted = `${this.completeZero(
      date.getUTCDate().toString()
    )}/${this.completeZero(
      (date.getUTCMonth() + 1).toString()
    )}/${date.getUTCFullYear()}`;
    return { sInitialDate: dateFormatted, sFinalDate: dateFormatted };
  }

  changeDate(days: number) {
    const currentDate = new Date(this.date() + 'T00:00:00.000Z');
    currentDate.setUTCDate(currentDate.getUTCDate() + days);
    this.date.set(this.convertToUTCDate(currentDate.toISOString().split('T')[0]));
    this.getNameds();
  }

  onDateChange() {
    this.showDatePicker.set(false);
    if (this.isValidUTCDate(this.date())) {
      this.date.set(this.convertToUTCDate(this.date()));
      this.getNameds();
    } else {
      this.notificationService.show(
        'Fecha inválida. Por favor seleccione una fecha válida.',
        'error'
      );
    }
  }

  goToToday() {
    this.date.set(this.getCurrentDateUTC());
    this.getNameds();
  }

  openDatePicker() {
    this.showDatePicker.set(true);
  }

  toggleDatePicker() {
    this.showDatePicker.update(v => !v);
  }

  // === Carga ===============================================================

  getNameds() {
    this.loading.set(true);
    this.namedService.getNameds(this.getDates()).subscribe({
      next: res => {
        this.turns.set(this.buildTurns(res));
        this.loading.set(false);
      },
      error: () => {
        this.turns.set([]);
        this.loading.set(false);
      },
    });
  }

  /** Traduce la respuesta al modelo que pinta la plantilla. Una sola pasada. */
  private buildTurns(res: INamedResponseFormat[]): TurnGroup[] {
    const groups = res[0]?.turns ?? [];
    const autoOpen = new Set<string>();

    const turns = groups.map(turn => {
      const cards = turn.entries.map(entry => this.buildCard(entry));
      if (this.isCurrentTurn(turn.turn)) {
        autoOpen.add(turn.turn);
      }
      return {
        turn: turn.turn,
        counter: this.turnCounter(turn.entries),
        cards,
      };
    });

    // El turno en curso se abre solo, como antes. Lo que el usuario haya
    // desplegado a mano en esta sesion se conserva.
    this.openTurns.update(open => new Set([...open, ...autoOpen]));
    return turns;
  }

  private buildCard(entry: IShiftDescription): NamedCard {
    // Copia antes de ordenar: el metodo anterior ordenaba el array de la
    // respuesta en el sitio, asi que cualquier otro consumidor lo recibia ya
    // reordenado sin haberlo pedido.
    const details = [...entry.detail].sort((a, b) => {
      const lastNameComparison = (a.last_name?.toLowerCase() || '').localeCompare(
        b.last_name?.toLowerCase() || '',
        'es',
        { numeric: true }
      );
      if (lastNameComparison !== 0) {
        return lastNameComparison;
      }
      return (a.first_name?.toLowerCase() || '').localeCompare(
        b.first_name?.toLowerCase() || '',
        'es',
        { numeric: true }
      );
    });

    let present = 0;
    let completed = 0;
    const rows = details.map(detail => {
      const row = this.buildRow(detail);
      if (detail.entriesInfo?.length > 0 && detail.record !== 'Falta') {
        present++;
      }
      if (row.isComplete) {
        completed++;
      }
      return row;
    });

    return {
      key: `${entry.named.staff_transmission_id}:${entry.named.staff_vessel_id}`,
      staffTransmissionId: entry.named.staff_transmission_id,
      staffVesselId: entry.named.staff_vessel_id,
      staffVesselNumber: entry.named.staff_vessel_number,
      voyageNumber: entry.named.voyage_number,
      vesselDescription: entry.named.vessel_description,
      pierDescription: entry.named.pier_description,
      workerDate: entry.named.worker_date,
      counter: `${present}/${rows.length}${completed > 0 ? ` S-${completed}` : ''}`,
      rows,
    };
  }

  private buildRow(detail: IListStaff): StaffRow {
    const last = lastEntryOf(detail.entriesInfo ?? []);
    return {
      staffId: detail.staff_id,
      employeeId: detail.employeeInfo?._id ?? '',
      lastName: detail.last_name,
      firstName: detail.first_name,
      role: detail.staff_role_type_description,
      isAbsent: detail.record === 'Falta',
      isComplete: !!detail.isComplete,
      lastPointName: last?.pointId?.name ?? '',
      lastDate: last?.date ?? null,
      record: detail.record || '0',
    };
  }

  private turnCounter(entries: IShiftDescription[]): string {
    const withMarks = entries.filter(entry =>
      entry.detail.some(d => d.entriesInfo?.length > 0 && d.record !== 'Falta')
    ).length;
    return `${withMarks}/${entries.length}`;
  }

  isCurrentTurn(turnString: string): boolean {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const timeRange = turnString.split(' - ');
    if (timeRange.length !== 2) return false;

    const startTime = parseTimeToMinutes(timeRange[0]);
    const endTime = parseTimeToMinutes(timeRange[1]);

    // El turno de noche cruza la medianoche.
    return endTime < startTime
      ? currentTime >= startTime || currentTime < endTime
      : currentTime >= startTime && currentTime < endTime;
  }

  // === Acciones ============================================================

  redirectToEmployeeDetail(employeeId: string, staffTransmissionId: number) {
    if (!employeeId || !staffTransmissionId) {
      this.notificationService.show('El empleado no se encuentra registrado', 'error');
      return;
    }
    this.router.navigate(['/detalle-empleado', employeeId, staffTransmissionId, this.date()]);
  }

  /**
   * Descarga el formato unico de la nombrada. Lo genera el backend con la
   * plantilla que toca por el tipo de nave que envia Cosmos.
   */
  downloadFormato(card: NamedCard, event: Event) {
    event.stopPropagation();

    const workerDate = card.workerDate || this.namedService.formatDate(this.date());
    this.formatService.download(card.staffTransmissionId, workerDate).subscribe({
      next: async result => {
        try {
          await this.formatService.save(result);
        } catch {
          // En movil `save` abre la hoja de compartir; cerrarla sin elegir nada
          // llega aqui como error y no hay nada que avisar.
          return;
        }
        this.notificationService.show(
          result.pages > 1
            ? `Formato descargado con ${result.staffCount} personas en ${result.pages} páginas`
            : `Formato descargado con ${result.staffCount} personas`,
          'success'
        );
      },
      error: async error => {
        this.notificationService.show(await formatErrorMessage(error), 'error');
      },
    });
  }
}

/**
 * Mensaje de un fallo al descargar el formato.
 *
 * El cuerpo llega como Blob porque se pidio un fichero. Un 422 trae el motivo
 * (el tipo de nave no tiene formato) y cualquier otro error del backend tambien
 * trae el suyo en JSON; solo se leia el del 422.
 */
export async function formatErrorMessage(error: any): Promise<string> {
  const fallback = 'No se pudo generar el formato';
  if (error?.status === 0) {
    return 'No hay conexion con el servidor';
  }
  if (error?.error instanceof Blob) {
    try {
      const message = JSON.parse(await error.error.text())?.message;
      if (Array.isArray(message) && message.length) {
        return message.join('. ');
      }
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    } catch {
      // Sin cuerpo legible se queda el mensaje generico.
    }
  }
  return fallback;
}

/** Marcacion mas reciente, sin tocar el array de origen. */
function lastEntryOf(entries: IEntryResponse[]): IEntryResponse | undefined {
  let latest: IEntryResponse | undefined;
  let latestTime = -Infinity;
  for (const entry of entries) {
    const time = new Date(entry.createdAt).getTime();
    if (time > latestTime) {
      latestTime = time;
      latest = entry;
    }
  }
  return latest;
}

function parseTimeToMinutes(timeString: string): number {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

function toggled(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set);
  next.has(key) ? next.delete(key) : next.add(key);
  return next;
}
