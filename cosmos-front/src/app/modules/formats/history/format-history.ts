import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, Observable, of } from 'rxjs';
import { FormatsService } from '../services/formats.service';
import {
  ChangeKind,
  IDefinitionChange,
  IDefinitionDiff,
  IDefinitionVersion,
} from '../interfaces/format-document.interface';

/** Una entrada del historial: una publicación, o el borrador en curso. */
interface HistoryEntry {
  /** Clave con la que se guardan sus cambios. `draft` para el borrador. */
  key: string
  /** `null` en el borrador: todavía no tiene número. */
  version: number | null
  label: string
  publishedBy?: string
  publishedAt?: string
  draft: boolean
}

/** Los cambios de una entrada, con su estado de carga. */
interface EntryChanges {
  loading: boolean
  error: boolean
  diff: IDefinitionDiff | null
}

/**
 * Una entrada ya resuelta para pintar: sus cambios, su resumen y su estado.
 *
 * Se calcula una vez por render en `view()` en lugar de llamar a métodos desde
 * la plantilla. Filtrar cuatrocientos cambios dentro de un `@for` significa
 * rehacer el filtro en cada pasada de detección y por cada entrada abierta.
 */
interface EntryView extends HistoryEntry {
  open: boolean
  state: EntryChanges | null
  /** Cambios que pasan el filtro de búsqueda. */
  changes: IDefinitionChange[]
  /** `1 añadido · 3 modificados`, o vacío si aún no se han pedido. */
  summary: string
  /** Es el origen del historial: no hay nada anterior con que comparar. */
  origin: boolean
  truncated: boolean
}

/**
 * El historial del maestro de formatos.
 *
 * El historial ya estaba guardado —una copia entera de la definición por cada
 * publicación—, pero la pantalla solo lo usaba para revertir: una lista de seis
 * líneas metida dentro del desplegable de "Ajustes", con el número, la fecha y
 * un botón. Quién cambió qué, y sobre todo **qué** cambió, no se podía saber
 * sin comparar dos definiciones a mano.
 *
 * Aquí cada publicación se despliega y cuenta sus cambios respecto a la
 * anterior, con el nombre que las cosas tienen en el maestro: "Cabecera ·
 * etiqueta: N° ATS → N° de ATS", no rutas del modelo. La comparación la hace el
 * servidor, que es donde están las dos definiciones enteras; ver
 * `IDefinitionDiff`.
 *
 * El borrador sin publicar es la primera entrada. Es la parte del historial que
 * aún no ha ocurrido, y es donde más falta hace mirarla: publicar empieza a
 * emitir documentos que se firman y se auditan.
 */
