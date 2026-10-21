import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, finalize, of } from 'rxjs';
import { ConfirmationService } from '../../../services/confirmation.service';
import { FormatsService } from '../services/formats.service';
import { FormatBuilder } from '../builder/format-builder';
import { FormatHistory } from '../history/format-history';
import {
  IDefinitionSummary,
  IDefinitionVersion,
  IDocumentDefinition,
  IFormatCatalog,
  IFormatDefinition,
  ISectionDefinition,
  IStaleDraft,
  IValidationIssue,
} from '../interfaces/format-document.interface';

/**
 * El maestro de formatos.
 *
 * Es el envoltorio: elegir el tipo, cambiar de documento, guardar, publicar y
 * los ajustes que se tocan una vez cada muchas. **La edición vive en
 * `format-builder`**, que pinta el documento y deja editarlo encima.
 *
 * Antes esta pantalla era también el editor: tarjetas plegables con tablas de
 * fila, columna y texto. Cambiar una palabra del ATS costaba seis
 * interacciones y obligaba a entender siete conceptos del modelo. El análisis
 * y el porqué del rediseño están en `INFORME_UI_FORMATOS.md`.
 */
@Component({
  selector: 'app-format-master',
  standalone: true,
  imports: [CommonModule, FormsModule, FormatBuilder, FormatHistory],
  templateUrl: './format-master.html',
  styleUrl: './format-master.scss',
})
export default class FormatMaster {
  private formats = inject(FormatsService);
  private confirmation = inject(ConfirmationService);

  /**
   * El desplegable de tipo, para devolverlo a su sitio.
   *
   * Cambiar de tipo con cambios sin guardar pregunta antes, y al responder que
   * no hay que deshacer lo que el navegador ya movió: el desplegable enseña la
   * opción elegida aunque la pantalla siga en la anterior.
   */
  private readonly typeSelect = viewChild<ElementRef<HTMLSelectElement>>('typeSelect');

  readonly types = signal<IDefinitionSummary[]>([]);
  readonly catalog = signal<IFormatCatalog | null>(null);
  readonly draft = signal<IFormatDefinition | null>(null);
  readonly issues = signal<IValidationIssue[]>([]);

  /**
   * Un borrador guardado que ha quedado por detras de lo publicado.
   *
   * No se sirve, pero tampoco se borra: puede tener horas de trabajo dentro.
   * Se avisa para que quien edita decida, en vez de servirlo por encima de la
   * definicion buena como pasaba antes.
   */
  readonly staleDraft = signal<IStaleDraft | null>(null);
  readonly versions = signal<IDefinitionVersion[]>([]);

  readonly formatType = signal('');
  readonly openDocument = signal('');
  readonly newSectionKind = signal('');
  readonly loading = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly dirty = signal(false);
  readonly historyOpen = signal(false);
  /** No se pudo traer el historial. Distinto de no tener publicaciones. */
  readonly versionsError = signal(false);
  /** No se pudo traer el catálogo de bloques: se puede editar, no añadir. */
  readonly catalogError = signal(false);

  /**
   * Hay un borrador guardado para este tipo.
   *
   * Se lleva aparte de `types()`, que solo se pide al entrar: guardar, publicar
   * o descartar lo cambian sin recargar la lista, y el historial necesita
   * saberlo para ofrecer —o no— la entrada de lo que está sin publicar.
   */
  readonly hasDraft = signal(false);

  readonly documents = computed(() => this.draft()?.documents ?? []);
  readonly current = computed(() =>
    this.documents().find((document) => document.id === this.openDocument()) ?? null
  );

