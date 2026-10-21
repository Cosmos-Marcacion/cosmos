import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NamedBoardService } from '../services/named-board.service';
import { apiErrorMessage } from '../../../interceptors/handled-error';
import { NotificationService } from '../../../services/notification.service';
import { PersonPicker } from '../../../components/person-picker/person-picker';
import { IPersonRef } from '../../../interfaces/person.interface';
import { FormatOutput, IFormatType, ITalkTopic } from '../interfaces/named-board.interface';
import { INamedDetail, INamedStaff } from '../interfaces/named-detail.interface';
import { ITalkOption, TALK_PLACES, TALK_TYPES } from '../../../constants/talk-type.constant';

/** Campos de la ficha que designan a una persona. */
type PersonField =
  | 'jefeCubierta'
  | 'supervisorOperaciones'
  | 'supervisorSsoma'
  | 'trainer'
  | 'registerResponsible'
  | 'jefeCubiertaVsi'
  | 'ssomaVsi';

type StaffFilter = 'todos' | 'presentes' | 'pendientes' | 'completos' | 'sin-registrar';

/**
 * Lo que el operador ha pedido. `pdf` e `imprimir` generan lo mismo y solo se
 * distinguen en el destino, pero cada boton tiene que poder decir si es el suyo
 * el que esta trabajando.
 */
type FormatAction = 'xlsx' | 'pdf';

/**
 * Cada bloque de configuracion de la jornada.
 *
 * Son lo que hay que **rellenar** antes de emitir, frente a lo que hay que
 * **mirar** —el personal, sus marcaciones y los formatos ya emitidos—. Antes
 * convivian en la misma pagina y ganaban ellos: seis tarjetas de formulario
 * empujaban hacia abajo la tabla que se viene a consultar todos los dias.
 */
type PanelId = 'formato' | 'responsables' | 'capacitacion' | 'vsi' | 'notas';

/** Una tarjeta de la tira de configuracion. */
export interface SetupCard {
  id: PanelId;
  title: string;
  /** Lo que hay puesto ahora mismo, en una linea. */
  summary: string;
  /** Si le falta algo de lo que exige el formato. */
  pending: boolean;
  /** `false` cuando lo que lleva es opcional y no bloquea la emision. */
  required: boolean;
}

/**
 * Detalle de una nombrada.
 *
 * Reúne en una sola pantalla lo que antes estaba repartido entre el panel de
 * marcaciones, el listado plano de trabajadores y un modal de tres pestañas:
 * quién está nombrado, qué ha marcado cada uno punto por punto, quiénes son los
 * responsables que firman, la capacitación del turno y los formatos emitidos.
 *
 * Todo se ve a la vez, sin pestañas: el operador necesita comparar el estado de
 * las marcaciones con lo que falta por configurar antes de emitir el formato.
 */