@Component({
  selector: 'app-format-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './format-history.html',
  styleUrl: './format-history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormatHistory {
  private formats = inject(FormatsService);

  readonly formatType = input.required<string>();
  readonly versions = input.required<IDefinitionVersion[]>();
  /** Hay borrador **guardado**: se ofrece como entrada pendiente de publicar. */
  readonly hasDraft = input(false);
  /** El historial no se pudo traer. La lista vacía no significa lo mismo. */
  readonly loadError = input(false);

  readonly close = output<void>();
  readonly revert = output<number>();

  /** Cambios ya pedidos, por clave de entrada. */
  private readonly loaded = signal<Record<string, EntryChanges>>({});
  /** Entradas desplegadas. Los cambios se piden al abrir, no antes. */
  private readonly open = signal<ReadonlySet<string>>(new Set());

  /**
   * Contra qué se compara cada entrada.
   *
   * Por defecto contra la publicación inmediatamente anterior, que es la
   * pregunta normal. Elegir otra responde a "qué ha cambiado desde la versión
   * que firmé en marzo" sin abrir una por una.
   */
  readonly against = signal<number | null>(null);

  readonly search = signal('');

  private readonly entries = computed<HistoryEntry[]>(() => {
    const published = this.versions().map((version) => ({
      key: String(version.version),
      version: version.version,
      label: version.label,
      publishedBy: version.publishedBy,
      publishedAt: version.publishedAt,
      draft: false,
    }));
    if (!this.hasDraft()) {
      return published;
    }
    return [
      { key: 'draft', version: null, label: 'Borrador sin publicar', draft: true },
      ...published,
    ];
  });

  /** Lo que pinta la plantilla, ya resuelto. */
  readonly view = computed<EntryView[]>(() => {
    const loaded = this.loaded();
    const open = this.open();
    const term = this.search().trim().toLowerCase();

    return this.entries().map((entry) => {
      const state = loaded[entry.key] ?? null;
      const all = state?.diff?.changes ?? [];
      return {
        ...entry,
        open: open.has(entry.key),
        state,
        changes: term ? all.filter((change) => this.matches(change, term)) : all,
        summary: state?.diff ? this.summarize(state.diff) : '',
        origin: !!state?.diff && state.diff.from === null,
        truncated: !!state?.diff?.truncated,
      };
    });
  });

  /** Versiones que se pueden elegir como punto de comparación. */
  readonly comparable = computed(() => this.versions().map((version) => version.version));

  constructor() {
    // Cambiar de tipo de formato deja fuera lo cargado: los cambios de la v3 de
    // GRANEL no son los de la v3 de ETHANOL, y servir unos por otros sería peor
    // que no enseñar nada.
    effect(() => {
      this.formatType();
      this.loaded.set({});
      this.open.set(new Set());
      this.against.set(null);
    });
  }

  private matches(change: IDefinitionChange, term: string): boolean {
    return [change.target, change.detail, change.document, change.section]
      .filter((text): text is string => !!text)
      .some((text) => text.toLowerCase().includes(term));
  }

  /**
   * Resumen de una entrada en una línea, para leerlo sin desplegar.
   *
   * Solo se calcula cuando los cambios ya están pedidos: inventar un recuento
   * antes de tenerlo diría algo falso.
   */
  private summarize(diff: IDefinitionDiff): string {
    const { added, removed, changed, moved } = diff.summary;
    const parts: string[] = [];
    if (added) parts.push(`${added} añadido${added === 1 ? '' : 's'}`);
    if (removed) parts.push(`${removed} eliminado${removed === 1 ? '' : 's'}`);
    if (changed) parts.push(`${changed} modificado${changed === 1 ? '' : 's'}`);
    if (moved) parts.push(`${moved} movido${moved === 1 ? '' : 's'}`);
    return parts.length > 0 ? parts.join(' · ') : 'sin cambios';
  }

  toggle(entry: EntryView) {
    const next = new Set(this.open());
    if (next.has(entry.key)) {
      next.delete(entry.key);
      this.open.set(next);
      return;
    }
    next.add(entry.key);
    this.open.set(next);
    this.load(entry);
  }

  onAgainst(value: string) {
    this.against.set(value === '' ? null : Number(value));
    // Lo que esté abierto se vuelve a pedir: el punto de comparación cambió.
    for (const entry of this.view()) {
      if (entry.open) {
        this.load(entry, true);
      }
    }
  }

  private load(entry: HistoryEntry, force = false) {
    const current = this.loaded()[entry.key];
    if (!force && current && !current.error) {
      return;
    }
    this.setChanges(entry.key, { loading: true, error: false, diff: null });

    const against = this.against();
    const request: Observable<IDefinitionDiff> = entry.draft
      ? this.formats.getDraftChanges(this.formatType())
      : this.formats.getVersionChanges(
        this.formatType(),
        entry.version!,
        // Compararse contra sí misma no dice nada: se cae a la anterior.
        against !== null && against !== entry.version ? against : undefined
      );

    request.pipe(catchError(() => of(null))).subscribe((diff) => {
      this.setChanges(
        entry.key,
        diff
          ? { loading: false, error: false, diff }
          : { loading: false, error: true, diff: null }
      );
    });
  }

  private setChanges(key: string, value: EntryChanges) {
    this.loaded.update((current) => ({ ...current, [key]: value }));
  }

  kindLabel(kind: ChangeKind): string {
    const labels: Record<ChangeKind, string> = {
      added: 'Añadido',
      removed: 'Eliminado',
      moved: 'Movido',
      changed: 'Modificado',
    };
    return labels[kind];
  }
}
