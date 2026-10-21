import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IBlockCell,
  IBlockRow,
  IDocumentDefinition,
  ISectionDefinition,
} from '../interfaces/format-document.interface';
import { assetsOrigin } from '../format-document/format-document';
import { DATA_FIELDS, DataField, groupedFields, labelFor } from './data-fields';
import { BuilderHistory } from './builder-history';

/** Qué hay seleccionado. */
export interface Selection {
  sectionId: string;
  rowId?: string;
  cellId?: string;
}

/**
 * El constructor de formatos.
 *
 * Un documento es una lista de **secciones**, cada sección una lista de
 * **filas**, y cada fila un reparto en **columnas**. Se construye añadiendo
 * filas y partiéndolas, como en cualquier editor por bloques. No hay retícula
 * previa ni coordenadas: la posición de una casilla la da su sitio en la fila.
 *
 * Es el cambio de fondo respecto a la versión anterior, que reproducía la
 * rejilla de Excel y colocaba el contenido encima. Aquello obligaba a pensar en
 * `fila`, `columna` y `colSpan` para mover algo, y añadir en medio no tenía
 * sentido. Las hojas del cliente siguen siendo la referencia de la que salen el
 * orden y el contenido; lo que no sale de ellas es su rejilla.
 */
@Component({
  selector: 'app-format-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './format-builder.html',
  styleUrl: './format-builder.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormatBuilder implements OnChanges {
  @Input({ required: true }) document!: IDocumentDefinition;
  /**
   * Qué se está editando, para saber cuándo empezar de cero.
   *
   * No basta con mirar si el objeto cambió: el maestro guarda la definición
   * entera y copia en profundidad en cada cambio, así que devuelve un objeto
   * nuevo cada vez, incluido el que acaba de salir de aquí. Reiniciar con cada
   * uno borraba el historial a cada tecla y dejaba deshacer inservible.
   *
   * Con una clave estable —el tipo de formato y el documento— se distingue
   * "otro documento" de "el mismo documento con un cambio".
   */
  @Input() documentKey = '';
  @Output() documentChange = new EventEmitter<IDocumentDefinition>();

  private loadedKey: string | null = null;

  /**
   * Los cambios de entrada se atienden juntos y no con un `set` por propiedad:
   * la clave y el documento llegan en la misma pasada, y por separado la clave
   * podía leerse todavía sin asignar en la primera.
   */
  ngOnChanges(changes: SimpleChanges) {
    if (!this.document) {
      return;
    }
    const key = this.documentKey || this.document.id;
    if (key !== this.loadedKey) {
      this.loadedKey = key;
      this.model.set(this.document);
      this.history.reset(this.document);
      this.selection.set(null);
      return;
    }
    if (changes['document']) {
      this.model.set(this.document);
      // Lo que cambió fuera (un bloque añadido desde Ajustes, por ejemplo)
      // también se deshace. Si es el eco de un cambio de aquí, el historial lo
      // descarta por sí solo: guarda el estado y ya lo tiene.
      this.history.push(this.document);
    }
  }

  readonly model = signal<IDocumentDefinition | null>(null);
  readonly selection = signal<Selection | null>(null);
  readonly dragging = signal<DataField | null>(null);
  readonly hoverTarget = signal('');
  readonly search = signal('');
  readonly zoom = signal(Preferencias.leerNumero(Preferencias.ZOOM, 1));

  /**
   * Los dos paneles laterales, plegables.
   *
   * La rejilla era fija —220 px de datos, 260 de detalles— y ninguno se podia
   * cerrar: en un portatil de 1366 px el documento se quedaba con poco mas de
   * la mitad de la pantalla, que es justo lo que la observacion pedia mirar de
   * cerca. Con los dos cerrados pasa a algo mas del 90%.
   */
  readonly datosAbierto = signal(Preferencias.leerBooleano(Preferencias.DATOS, true));
  readonly detallesAbierto = signal(Preferencias.leerBooleano(Preferencias.DETALLES, true));

  private readonly lienzoRef = viewChild<ElementRef<HTMLElement>>('lienzo');
  private readonly hojaRef = viewChild<ElementRef<HTMLElement>>('hoja');
  /** El grupo de datos desplegado. Solo uno a la vez. */
  readonly openGroup = signal(groupedFields()[0]?.group ?? '');

  private readonly history = new BuilderHistory<IDocumentDefinition>();
  readonly groups = groupedFields();
  readonly allFields = DATA_FIELDS;

  togglePanelDatos() {
    this.datosAbierto.set(!this.datosAbierto());
    Preferencias.guardar(Preferencias.DATOS, String(this.datosAbierto()));
    // Plegar ensancha el sitio del documento: si la escala la decidia el
    // ajuste, se rehace con el ancho nuevo.
    if (this.ajustado) {
      this.ajustarAlAncho();
    }
  }

  togglePanelDetalles() {
    this.detallesAbierto.set(!this.detallesAbierto());
    Preferencias.guardar(Preferencias.DETALLES, String(this.detallesAbierto()));
    if (this.ajustado) {
      this.ajustarAlAncho();
    }
  }

  /**
   * Ventana estrecha (CKI10). A unos 760 px, con los dos paneles abiertos, al
   * documento le quedaban poco mas de 300 px y la hoja pedia desplazamiento
   * horizontal incluso al zoom minimo. Al entrar en ese ancho los paneles se
   * pliegan solos y la hoja se ajusta; siguen pudiendo abrirse con su boton.
   * La preferencia guardada no se toca: al volver a una ventana ancha se
   * recupera tal cual.
   *
   * Se mide el propio constructor, no la ventana: a 1024 px con el menu
   * lateral abierto la ventana contaba como ancha y al documento le quedaban
   * 277 px. 900 px de constructor es lo que quedaba antes a una ventana de
   * 1024 sin menu.
   */
  static readonly ANCHO_ESTRECHO = 900;
  private estrecho = false;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly primerPintado = afterNextRender(() => {
    this.revisarAncho();
    // Plegar el menu lateral cambia el hueco sin cambiar la ventana.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => this.onResize());
    observer.observe(this.host.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  });

  private revisarAncho() {
    const ancho = this.host.nativeElement.clientWidth || window.innerWidth;
    const estrecho = ancho < FormatBuilder.ANCHO_ESTRECHO;
    if (estrecho === this.estrecho) {
      return;
    }
    this.estrecho = estrecho;
    if (estrecho) {
      this.datosAbierto.set(false);
      this.detallesAbierto.set(false);
      this.ajustarAlAncho();
    } else {
      this.datosAbierto.set(Preferencias.leerBooleano(Preferencias.DATOS, true));
      this.detallesAbierto.set(Preferencias.leerBooleano(Preferencias.DETALLES, true));
      if (this.ajustado) {
        this.ajustarAlAncho();
      }
    }
  }

  /** `true` mientras la escala la decida "Ajustar al ancho" y no la barra. */
  private ajustado = Preferencias.leerBooleano(Preferencias.AJUSTADO, false);

  cambiarZoom(valor: number) {
    this.zoom.set(valor);
    Preferencias.guardar(Preferencias.ZOOM, String(valor));
  }

  /** Mover la barra a mano desactiva el ajuste automatico. */
  zoomManual(valor: number) {
    this.ajustado = false;
    Preferencias.guardar(Preferencias.AJUSTADO, 'false');
    this.cambiarZoom(valor);
  }

  /**
   * Escala la hoja para que ocupe el ancho disponible.
   *
   * El detalle que importa: la hoja se escala con `zoom`, no con `transform`.
   * Con `zoom`, `getBoundingClientRect()` ya devuelve la medida escalada, asi
   * que calcular a partir de ahi se realimenta y la escala nunca converge.
   * `offsetWidth` devuelve el ancho de maquetacion sin escalar, que es la
   * referencia estable.
   *
   * Se aplaza un cuadro porque tras plegar un panel la rejilla todavia no se ha
   * rehecho y el ancho que se leeria seria el de antes.
   */
  ajustarAlAncho() {
    this.ajustado = true;
    Preferencias.guardar(Preferencias.AJUSTADO, 'true');
    requestAnimationFrame(() => {
      const lienzo = this.lienzoRef()?.nativeElement;
      const hoja = this.hojaRef()?.nativeElement;
      if (!lienzo || !hoja || hoja.offsetWidth === 0) {
        return;
      }
      const MARGEN = 32; // el `padding` del lienzo, a los dos lados
      const escala = (lienzo.clientWidth - MARGEN) / hoja.offsetWidth;
      // Dentro de los topes del control: por debajo de 0.6 no se lee y por
      // encima de 1.6 no cabe ni una fila entera.
      this.cambiarZoom(Math.min(1.6, Math.max(0.6, Math.round(escala * 100) / 100)));
    });
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  get sections(): ISectionDefinition[] {
    return this.model()?.sections ?? [];
  }

  /**
   * Si un grupo de datos esta desplegado.
   *
   * Buscando se despliegan todos: quien escribe en el buscador quiere ver lo
   * que coincide, no acordarse de en que grupo estaba.
   */
  isGroupOpen(group: string): boolean {
    return !!this.search().trim() || this.openGroup() === group;
  }

  /** Abre un grupo y cierra el anterior; volver a pulsarlo lo cierra. */
  toggleGroup(group: string) {
    this.openGroup.update((current) => (current === group ? '' : group));
  }

  filteredGroups() {
    const term = this.search().trim().toLowerCase();
    if (!term) {
      return this.groups;
    }
    return this.groups
      .map((group) => ({
        group: group.group,
        fields: group.fields.filter((field) => field.label.toLowerCase().includes(term)),
      }))
      .filter((group) => group.fields.length > 0);
  }

  // --- cambios ----------------------------------------------------------------

  private edit(apply: (document: IDocumentDefinition) => void) {
    const current = this.model();
    if (!current) {
      return;
    }
    const before = JSON.stringify(current);
    const copy: IDocumentDefinition = JSON.parse(before);
    apply(copy);
    // Varias acciones no llegan a cambiar nada: mover la primera fila hacia
    // arriba, eliminar la única columna de una fila. Emitirlas igualmente
    // encendía el aviso de "sin guardar" y ofrecía deshacer un paso que no
    // existe.
    if (JSON.stringify(copy) === before) {
      return;
    }
    this.model.set(copy);
    this.history.push(copy);
    this.documentChange.emit(copy);
  }

  private sectionOf(document: IDocumentDefinition, sectionId: string) {
    return document.sections.find((section) => section.id === sectionId);
  }

  private rowOf(document: IDocumentDefinition, sectionId: string, rowId: string) {
    return this.sectionOf(document, sectionId)?.rows?.find((row) => row.id === rowId);
  }

  undo() {
    const previous = this.history.undo();
    if (previous) {
      this.model.set(previous);
      this.documentChange.emit(previous);
    }
  }

  redo() {
    const next = this.history.redo();
    if (next) {
      this.model.set(next);
      this.documentChange.emit(next);
    }
  }

  /**
   * Al cambiar el tamano de la ventana, la escala ajustada deja de ajustar.
   *
   * Solo se rehace si el usuario la habia pedido: quien puso el zoom a mano no
   * quiere que se lo muevan por redimensionar.
   */
  @HostListener('window:resize')
  onResize() {
    const antes = this.estrecho;
    this.revisarAncho();
    if (antes !== this.estrecho) {
      return;
    }
    if (this.ajustado) {
      this.ajustarAlAncho();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    const writing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) ||
      target?.isContentEditable;

    // Escribiendo en un campo, Ctrl+Z es del campo. Deshacer el documento
    // entero mientras se corrige una palabra tira todo lo escrito antes y no
    // hay forma de recuperar la palabra a medias.
    if (!writing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
      return;
    }
    // La tecla X marca: en el permiso hay decenas de `SI` que marcar seguidos.
    if (!writing && !event.ctrlKey && !event.metaKey && !event.altKey &&
      event.key.toLowerCase() === 'x' && this.canMark(this.selectedCell())) {
      event.preventDefault();
      this.toggleMark();
      return;
    }
    if (!writing && event.key === 'Delete' && this.selectedCell()) {
      event.preventDefault();
      this.clearCell();
    }
    if (event.key === 'Escape') {
      this.selection.set(null);
    }
  }

  // --- selección --------------------------------------------------------------

  selectCell(sectionId: string, rowId: string, cellId: string) {
    const current = this.selection();
    if (current?.cellId === cellId) {
      this.selection.set(null);
      return;
    }
    this.selection.set({ sectionId, rowId, cellId });
  }

  selectSection(sectionId: string) {
    const current = this.selection();
    this.selection.set(
      current?.sectionId === sectionId && !current.cellId ? null : { sectionId }
    );
  }

  isCellSelected(cellId: string): boolean {
    return this.selection()?.cellId === cellId;
  }

  isSectionSelected(sectionId: string): boolean {
    const current = this.selection();
    return current?.sectionId === sectionId && !current.cellId;
  }

  selectedCell(): IBlockCell | null {
    const current = this.selection();
    const document = this.model();
    if (!current?.rowId || !current.cellId || !document) {
      return null;
    }
    return this.rowOf(document, current.sectionId, current.rowId)
      ?.cells.find((cell) => cell.id === current.cellId) ?? null;
  }

  selectedSection(): ISectionDefinition | null {
    const current = this.selection();
    const document = this.model();
    return current && document ? this.sectionOf(document, current.sectionId) ?? null : null;
  }

  private patchCell(patch: (cell: IBlockCell) => void) {
    const current = this.selection();
    if (!current?.rowId || !current.cellId) {
      return;
    }
    this.edit((document) => {
      const cell = this.rowOf(document, current.sectionId, current.rowId as string)
        ?.cells.find((entry) => entry.id === current.cellId);
      if (cell) {
        patch(cell);
      }
    });
  }

  // --- contenido de una casilla ------------------------------------------------

  /** Lo que se ve escrito en una casilla, sea texto o el pie de una imagen. */
  textOf(cell: IBlockCell | null): string {
    if (!cell) {
      return '';
    }
    const content = cell.content;
    if (content.kind === 'text') {
      return content.text;
    }
    if (content.kind === 'image') {
      return content.text ?? '';
    }
    return '';
  }

  /** Nombre humano de lo que imprime una casilla, o cadena vacía. */
  dataLabel(cell: IBlockCell | null): string {
    const content = cell?.content;
    if (content?.kind === 'data') {
      return labelFor(content.source, content.transform);
    }
    if (content?.kind === 'signature') {
      return labelFor(content.source, undefined, true);
    }
    return '';
  }

  /** Si la casilla imprime un dato de la jornada, sea texto o firma. */
  isBound(cell: IBlockCell | null): boolean {
    const kind = cell?.content?.kind;
    return kind === 'data' || kind === 'signature';
  }

  /**
   * De qué depende una casilla que se marca sola, o cadena vacía.
   *
   * Sin esto una casilla automática se ve igual que una de rellenar a mano, y
   * quien edita el formato no tiene forma de saber que al cambiarla rompe la
   * marca. Las tres jornadas de la hoja de asistencia son de este tipo.
   */
  checkHint(cell: IBlockCell | null): string {
    const content = cell?.content;
    if (content?.kind !== 'check' || !content.when) {
      return '';
    }
    const field = labelFor(content.when.source, content.when.transform);
    return `Se marca sola cuando ${field} es ${content.when.equals}.`;
  }

  setText(value: string) {
    this.patchCell((cell) => {
      if (cell.content.kind === 'image') {
        cell.content.text = value;
        return;
      }
      // Escribir en una casilla vacía la convierte en texto, que es lo que
      // espera cualquiera al ponerse a escribir encima. Corregir el rótulo de
      // una casilla marcada no le quita la marca.
      const marked = cell.content.kind === 'text' && cell.content.marked;
      cell.content = value
        ? { kind: 'text', text: value, ...(marked ? { marked: true } : {}) }
        : { kind: 'blank' };
    });
  }

  // --- marcas -------------------------------------------------------------------

  /**
   * Si la casilla sale marcada con una X en el documento.
   *
   * Vale para un texto (`SI`, `NA`, `TRABAJO EN ALTURA (   )`) y para una
   * casilla para marcar. Los datos, las firmas y las imágenes no se marcan.
   */
  isMarked(cell: IBlockCell | null): boolean {
    const content = cell?.content;
    if (content?.kind === 'text') {
      return !!content.marked;
    }
    return content?.kind === 'check' && !!content.checked;
  }

  /**
   * Si se le puede poner o quitar la marca a mano.
   *
   * Una casilla que se marca sola no: la decide la jornada, y una marca fija
   * encima diría lo contrario que su condición.
   */
  canMark(cell: IBlockCell | null): boolean {
    const content = cell?.content;
    if (!content) {
      return false;
    }
    if (content.kind === 'check') {
      return !content.when;
    }
    return content.kind === 'text' || content.kind === 'blank';
  }

  /** Lo que se ve en el lienzo para un texto marcado, igual que lo imprime el back. */
  markedText(text: string): string {
    const hueco = /\(\s*\)/;
    return hueco.test(text) ? text.replace(hueco, '( X )') : `X ${text.trim()}`;
  }

  /**
   * Pone o quita la X.
   *
   * Un recuadro vacío pasa a ser una casilla marcada: es la "X dentro del
   * recuadro". Un texto conserva su rótulo y se marca.
   */
  toggleMark() {
    this.patchCell((cell) => {
      const content = cell.content;
      if (content.kind === 'text') {
        if (content.marked) {
          delete content.marked;
        } else {
          content.marked = true;
        }
      } else if (content.kind === 'check' && !content.when) {
        if (content.checked) {
          delete content.checked;
        } else {
          content.checked = true;
        }
      } else if (content.kind === 'blank') {
        cell.content = { kind: 'check', checked: true };
        cell.align = 'center';
      }
    });
  }

  setKind(kind: string) {
    this.patchCell((cell) => {
      switch (kind) {
        case 'text':
          cell.content = {
            kind: 'text',
            text: this.textOf(cell),
            ...(this.isMarked(cell) ? { marked: true } : {}),
          };
          break;
        case 'check':
          cell.content = { kind: 'check', ...(this.isMarked(cell) ? { checked: true } : {}) };
          break;
        default:
          cell.content = { kind: 'blank' };
      }
    });
  }

  toggle(flag: 'bold' | 'fill' | 'boxed') {
    this.patchCell((cell) => {
      // `boxed` viene sin declarar cuando la casilla lleva recuadro, así que
      // hay que tratarlo como "activado salvo que diga lo contrario".
      const current = flag === 'boxed' ? cell.boxed !== false : !!cell[flag];
      (cell as any)[flag] = !current;
    });
  }

  setAlign(align: 'left' | 'center' | 'right') {
    this.patchCell((cell) => {
      cell.align = align;
    });
  }

  /** Deja la casilla vacía, sin borrarla de la fila. */
  clearCell() {
    this.patchCell((cell) => {
      cell.content = { kind: 'blank' };
    });
  }

  // --- datos -------------------------------------------------------------------

  startDrag(field: DataField) {
    this.dragging.set(field);
  }

  endDrag() {
    this.dragging.set(null);
    this.hoverTarget.set('');
  }

  hover(key: string) {
    if (this.dragging()) {
      this.hoverTarget.set(key);
    }
  }

  /** Suelta un dato sobre una casilla: a partir de ahora imprime ese dato. */
  dropOn(sectionId: string, rowId: string, cellId: string) {
    const field = this.dragging();
    this.endDrag();
    if (!field) {
      return;
    }
    this.selection.set({ sectionId, rowId, cellId });
    this.applyField(field);
  }

  /**
   * El desplegable del panel devuelve la posición en la lista, no la ficha.
   *
   * La opción vacía es "Texto fijo": no enlaza nada. Se comprueba antes de
   * convertir, porque `Number('')` es `0` y elegirla enlazaba el primer dato
   * de la lista —la nave— en una casilla que se acababa de escribir a mano.
   */
  applyFieldAt(index: string) {
    if (index === '' || index === null || index === undefined) {
      return;
    }
    const field = this.allFields[Number(index)];
    if (field) {
      this.applyField(field);
    }
  }

  applyField(field: DataField) {
    this.patchCell((cell) => {
      cell.content = field.signature
        ? { kind: 'signature', source: field.source }
        : {
          kind: 'data',
          source: field.source,
          ...(field.transform ? { transform: field.transform } : {}),
        };
    });
  }

  /** Quita el dato: la casilla vuelve a ser texto fijo. */
  clearField() {
    this.patchCell((cell) => {
      cell.content = { kind: 'blank' };
    });
  }

  // --- filas ------------------------------------------------------------------

  private newId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
  }

  /**
   * Inserta una fila.
   *
   * Nace con dos columnas al 50%, que es el reparto que la gente espera al
   * añadir una fila en cualquier editor por bloques. Partirla más o juntarla
   * en una es un gesto más.
   */
  insertRow(sectionId: string, index: number) {
    const id = this.newId('f');
    this.edit((document) => {
      const section = this.sectionOf(document, sectionId);
      if (!section?.rows) {
        return;
      }
      section.rows.splice(index, 0, {
        id,
        cells: [
          { id: `${id}-a`, width: 50, content: { kind: 'blank' } },
          { id: `${id}-b`, width: 50, content: { kind: 'blank' } },
        ],
      });
    });
    this.selection.set({ sectionId, rowId: id, cellId: `${id}-a` });
  }

  removeRow(sectionId: string, rowId: string) {
    this.edit((document) => {
      const section = this.sectionOf(document, sectionId);
      if (section?.rows) {
        section.rows = section.rows.filter((row) => row.id !== rowId);
      }
    });
    this.selection.set(null);
  }

  moveRow(sectionId: string, index: number, delta: number) {
    this.edit((document) => {
      const rows = this.sectionOf(document, sectionId)?.rows;
      const target = index + delta;
      if (!rows || target < 0 || target >= rows.length) {
        return;
      }
      const [moved] = rows.splice(index, 1);
      rows.splice(target, 0, moved);
    });
  }

  duplicateRow(sectionId: string, rowId: string) {
    this.edit((document) => {
      const rows = this.sectionOf(document, sectionId)?.rows;
      const index = rows?.findIndex((row) => row.id === rowId) ?? -1;
      if (!rows || index < 0) {
        return;
      }
      const stamp = Date.now().toString(36);
      const copy: IBlockRow = JSON.parse(JSON.stringify(rows[index]));
      copy.id = `${copy.id}-${stamp}`;
      copy.cells.forEach((cell, position) => (cell.id = `${copy.id}-${position}`));
      rows.splice(index + 1, 0, copy);
    });
  }

  // --- columnas ----------------------------------------------------------------

  /**
   * Parte una casilla en dos.
   *
   * El ancho se reparte entre las dos mitades, así que la fila sigue sumando
   * 100 y nada se descoloca. Es el gesto con el que se construye una fila:
   * empieza entera y se va partiendo.
   */
  splitCell(sectionId: string, rowId: string, cellId: string) {
    const id = this.newId('c');
    this.edit((document) => {
      const row = this.rowOf(document, sectionId, rowId);
      const index = row?.cells.findIndex((cell) => cell.id === cellId) ?? -1;
      if (!row || index < 0) {
        return;
      }
      const half = Math.round((row.cells[index].width / 2) * 100) / 100;
      row.cells[index].width = half;
      row.cells.splice(index + 1, 0, { id, width: half, content: { kind: 'blank' } });
      this.normalize(row);
    });
    this.selection.set({ sectionId, rowId, cellId: id });
  }

  /** Junta una casilla con la siguiente, sumando sus anchos. */
  mergeWithNext(sectionId: string, rowId: string, cellId: string) {
    this.edit((document) => {
      const row = this.rowOf(document, sectionId, rowId);
      const index = row?.cells.findIndex((cell) => cell.id === cellId) ?? -1;
      if (!row || index < 0 || index >= row.cells.length - 1) {
        return;
      }
      row.cells[index].width += row.cells[index + 1].width;
      row.cells.splice(index + 1, 1);
      this.normalize(row);
    });
  }

  removeCell(sectionId: string, rowId: string, cellId: string) {
    this.edit((document) => {
      const row = this.rowOf(document, sectionId, rowId);
      if (!row || row.cells.length <= 1) {
        return;
      }
      row.cells = row.cells.filter((cell) => cell.id !== cellId);
      this.normalize(row);
    });
    this.selection.set(null);
  }

  setCellWidth(value: string) {
    const current = this.selection();
    if (!current?.rowId || !current.cellId) {
      return;
    }
    this.edit((document) => {
      const row = this.rowOf(document, current.sectionId, current.rowId as string);
      const cell = row?.cells.find((entry) => entry.id === current.cellId);
      if (!row || !cell) {
        return;
      }
      cell.width = Math.max(1, Math.min(99, Number(value) || 1));
      this.normalize(row, cell.id);
    });
  }

  /**
   * Devuelve los anchos de una fila a sumar 100.
   *
   * `keep` es la casilla que acaba de tocarse: el resto absorbe la diferencia
   * en proporción. Sin esto, cambiar un ancho dejaría la fila corta o
   * desbordada, y el validador del backend lo rechazaría al publicar.
   */
  private normalize(row: IBlockRow, keep?: string) {
    const others = row.cells.filter((cell) => cell.id !== keep);
    if (others.length === 0) {
      row.cells[0].width = 100;
      return;
    }
    const fixed = keep
      ? row.cells.find((cell) => cell.id === keep)?.width ?? 0
      : 0;
    const available = 100 - fixed;
    const total = others.reduce((sum, cell) => sum + cell.width, 0) || others.length;

    let assigned = 0;
    others.forEach((cell, index) => {
      const width = index === others.length - 1
        ? Math.round((available - assigned) * 100) / 100
        : Math.round(((cell.width / total) * available) * 100) / 100;
      cell.width = Math.max(1, width);
      assigned += cell.width;
    });
  }

  // --- secciones ---------------------------------------------------------------

  setSectionTitle(sectionId: string, title: string) {
    this.edit((document) => {
      const section = this.sectionOf(document, sectionId);
      if (section) {
        section.title = title;
      }
    });
  }

  toggleSectionVisible(sectionId: string) {
    this.edit((document) => {
      const section = this.sectionOf(document, sectionId);
      if (section) {
        section.visible = section.visible === false;
      }
    });
  }

  moveSection(index: number, delta: number) {
    this.edit((document) => {
      const target = index + delta;
      if (target < 0 || target >= document.sections.length) {
        return;
      }
      const [moved] = document.sections.splice(index, 1);
      document.sections.splice(target, 0, moved);
    });
  }

  removeSection(sectionId: string) {
    this.edit((document) => {
      document.sections = document.sections.filter((section) => section.id !== sectionId);
    });
    this.selection.set(null);
  }

  /** Sección nueva con una fila, para que no nazca sin nada que se pueda publicar. */
  addSection(index?: number) {
    const id = this.newId('s');
    this.edit((document) => {
      const section: ISectionDefinition = {
        kind: 'rows',
        id,
        title: 'Nueva sección',
        rows: [{
          id: `${id}-f1`,
          cells: [
            { id: `${id}-f1-a`, width: 50, content: { kind: 'blank' } },
            { id: `${id}-f1-b`, width: 50, content: { kind: 'blank' } },
          ],
        }],
      };
      document.sections.splice(index ?? document.sections.length, 0, section);
    });
    this.selection.set({ sectionId: id });
  }

  // --- utilidades --------------------------------------------------------------

  rowTemplate(row: IBlockRow): string {
    return row.cells.map((cell) => `${cell.width}%`).join(' ');
  }

  rowsOf(section: ISectionDefinition): IBlockRow[] {
    return section.rows ?? [];
  }

  imageUrl(sha1: string): string {
    return `${assetsOrigin()}/static/format-assets/${sha1}.png`;
  }

  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (img.src.endsWith('.png')) {
      img.src = img.src.replace(/\.png$/, '.jpeg');
      return;
    }
    img.style.visibility = 'hidden';
  }
}

/**
 * Lo que el constructor recuerda entre visitas: el zoom y si los paneles
 * quedaron plegados.
 *
 * Todo entre `try`: en una ventana de incognito o con el almacenamiento
 * bloqueado, leer lanza en vez de devolver vacio, y el constructor no puede
 * dejar de abrirse por eso.
 */
class Preferencias {
  static readonly ZOOM = 'fb-zoom--cosmos-front-ls';
  static readonly DATOS = 'fb-panel-datos--cosmos-front-ls';
  static readonly DETALLES = 'fb-panel-detalles--cosmos-front-ls';
  static readonly AJUSTADO = 'fb-zoom-ajustado--cosmos-front-ls';

  static guardar(clave: string, valor: string) {
    try {
      localStorage.setItem(clave, valor);
    } catch {
      // Sin almacenamiento el constructor funciona igual; solo no se recuerda.
    }
  }

  static leerNumero(clave: string, porDefecto: number): number {
    try {
      const valor = Number(localStorage.getItem(clave));
      return Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
    } catch {
      return porDefecto;
    }
  }

  static leerBooleano(clave: string, porDefecto: boolean): boolean {
    try {
      const valor = localStorage.getItem(clave);
      return valor === null ? porDefecto : valor === 'true';
    } catch {
      return porDefecto;
    }
  }
}