  constructor() {
    // El catálogo solo alimenta el desplegable de "añadir bloque". Sin él la
    // pantalla sigue sirviendo para editar, así que se dice lo que falta en vez
    // de tratarlo como un fallo de la pantalla entera.
    this.formats
      .getCatalog()
      .pipe(
        catchError(() => {
          this.catalogError.set(true);
          return of(null);
        })
      )
      .subscribe((catalog) => catalog && this.catalog.set(catalog));

    this.formats
      .listDefinitions()
      .pipe(
        catchError(() => {
          this.error.set(
            'No se pudo cargar la lista de formatos. Revisa tu conexión y vuelve a entrar.'
          );
          return of(null);
        })
      )
      .subscribe((types) => {
        if (!types) {
          return;
        }
        this.types.set(types);
        if (types.length > 0) {
          this.select(types[0].formatType);
        }
      });
  }

  /** Hay cambios en pantalla que no han llegado al servidor. */
  hasUnsavedChanges(): boolean {
    return this.dirty();
  }

  /** Lo que lee quien intenta salir con cambios sin guardar. */
  unsavedWarning() {
    return {
      message: `Tienes cambios sin guardar en ${this.currentLabel()}.`,
      detail:
        'Si sales ahora se pierden. Guardar el borrador no publica nada: deja el trabajo a salvo para seguir luego.',
      confirmLabel: 'Salir sin guardar',
    };
  }

  /** Nombre del tipo abierto, para nombrarlo en los avisos. */
  private currentLabel(): string {
    return (
      this.types().find((type) => type.formatType === this.formatType())?.label ??
      'este formato'
    );
  }