@Component({
  selector: 'app-named-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PersonPicker],
  templateUrl: './named-detail.html',
  styleUrl: './named-detail.scss',
})
export default class NamedDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly boardService = inject(NamedBoardService);
  private readonly notification = inject(NotificationService);

  readonly detail = signal<INamedDetail | null>(null);
  readonly formatTypes = signal<IFormatType[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly notFound = signal(false);

  /**
   * Si se ofrece la descarga en PDF.
   *
   * Depende de que LibreOffice esté instalado en el servidor, que es quien
   * convierte el Excel ya relleno. Se pregunta al servidor en vez de fijarlo
   * aquí: sin convertidor responde 503 y el operador se encontraría con un
   * botón que no funciona.
   */
  readonly pdfEnabled = signal(false);

  /**
   * Qué se está generando ahora mismo, si algo. Distingue Excel de PDF para que
   * cada botón muestre su propio estado en vez de bloquearse los tres a la vez.
   */
  readonly busy = signal<FormatAction | null>(null);
  readonly downloading = computed(() => this.busy() !== null);

  /** Nombre que puso el servidor al último formato generado. */
  private lastFileName = 'formato';

  /** Cambios pendientes de guardar. */
  readonly dirty = signal(false);

  readonly search = signal('');
  readonly filter = signal<StaffFilter>('todos');

  /** El bloque de configuracion abierto, si hay alguno. */
  readonly panel = signal<PanelId | null>(null);

  readonly talkTypes: ITalkOption[] = TALK_TYPES;
  readonly talkPlaces: ITalkOption[] = TALK_PLACES;

  /** Borrador editable de la ficha; la respuesta cargada no se toca. */
  readonly draft = signal<{
    talkType: string;
    talkPlace: string;
    talkIsAnnual: boolean;
    talkStartTime: string;
    talkEndTime: string;
    talkHours: number;
    jefeCubierta: IPersonRef | null;
    supervisorOperaciones: IPersonRef | null;
    supervisorSsoma: IPersonRef | null;
    trainer: IPersonRef | null;
    registerResponsible: IPersonRef | null;
    jefeCubiertaVsi: IPersonRef | null;
    ssomaVsi: IPersonRef | null;
    talkTopics: ITalkTopic[];
    notes: string;
  }>(this.emptyDraft());

  private staffTransmissionId = 0;
  /** `yyyy-mm-dd` recibido en la URL. */
  private dateIso = '';

  ngOnInit() {
    this.staffTransmissionId = Number(this.route.snapshot.paramMap.get('staffTransmissionId'));
    this.dateIso = this.route.snapshot.queryParamMap.get('date') ?? '';
    this.boardService.getFormatTypes().subscribe(types => this.formatTypes.set(types));
    this.boardService.getPdfStatus().subscribe({
      next: status => this.pdfEnabled.set(Boolean(status?.ok)),
      error: () => this.pdfEnabled.set(false),
    });
    this.load();
  }

  private emptyDraft() {
    return {
      talkType: '',
      talkPlace: '',
      talkIsAnnual: false,
      talkStartTime: '',
      talkEndTime: '',
      talkHours: 0,
      jefeCubierta: null as IPersonRef | null,
      supervisorOperaciones: null as IPersonRef | null,
      supervisorSsoma: null as IPersonRef | null,
      trainer: null as IPersonRef | null,
      registerResponsible: null as IPersonRef | null,
      jefeCubiertaVsi: null as IPersonRef | null,
      ssomaVsi: null as IPersonRef | null,
      talkTopics: [
        { topic: '', summary: '' },
        { topic: '', summary: '' },
        { topic: '', summary: '' },
      ] as ITalkTopic[],
      notes: '',
    };
  }

  /** `yyyy-mm-dd` a `dd/mm/yyyy`, que es como identifica la fecha el backend. */
  private get workerDate(): string {
    return this.dateIso.split('-').reverse().join('/');
  }

  load() {
    if (!this.staffTransmissionId || !this.dateIso) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.boardService.getDetail(this.staffTransmissionId, this.workerDate).subscribe({
      next: detail => {
        this.detail.set(detail);
        this.resetDraft(detail);
        this.loading.set(false);
        this.notFound.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.notFound.set(true);
      },
    });
  }

  private resetDraft(detail: INamedDetail) {
    const record = detail.record;
    const topics = record?.talkTopics ?? [];
    this.draft.set({
      talkType: record?.talkType ?? '',
      talkPlace: record?.talkPlace ?? '',
      talkIsAnnual: record?.talkIsAnnual ?? false,
      talkStartTime: record?.talkStartTime ?? '',
      talkEndTime: record?.talkEndTime ?? '',
      talkHours: record?.talkHours ?? 0,
      jefeCubierta: record?.jefeCubierta ?? null,
      supervisorOperaciones: record?.supervisorOperaciones ?? null,
      supervisorSsoma: record?.supervisorSsoma ?? null,
      trainer: record?.trainer ?? null,
      registerResponsible: record?.registerResponsible ?? null,
      jefeCubiertaVsi: record?.jefeCubiertaVsi ?? null,
      ssomaVsi: record?.ssomaVsi ?? null,
      talkTopics: [0, 1, 2].map(i => ({
        topic: topics[i]?.topic ?? '',
        summary: topics[i]?.summary ?? '',
      })),
      notes: record?.notes ?? '',
    });
    this.dirty.set(false);
  }

  // --- edición ---------------------------------------------------------------

  setPerson(field: PersonField, person: IPersonRef | null) {
    this.draft.update(draft => ({ ...draft, [field]: person }));
    this.dirty.set(true);
  }

  setTalkType(value: string) {
    this.draft.update(draft => ({ ...draft, talkType: value }));
    this.dirty.set(true);
  }

  setTalkPlace(value: string) {
    this.draft.update(draft => ({ ...draft, talkPlace: value }));
    this.dirty.set(true);
  }

  setTalkAnnual(value: boolean) {
    this.draft.update(draft => ({ ...draft, talkIsAnnual: value }));
    this.dirty.set(true);
  }

  /**
   * Horario de la charla.
   *
   * Las horas se recalculan solas: en el módulo anterior eran un campo aparte
   * que había que rellenar a mano junto a las dos horas, y acababa sin cuadrar
   * con ellas en la hoja impresa. Siguen siendo editables por si la charla se
   * interrumpe y el tiempo efectivo no es el del reloj.
   */
  setTalkTime(field: 'talkStartTime' | 'talkEndTime', value: string) {
    this.draft.update(draft => {
      const next = { ...draft, [field]: value };
      return { ...next, talkHours: this.hoursBetween(next.talkStartTime, next.talkEndTime) };
    });
    this.dirty.set(true);
  }

  setTalkHours(value: string) {
    const hours = Number(value);
    this.draft.update(draft => ({
      ...draft,
      talkHours: Number.isFinite(hours) && hours >= 0 ? Math.min(hours, 24) : 0,
    }));
    this.dirty.set(true);
  }

  /** Horas entre dos `HH:mm`, con dos decimales. Un turno de noche cruza medianoche. */
  private hoursBetween(startTime: string, endTime: string): number {
    const toMinutes = (time: string) => {
      const [h, m] = time.split(':').map(Number);
      return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
    };
    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    if (start === null || end === null) return 0;
    const minutes = end >= start ? end - start : end + 24 * 60 - start;
    return Math.round((minutes / 60) * 100) / 100;
  }

  setTopic(index: number, key: 'topic' | 'summary', value: string) {
    this.draft.update(draft => {
      const talkTopics = draft.talkTopics.map((topic, i) =>
        i === index ? { ...topic, [key]: value } : topic
      );
      return { ...draft, talkTopics };
    });
    this.dirty.set(true);
  }

  setNotes(value: string) {
    this.draft.update(draft => ({ ...draft, notes: value }));
    this.dirty.set(true);
  }

  // --- estado derivado -------------------------------------------------------

  /**
   * Tipo de nave que trae Cosmos y formato que le toca. Ya no se elige aquí:
   * lo decide `code_type_vessel` y solo ET, GR, ME, CO y BB tienen formato.
   */
  readonly vesselType = computed(() => this.detail()?.vesselType ?? null);

  /** Formato que se emitirá; vacío si el tipo de nave no se acepta. */
  readonly formatType = computed(() => this.vesselType()?.formatType ?? '');

  /** Texto del tipo de nave tal como llega: `GR · GRANEL`. */
  readonly vesselTypeLabel = computed(() => {
    const type = this.vesselType();
    if (!type || !type.code) return 'Sin tipo de nave';
    return type.description ? `${type.code} · ${type.description}` : type.code;
  });

  /** Personal que lista la hoja de asistencia en una página. */
  readonly capacity = computed(
    () => this.formatTypes().find(t => t.id === this.formatType())?.capacity ?? 0
  );

  /** Tamaño a partir del cual el formato se reparte en varias páginas. */
  readonly onePageCapacity = computed(
    () => this.formatTypes().find(t => t.id === this.formatType())?.onePageCapacity ?? 0
  );

  /** El jefe de cubierta ocupa una fila de la hoja, por eso el +1. */
  readonly requiredRows = computed(() => {
    const staffCount = this.detail()?.summary.staffCount ?? 0;
    return staffCount + (this.draft().jefeCubierta ? 1 : 0);
  });

  /**
   * Paginas que ocupara el formato. Ya no se pierde a nadie cuando la
   * nombrada supera los huecos de la plantilla: se anaden paginas.
   */
  readonly estimatedPages = computed(() => {
    const capacity = this.onePageCapacity();
    if (capacity <= 0) return 1;
    return Math.max(1, Math.ceil(this.requiredRows() / capacity));
  });

  /** Lo mínimo que hace falta para que el formato salga completo. */
  readonly missing = computed(() => {
    const draft = this.draft();
    const missing: string[] = [];
    if (!this.formatType()) missing.push('tipo de nave con formato');
    if (!draft.jefeCubierta) missing.push('jefe de cubierta');
    if (!draft.supervisorOperaciones) missing.push('supervisor de operaciones');
    if (!draft.supervisorSsoma) missing.push('supervisor SSOMA');
    if (!draft.talkType) missing.push('tipo de capacitación');
    if (!draft.talkTopics.some(t => t.topic.trim())) missing.push('tema de la charla');
    return missing;
  });

  readonly ready = computed(() => this.missing().length === 0);

  // --- configuracion de la jornada --------------------------------------------

  /**
   * La tira de configuracion: que lleva puesto cada bloque y si le falta algo.
   *
   * El resumen no es decorativo. Es lo que permite que la pagina siga
   * respondiendo "esta lista esta nombrada" de un vistazo ahora que los
   * formularios viven detras de una ventana: sin el, comprobar el jefe de
   * cubierta obligaria a abrir y cerrar cinco veces.
   */
  readonly setupCards = computed<SetupCard[]>(() => {
    const draft = this.draft();
    const tipo = this.formatTypes().find(type => type.id === this.formatType());

    const responsables = [draft.jefeCubierta, draft.supervisorOperaciones, draft.supervisorSsoma];
    const puestos = responsables.filter(Boolean).length;

    const temas = draft.talkTopics.filter(topic => topic.topic.trim()).length;
    const capacitacion = this.talkTypes.find(type => type.id === draft.talkType);

    const aprobadores = [draft.jefeCubiertaVsi, draft.ssomaVsi].filter(Boolean).length;
    const notas = draft.notes.trim();

    return [
      {
        id: 'formato',
        title: 'Formato',
        summary: tipo
          ? `${tipo.label} · ${this.vesselTypeLabel()}`
          : `${this.vesselTypeLabel()} · sin formato`,
        pending: !this.formatType(),
        required: true,
      },
      {
        id: 'responsables',
        title: 'Responsables de la jornada',
        summary: draft.jefeCubierta
          ? `${draft.jefeCubierta.fullName} y ${puestos - 1} mas`
          : `${puestos} de 3 designados`,
        pending: puestos < 3,
        required: true,
      },
      {
        id: 'capacitacion',
        title: 'Capacitación',
        summary: capacitacion
          ? `${capacitacion.label} · ${temas} ${temas === 1 ? 'tema' : 'temas'}`
          : 'Sin tipo ni temas',
        pending: !draft.talkType || temas === 0,
        required: true,
      },
      {
        id: 'vsi',
        title: 'Aprobadores de la inspección',
        summary: `${aprobadores} de 2 designados`,
        pending: aprobadores < 2,
        required: false,
      },
      {
        id: 'notas',
        title: 'Notas internas',
        summary: notas ? this.oneLine(notas) : 'Sin notas',
        pending: false,
        required: false,
      },
    ];
  });

  /** Un texto largo reducido a una linea legible en la tarjeta. */
  private oneLine(text: string): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > 48 ? `${flat.slice(0, 47)}…` : flat;
  }

  /** El titulo de la ventana abierta, tomado de su propia tarjeta. */
  readonly panelTitle = computed(() => {
    const abierto = this.panel();
    return this.setupCards().find(card => card.id === abierto)?.title ?? '';
  });

  openPanel(id: PanelId) {
    this.panel.set(id);
  }

  closePanel() {
    this.panel.set(null);
  }

  /**
   * Escape cierra la ventana abierta.
   *
   * Lo que se escribe dentro ya esta en el borrador: cerrar no descarta nada,
   * se guarda con el resto de la nombrada desde la barra de siempre. Por eso no
   * hay "Cancelar" ni confirmacion al salir.
   */
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.panel()) {
      event.preventDefault();
      this.closePanel();
    }
  }


  /**
   * N.º de permiso de trabajo tal como va impreso en la hoja PTS: cuatro
   * dígitos tras el prefijo `PTS-`, igual que el N.º de ATS que lleva al lado.
   *
   * El correlativo lo reparte el backend la primera vez que se emite el
   * formato, y desde entonces no cambia. Hasta entonces no hay número que
   * mostrar: no se inventa uno aquí para que lo que se ve en pantalla sea
   * exactamente lo que saldrá impreso.
   */
  readonly workPermitLabel = computed(() => this.permitLabel(this.detail()?.record?.workPermitNumber));

  /** `7` a `PTS-0007`. Cadena vacía si todavía no hay número. */
  permitLabel(workPermitNumber: number | null | undefined): string {
    return workPermitNumber ? `PTS-${String(workPermitNumber).padStart(4, '0')}` : '';
  }

  readonly attendanceRate = computed(() => {
    const summary = this.detail()?.summary;
    if (!summary || summary.staffCount === 0) return 0;
    return Math.round((summary.presentCount / summary.staffCount) * 100);
  });

  /**
   * Personal visible, con el recorrido ya resuelto.
   *
   * El hito de cada punto se calcula aquí y no en la plantilla: pintarlo desde
   * el marcado obligaría a buscar la marcación tres veces por celda (clase,
   * clase y título), y son tantas celdas como trabajadores por puntos.
   */
  readonly visibleStaff = computed(() => {
    const detail = this.detail();
    if (!detail) return [];

    const term = this.search().trim().toLowerCase();
    const filter = this.filter();

    return detail.staff
      .filter(person => {
        if (term && !`${person.fullName} ${person.document} ${person.roleDescription}`.toLowerCase().includes(term)) {
          return false;
        }
        switch (filter) {
          case 'presentes': return person.markCount > 0;
          case 'pendientes': return person.markCount === 0;
          case 'completos': return person.completed;
          case 'sin-registrar': return !person.registered;
          default: return true;
        }
      })
      .map(person => {
        const byPoint = new Map(person.marks.map(mark => [mark.pointId, mark]));
        return {
          ...person,
          status: this.statusOf(person),
          trail: detail.points.map(point => {
            const mark = byPoint.get(point.id) ?? null;
            const time = mark ? new Date(mark.date) : null;
            const hour = time
              ? `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
              : '';
            return {
              pointId: point.id,
              done: Boolean(mark && !mark.isAbsence),
              absence: Boolean(mark?.isAbsence),
              title: `${point.name} · ${hour || 'sin marcar'}`,
            };
          }),
        };
      });
  });

  readonly filters: { id: StaffFilter; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'presentes', label: 'Con marcación' },
    { id: 'pendientes', label: 'Sin marcación' },
    { id: 'completos', label: 'Recorrido completo' },
    { id: 'sin-registrar', label: 'Sin registrar' },
  ];

  statusOf(person: INamedStaff): { label: string; tone: string } {
    if (!person.registered) return { label: 'Sin registrar', tone: 'neutral' };
    if (person.absent) return { label: 'Falta', tone: 'danger' };
    if (person.completed) return { label: 'Completo', tone: 'success' };
    if (person.markCount > 0) return { label: 'En curso', tone: 'info' };
    return { label: 'Sin marcar', tone: 'warning' };
  }

  formatLabel(id: string): string {
    return this.formatTypes().find(t => t.id === id)?.label ?? 'Sin definir';
  }

  // --- acciones --------------------------------------------------------------

  save() {
    const detail = this.detail();
    if (!detail) return;

    const draft = this.draft();
    const empty: IPersonRef = { fullName: '', document: '', source: 'manual' };

    this.saving.set(true);
    this.boardService
      .saveRecord(detail.named.staffTransmissionId, {
        workerDate: detail.named.workerDate,
        talkType: draft.talkType,
        talkPlace: draft.talkPlace,
        talkIsAnnual: draft.talkIsAnnual,
        talkStartTime: draft.talkStartTime,
        talkEndTime: draft.talkEndTime,
        talkHours: draft.talkHours,
        jefeCubierta: draft.jefeCubierta ?? empty,
        supervisorOperaciones: draft.supervisorOperaciones ?? empty,
        supervisorSsoma: draft.supervisorSsoma ?? empty,
        trainer: draft.trainer ?? empty,
        registerResponsible: draft.registerResponsible ?? empty,
        jefeCubiertaVsi: draft.jefeCubiertaVsi ?? empty,
        ssomaVsi: draft.ssomaVsi ?? empty,
        talkTopics: draft.talkTopics.filter(t => t.topic.trim() || t.summary.trim()),
        notes: draft.notes,
      } as any)
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.dirty.set(false);
          this.notification.show('Nombrada guardada', 'success');
          this.load();
        },
        error: () => {
          this.saving.set(false);
          this.notification.show('No se pudo guardar la nombrada', 'error');
        },
      });
  }

  /** Descarga el formato en Excel. */
  download() {
    this.emit('xlsx', blob => this.saveToDisk(blob));
  }

  /** El mismo formato, en PDF. */
  downloadPdf() {
    this.emit('pdf', blob => this.saveToDisk(blob));
  }

  /** Descarga el blob con el nombre que puso el servidor. */
  private saveToDisk(blob: Blob, fileName = this.lastFileName) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /**
   * Genera el formato y hace algo con él.
   *
   * Lo que cambia entre descargar e imprimir es solo el destino: la generación
   * es la misma llamada, así que no hay dos caminos que puedan divergir.
   */
  private emit(action: FormatAction, deliver: (blob: Blob) => void) {
    const output: FormatOutput = action;
    const detail = this.detail();
    if (!detail) return;

    if (this.dirty()) {
      this.notification.show('Guarda los cambios antes de emitir el formato', 'warning');
      return;
    }

    this.busy.set(action);
    this.boardService
      .downloadFormat(detail.named.staffTransmissionId, detail.named.workerDate, output)
      .subscribe({
        next: result => {
          this.lastFileName = result.fileName;
          deliver(result.blob);
          this.busy.set(null);

          const permit = result.workPermitNumber
            ? ` · permiso ${this.permitLabel(result.workPermitNumber)}`
            : '';
          const pages = result.pages > 1 ? ` en ${result.pages} páginas` : '';
          this.notification.show(
            `Formato ${output === 'pdf' ? 'PDF' : 'Excel'} con ${result.staffCount} personas${pages}${permit}`,
            'success'
          );
          this.load();
        },
        error: error => {
          this.busy.set(null);
          // El backend responde 503 cuando falta el convertidor en el servidor;
          // decirlo tal cual ahorra buscar el fallo en el sitio equivocado.
          // Fuera de ese caso se muestra lo que dijo la API (tipo de nave sin
          // formato, datos incompletos); antes salia siempre el mismo texto.
          const message = error?.status === 503
            ? 'La descarga en PDF no está disponible en el servidor todavía'
            : apiErrorMessage(error, `No se pudo generar el formato${output === 'pdf' ? ' en PDF' : ''}`);
          this.notification.show(message, 'error');
        },
      });
  }

  backToBoard() {
    this.router.navigate(['/marcaciones'], { queryParams: { date: this.dateIso } });
  }

  /** Listado por trabajador, ya filtrado a esta fecha y turno. */
  goToEntries() {
    const detail = this.detail();
    if (!detail) return;
    this.router.navigate(['/marcaciones/listado'], {
      queryParams: {
        workerDate: detail.named.workerDateIso,
        turn: detail.named.shiftDescription,
      },
    });
  }

  /** Ficha de marcaciones de un trabajador concreto dentro de esta nombrada. */
  goToWorker(person: INamedStaff) {
    const detail = this.detail();
    if (!detail || !person.employeeId) {
      return;
    }
    this.router.navigate([
      '/marcaciones/ver',
      person.employeeId,
      detail.named.workerDateIso,
      detail.named.staffTransmissionId,
    ]);
  }
}