  /**
   * Cerrar la pestaña o recargar con cambios sin guardar.
   *
   * El guardia de ruta cubre la navegación dentro del panel, pero no un F5 ni
   * una pestaña que se cierra, que es justo cuando más se pierde.
   */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.dirty()) {
      event.preventDefault();
    }
  }

  /**
   * Cambiar de tipo desde el desplegable.
   *
   * Antes llamaba directamente a `select()`, que reinicia el borrador con lo
   * que devuelve el servidor: una tarde de trabajo sin guardar desaparecía sin
   * un aviso y sin forma de recuperarla.
   */
  requestType(formatType: string) {
    if (!formatType || formatType === this.formatType()) {
      return;
    }
    if (!this.dirty()) {
      this.select(formatType);
      return;
    }

    const previous = this.formatType();
    const label = this.currentLabel();
    this.confirmation.show(
      `Tienes cambios sin guardar en ${label}.`,
      () => this.select(formatType),
      {
        detail:
          'Si abres otro formato se pierden. Guarda el borrador antes si quieres conservarlos.',
        confirmLabel: 'Descartar y abrir',
        cancelLabel: 'Seguir aquí',
        danger: true,
        onCancel: () => this.restoreTypeSelect(previous),
      }
    );
  }

  /** Devuelve el desplegable al tipo que sigue abierto. */
  private restoreTypeSelect(formatType: string) {
    const select = this.typeSelect()?.nativeElement;
    if (select) {
      select.value = formatType;
    }
  }

  /** Nombre legible de un tipo de bloque, para no enseñar el del modelo. */
  sectionKindLabel(kind: string): string {
    const labels: Record<string, string> = {
      header: 'Cabecera',
      fields: 'Campos',
      checklist: 'Lista de verificación',
      table: 'Lista de personal',
      rows: 'Bloque de filas',
      signatures: 'Firmas',
    };
    return labels[kind] ?? kind;
  }

  /**
   * Carga un tipo de formato.
   *
   * `keepMessage` lo usan publicar y revertir, que recargan para traer la
   * versión nueva: sin él, el aviso se borraba a sí mismo una línea después.
   */
  select(formatType: string, keepMessage = false) {
    this.formatType.set(formatType);
    this.hasDraft.set(
      this.types().find((type) => type.formatType === formatType)?.hasDraft ?? false
    );
    this.loading.set(true);
    this.error.set('');
    if (!keepMessage) {
      this.message.set('');
    }
    this.dirty.set(false);

    this.formats
      .getDefinition(formatType)
      .pipe(
        catchError(() => {
          this.error.set(
            'No se pudo cargar el formato. Revisa tu conexión y vuelve a intentarlo; no se ha perdido nada.'
          );
          return of(null);
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe((response) => {
        if (!response) {
          return;
        }
        this.draft.set(response.draft);
        this.issues.set(response.issues);
        this.staleDraft.set(response.staleDraft ?? null);
        // Un borrador atrasado tambien es un borrador: cuenta para el historial.
        if (response.staleDraft) {
          this.hasDraft.set(true);
        }
        // Se conserva el documento abierto si sigue existiendo: al publicar o
        // revertir, volver siempre al primero pierde el sitio.
        const open = this.openDocument();
        const exists = response.draft.documents.some((document) => document.id === open);
        this.openDocument.set(exists ? open : response.draft.documents[0]?.id ?? '');
      });

    this.refreshVersions();
  }

  /**
   * Vuelve a pedir el historial.
   *
   * Publicar y restaurar añaden una entrada, y `select()` corre en paralelo con
   * la carga de la definición: sin esto el panel seguía enseñando la lista de
   * antes de publicar hasta que se cambiaba de tipo y se volvía.
   */
  private refreshVersions() {
    this.versionsError.set(false);
    this.formats
      .listVersions(this.formatType())
      .pipe(
        catchError(() => {
          // Sin esto, el panel decía "todavía no se ha publicado nunca" cuando
          // lo que había pasado es que la petición falló.
          this.versionsError.set(true);
          return of([]);
        })
      )
      .subscribe((versions) => this.versions.set(versions));
  }

  // --- edición ---------------------------------------------------------------

  private edit(change: (definition: IFormatDefinition) => void) {
    const current = this.draft();
    if (!current) {
      return;
    }
    const copy: IFormatDefinition = JSON.parse(JSON.stringify(current));
    change(copy);
    this.draft.set(copy);
    this.dirty.set(true);
    this.message.set('');
  }

  private withDocument(change: (document: IDocumentDefinition) => void) {
    this.edit((definition) => {
      const document = definition.documents.find((d) => d.id === this.openDocument());
      if (document) {
        change(document);
      }
    });
  }

  /** Sustituye el documento con lo que devuelve el constructor. */
  replaceDocument(documentId: string, updated: IDocumentDefinition) {
    this.edit((definition) => {
      const index = definition.documents.findIndex((document) => document.id === documentId);
      if (index >= 0) {
        definition.documents[index] = updated;
      }
    });
  }

  // --- bloques ---------------------------------------------------------------

  /**
   * Bloque nuevo con lo mínimo para que valide.
   *
   * Un bloque vacío no se puede publicar, así que se crea ya con un elemento:
   * es preferible a dejar al usuario delante de algo que no puede guardar sin
   * adivinar qué le falta.
   */
  private blankSection(kind: string, id: string): ISectionDefinition {
    const base = { id, title: 'Nuevo bloque', visible: true };
    switch (kind) {
      case 'fields':
        return {
          ...base, kind, columns: 1,
          fields: [{ id: `${id}-f1`, label: 'Nuevo campo', source: 'literal', literal: '' }],
        } as ISectionDefinition;
      case 'checklist':
        return {
          ...base, kind, columns: 2, items: [{ id: `${id}-i1`, label: 'Nuevo elemento' }],
        } as ISectionDefinition;
      case 'table':
        return {
          ...base, kind, rowsPerPage: 20, minRows: 0,
          columns: [
            { id: `${id}-c1`, label: 'N°', source: 'numero', widthMm: 10, align: 'center' },
            { id: `${id}-c2`, label: 'Nombre', source: 'nombre', widthMm: 80 },
          ],
        } as ISectionDefinition;
      case 'signatures':
        return {
          ...base, kind, columns: 2, slots: [{ id: `${id}-s1`, label: 'Nombre y firma' }],
        } as ISectionDefinition;
      case 'rows':
        // Una fila partida en dos, que es como nace un bloque en el
        // constructor. Vacía no se podría publicar: el validador exige que
        // toda fila tenga columnas y que sumen 100.
        return {
          ...base, kind,
          rows: [{
            id: `${id}-f1`,
            cells: [
              { id: `${id}-f1-a`, width: 50, content: { kind: 'blank' } },
              { id: `${id}-f1-b`, width: 50, content: { kind: 'blank' } },
            ],
          }],
        } as ISectionDefinition;
      default:
        return { ...base, kind: 'header', fields: [] } as ISectionDefinition;
    }
  }

  addSection(kind: string) {
    if (!kind) {
      return;
    }
    this.withDocument((document) => {
      const id = `${kind}-${Date.now().toString(36)}`;
      document.sections.push(this.blankSection(kind, id));
    });
  }

  /** Carga el borrador atrasado tal como se guardo. */
  recoverDraft() {
    const formatType = this.formatType();
    if (!formatType) {
      return;
    }
    this.loading.set(true);
    this.formats.recoverDraft(formatType).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.draft.set(response.draft);
        this.issues.set(response.issues);
        this.staleDraft.set(null);
        this.dirty.set(true);
        this.hasDraft.set(true);
        this.message.set(
          'Borrador recuperado. Revísalo antes de publicar: salió de una versión anterior.'
        );
      },
      error: () => {
        this.loading.set(false);
        this.error.set(
          'No se pudo cargar el borrador atrasado. Sigue guardado: vuelve a intentarlo.'
        );
      },
    });
  }

  // --- numeración ------------------------------------------------------------

  setNumberingKind(kind: string) {
    this.withDocument((document) => {
      switch (kind) {
        case 'own':
          document.numbering = {
            kind: 'own',
            series: {
              id: document.id,
              prefix: document.id.slice(0, 3).toUpperCase(),
              scope: 'year',
              pad: 4,
            },
          };
          break;
        case 'inherit':
          document.numbering = { kind: 'inherit', from: '' };
          break;
        case 'namedCode':
          document.numbering = { kind: 'namedCode' };
          break;
        default:
          document.numbering = { kind: 'none' };
      }
    });
  }

  setSeries(field: 'id' | 'prefix' | 'pad' | 'scope', value: string) {
    this.withDocument((document) => {
      if (document.numbering?.kind !== 'own') {
        return;
      }
      const series = document.numbering.series;
      if (field === 'pad') {
        series.pad = Number(value) || 1;
      } else if (field === 'scope') {
        series.scope = value === 'global' ? 'global' : 'year';
      } else {
        series[field] = value;
      }
    });
  }

  setInheritFrom(from: string) {
    this.withDocument((document) => {
      if (document.numbering?.kind === 'inherit') {
        document.numbering.from = from;
      }
    });
  }

  /** Cómo quedará el número, sin llegar a pedirlo. */
  numberPreview(document: IDocumentDefinition): string {
    const numbering = document.numbering;
    if (!numbering || numbering.kind === 'none') {
      return 'sin número';
    }
    if (numbering.kind === 'namedCode') {
      return 'el código de nombrada';
    }
    if (numbering.kind === 'inherit') {
      return numbering.from ? `el mismo que "${numbering.from}"` : 'sin origen';
    }
    const { prefix, scope, pad } = numbering.series;
    const year = scope === 'year' ? `-${new Date().getFullYear()}` : '';
    return `${prefix}${year}-${'1'.padStart(pad, '0')}`;
  }

  /**
   * Dónde está lo que impide publicar, con los nombres de la pantalla.
   *
   * El servidor manda la ruta del modelo —`documents[0].sections[3].rows[2]`—
   * y la lista solo pintaba el mensaje: "la fila no tiene columnas" en un
   * formato de cuatro documentos y treinta bloques no dice dónde mirar. Esto lo
   * traduce a "ATS › SECCIÓN I › fila 3".
   */
  issueLocation(path: string): string {
    const definition = this.draft();
    if (!definition || !path) {
      return '';
    }

    const parts: string[] = [];
    let document: IDocumentDefinition | undefined;
    let section: ISectionDefinition | undefined;

    for (const step of path.split('.')) {
      const open = step.indexOf('[');
      if (open < 0) {
        continue;
      }
      const name = step.slice(0, open);
      const index = Number(step.slice(open + 1, -1));
      if (Number.isNaN(index)) {
        continue;
      }

      switch (name) {
        case 'documents':
          document = definition.documents[index];
          parts.push(document?.label || document?.name || `documento ${index + 1}`);
          break;
        case 'sections':
          section = document?.sections[index];
          parts.push(
            section?.title || this.sectionKindLabel(section?.kind ?? '') || `bloque ${index + 1}`
          );
          break;
        case 'rows':
          parts.push(`fila ${index + 1}`);
          break;
        case 'cells':
          parts.push(`columna ${index + 1}`);
          break;
        case 'fields':
          parts.push(`campo ${index + 1}`);
          break;
        case 'items':
          parts.push(`elemento ${index + 1}`);
          break;
        case 'columns':
          parts.push(`columna ${index + 1}`);
          break;
        case 'slots':
          parts.push(`firma ${index + 1}`);
          break;
      }
    }

    return parts.join(' › ');
  }

  /** Abre el documento donde está el problema, para poder arreglarlo. */
  openIssue(path: string) {
    const index = this.documentIndexOf(path);
    const document = index === null ? null : this.draft()?.documents[index];
    if (document) {
      this.openDocument.set(document.id);
    }
  }

  private documentIndexOf(path: string): number | null {
    const step = path.split('.')[0] ?? '';
    if (!step.startsWith('documents[')) {
      return null;
    }
    const index = Number(step.slice('documents['.length, -1));
    return Number.isNaN(index) ? null : index;
  }

  // --- guardar y publicar ----------------------------------------------------

  /**
   * Guarda el borrador.
   *
   * `afterSave` lo usa publicar, que necesita que lo de la pantalla haya
   * llegado al servidor antes de emitir una versión.
   */
  save(afterSave?: () => void) {
    const definition = this.draft();
    if (!definition) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.formats
      .saveDraft(this.formatType(), definition)
      .pipe(
        catchError(() => {
          this.error.set(
            'No se pudo guardar el borrador. Lo editado sigue en pantalla: vuelve a intentarlo.'
          );
          return of(null);
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe((response) => {
        if (!response) {
          return;
        }
        this.issues.set(response.issues);
        this.dirty.set(false);
        this.hasDraft.set(true);
        this.message.set('Borrador guardado.');
        if (afterSave) {
          afterSave();
        }
      });
  }

  /**
   * Publica el borrador.
   *
   * Lo que se publica es el borrador **del servidor**. Con cambios sin guardar
   * en pantalla, publicar emitía la versión anterior sin decirlo: se firmaba un
   * documento que no era el que se estaba viendo. Ahora se guarda primero.
   */
  publish() {
    if (this.dirty()) {
      this.save(() => {
        if (this.issues().length > 0) {
          this.error.set(
            'Se guardó el borrador, pero la definición todavía tiene errores y no se puede publicar. Revisa la lista de abajo.'
          );
          return;
        }
        this.publishSaved();
      });
      return;
    }
    this.publishSaved();
  }

  private publishSaved() {
    this.loading.set(true);
    this.error.set('');
    this.formats
      .publish(this.formatType())
      .pipe(
        catchError((failure) => {
          const issues = failure?.error?.issues as IValidationIssue[] | undefined;
          if (issues) {
            this.issues.set(issues);
          }
          this.error.set(
            issues
              ? 'La definición tiene errores y no se puede publicar. Corrígelos y vuelve a intentarlo.'
              : 'No se pudo publicar. No se ha emitido ninguna versión nueva: vuelve a intentarlo.'
          );
          return of(null);
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe((definition) => {
        if (!definition) {
          return;
        }
        this.hasDraft.set(false);
        this.message.set(`Publicada la versión ${definition.version}.`);
        this.select(this.formatType(), true);
        this.refreshVersions();
      });
  }

  /**
   * Tira el borrador y vuelve a lo publicado.
   *
   * Un borrador puede llevar horas dentro y esto no se puede deshacer, así que
   * se pregunta antes: iba suelto en el desplegable de Ajustes, a un clic de
   * "Restaurar de fábrica".
   */
  discard() {
    this.confirmation.show(
      '¿Descartar el borrador?',
      () => this.discardConfirmed(),
      {
        detail:
          'Se pierde todo lo editado desde la última publicación y no se puede deshacer. La versión publicada no se toca.',
        confirmLabel: 'Descartar el borrador',
        cancelLabel: 'Conservarlo',
        danger: true,
      }
    );
  }

  private discardConfirmed() {
    this.loading.set(true);
    this.error.set('');
    this.formats
      .discardDraft(this.formatType())
      .pipe(
        catchError(() => {
          this.error.set('No se pudo descartar el borrador. Sigue guardado tal como estaba.');
          return of(null);
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe((definition) => {
        if (!definition) {
          return;
        }
        this.hasDraft.set(false);
        this.staleDraft.set(null);
        this.select(this.formatType(), true);
        this.message.set('Borrador descartado. Estás viendo la versión publicada.');
      });
  }

  /**
   * Rehace la definición desde las plantillas del cliente.
   *
   * Un despliegue actualiza por su cuenta las definiciones de fábrica que nadie
   * ha tocado. Esto hace falta cuando alguien ya publicó una propia.
   */
  restoreFactory() {
    this.confirmation.show(
      '¿Rehacer el formato desde las plantillas del cliente?',
      () => this.restoreFactoryConfirmed(),
      {
        detail:
          'Se publica una versión nueva con la definición de fábrica y se pierde lo que hubiera en el borrador. Las versiones anteriores siguen en el historial.',
        confirmLabel: 'Restaurar de fábrica',
        cancelLabel: 'Cancelar',
        danger: true,
      }
    );
  }

  private restoreFactoryConfirmed() {
    this.loading.set(true);
    this.error.set('');
    this.formats
      .restoreFactory(this.formatType())
      .pipe(
        catchError(() => {
          this.error.set('No se pudo restaurar la definición de fábrica.');
          return of(null);
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe((definition) => {
        if (!definition) {
          return;
        }
        this.hasDraft.set(false);
        this.message.set(
          `Restaurada de fábrica como versión ${definition.version}. La anterior sigue en el historial.`
        );
        this.select(this.formatType(), true);
        this.refreshVersions();
      });
  }

  /**
   * Carga una versión publicada en el borrador.
   *
   * Pisa el borrador actual, que puede ser lo que alguien lleva editando toda
   * la mañana: por eso se avisa cuando hay algo que perder.
   */
  revert(version: number) {
    const run = () => this.revertConfirmed(version);
    if (!this.dirty() && !this.hasDraft()) {
      run();
      return;
    }
    this.confirmation.show(
      `¿Cargar la versión ${version} en el borrador?`,
      run,
      {
        detail:
          'Reemplaza el borrador actual, con lo que lleve editado desde la última publicación.',
        confirmLabel: `Cargar la versión ${version}`,
        cancelLabel: 'Cancelar',
        danger: true,
      }
    );
  }

  private revertConfirmed(version: number) {
    this.loading.set(true);
    this.error.set('');
    this.formats
      .revertTo(this.formatType(), version)
      .pipe(
        catchError(() => {
          this.error.set(
            `No se pudo cargar la versión ${version}. El borrador sigue como estaba.`
          );
          return of(null);
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe((definition) => {
        if (!definition) {
          return;
        }
        this.hasDraft.set(true);
        this.historyOpen.set(false);
        this.message.set(`Versión ${version} cargada en el borrador. Revísala antes de publicar.`);
        this.select(this.formatType(), true);
      });
  }
}
