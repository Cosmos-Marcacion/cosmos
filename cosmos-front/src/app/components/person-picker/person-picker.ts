import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PersonDirectoryService } from '../../services/person-directory.service';
import { IPerson, IPersonRef } from '../../interfaces/person.interface';

/**
 * Selector de personal con búsqueda por nombre o documento.
 *
 * Se usa en todos los campos que designan a una persona (jefe de cubierta,
 * supervisores, entrenador, responsable del registro, aprobadores). Antes cada
 * uno era un texto libre o un desplegable propio; ahora todos leen el mismo
 * maestro y guardan nombre, documento y cargo juntos, que es lo que después se
 * imprime en el formato.
 *
 * Es un combobox de teclado completo: flechas para moverse, Enter para elegir,
 * Escape para cerrar sin cambiar nada.
 *
 * ## Por qué la lista es un `popover` y no un `position: absolute`
 *
 * El sitio donde más se usa es dentro de la ventana de configuración de la
 * nombrada, cuyo cuerpo tiene `overflow-y: auto` para poder desplazarse. Una
 * lista posicionada en absoluto es hija de ese cuerpo, así que el navegador la
 * recorta por el borde de la ventana: en el tercer selector se perdían 150 px
 * de resultados, que es justo lo que hay que leer para elegir.
 *
 * `popover` saca el panel a la capa superior del navegador (*top layer*), fuera
 * del flujo y por encima de cualquier `overflow` y de cualquier `z-index`. A
 * cambio hay que colocarlo a mano, que es lo que hace `place()`.
 *
 * Es `popover="manual"` y no `"auto"` a propósito. El cierre automático del
 * navegador (*light dismiss*) mira el `pointerdown` y el `pointerup` del mismo
 * clic, así que un panel que se abre al enfocar el campo se cierra con el mismo
 * clic que lo abrió. Con `manual` el cierre lo decide este componente.
 */
@Component({
  selector: 'app-person-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './person-picker.html',
  styleUrl: './person-picker.scss',
})
export class PersonPicker {
  private readonly directory = inject(PersonDirectoryService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  /** El campo al que se ancla la lista. Solo existe con el selector abierto. */
  private readonly fieldRef = viewChild<ElementRef<HTMLElement>>('field');
  private readonly panelRef = viewChild<ElementRef<HTMLElement>>('panel');

  readonly label = input<string>('');
  readonly placeholder = input<string>('Buscar por nombre o documento');
  /** Restringe el maestro a un cargo. Vacío ofrece a todo el personal. */
  readonly position = input<string>('');
  readonly hint = input<string>('');
  readonly required = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly value = input<IPersonRef | null>(null);

  readonly valueChange = output<IPersonRef | null>();

  readonly query = signal('');
  readonly results = signal<IPerson[]>([]);
  readonly open = signal(false);
  readonly loading = signal(false);
  readonly activeIndex = signal(-1);
  /** Se marca al abrir para no mostrar "sin resultados" antes de la primera consulta. */
  readonly searched = signal(false);

  readonly hasValue = computed(() => Boolean(this.value()?.fullName));

  /** Caracteres mínimos que el maestro exige para responder. */
  readonly minLength = this.directory.minLength;
  /**
   * `true` cuando lo tecleado ya da para consultar. Contra Visma real hacen
   * falta tres caracteres: sin ellos no hay listado que ofrecer y la lista
   * vacía no significa que no haya nadie.
   */
  readonly canSearch = computed(() => this.query().trim().length >= this.minLength());

  readonly showEmpty = computed(
    () =>
      this.open() &&
      this.searched() &&
      this.canSearch() &&
      !this.loading() &&
      this.results().length === 0
  );
  readonly showMinLength = computed(
    () => this.open() && !this.canSearch() && !this.loading() && this.results().length === 0
  );

  private readonly terms = new Subject<string>();
  /** Contador de instancia, para que los `id` de accesibilidad no choquen. */
  private static instances = 0;
  readonly uid = `person-picker-${++PersonPicker.instances}`;

  constructor() {
    this.terms
      .pipe(
        debounceTime(220),
        distinctUntilChanged(),
        switchMap(term => {
          this.loading.set(true);
          return this.directory.search(term, this.position() || undefined);
        }),
        takeUntilDestroyed()
      )
      .subscribe({
        next: people => {
          this.results.set(people);
          this.loading.set(false);
          this.searched.set(true);
          this.activeIndex.set(people.length > 0 ? 0 : -1);
        },
        error: () => {
          this.results.set([]);
          this.loading.set(false);
          this.searched.set(true);
        },
      });

    // El panel se coloca en cuanto Angular lo pinta: `panelRef` es una señal y
    // se rellena despues del render, asi que el efecto se despierta solo.
    effect(() => {
      const panel = this.panelRef()?.nativeElement;
      if (!panel) {
        return;
      }
      this.place();
      // `showPopover` falla si ya esta abierto, y no existe en navegadores sin
      // soporte: ahi el panel se pinta igual, solo que sin capa superior.
      if (panel.hasAttribute('popover') && !panel.matches(':popover-open')) {
        panel.showPopover();
      }
    });

    /**
     * Cierre al pulsar fuera.
     *
     * Va en fase de captura y sobre `pointerdown`, no sobre el `click` que
     * burbujea, porque la ventana que contiene el selector para la propagacion
     * de sus clics (`(click)="$event.stopPropagation()"`, que es lo que impide
     * que un clic dentro la cierre). Un escucha en burbuja nunca llegaba a
     * enterarse y la lista se quedaba abierta hasta elegir a alguien.
     *
     * El panel sigue siendo hijo del componente en el DOM aunque se pinte en la
     * capa superior, asi que `contains` tambien cubre los clics sobre la lista.
     */
    const onPointerDown = (event: Event) => {
      if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
        this.close();
      }
    };
    // El panel esta anclado al campo, y el campo se mueve con el scroll de la
    // ventana que lo contiene. La captura hace que cuente cualquier scroll, no
    // solo el del documento.
    const onReflow = () => {
      if (this.open()) {
        this.place();
      }
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    });
  }

  // --- apertura y cierre -----------------------------------------------------

  openList() {
    if (this.disabled()) {
      return;
    }
    this.open.set(true);
    // Al abrir se ofrece el maestro completo, para poder elegir sin escribir.
    this.terms.next(this.query());
  }

  close() {
    const panel = this.panelRef()?.nativeElement;
    if (panel?.matches(':popover-open')) {
      panel.hidePopover();
    }
    this.open.set(false);
    this.activeIndex.set(-1);
    // El texto tecleado se descarta: lo que vale es la persona seleccionada.
    this.query.set('');
  }

  /**
   * Ancla el panel al campo.
   *
   * Al estar en la capa superior el panel se posiciona contra la ventana, no
   * contra el campo, asi que las coordenadas se calculan aqui en cada apertura
   * y en cada scroll. Tres decisiones de uso:
   *
   *  - Se abre hacia arriba cuando debajo no cabe y encima hay mas sitio. Es el
   *    caso del ultimo selector de la ventana de responsables, que queda a un
   *    palmo del borde inferior de la pantalla.
   *  - La altura de la lista se recorta a lo que queda libre, de modo que nunca
   *    se sale de la pantalla ni obliga a desplazar la pagina entera.
   *  - Si el campo se va de la vista al desplazar la ventana que lo contiene,
   *    el panel se cierra: seguir flotando sobre la cabecera del modal, ya sin
   *    su campo debajo, no se entiende.
   */
  private place() {
    const panel = this.panelRef()?.nativeElement;
    const field = this.fieldRef()?.nativeElement;
    if (!panel || !field) {
      return;
    }

    const campo = field.getBoundingClientRect();
    if (!this.isVisible(field, campo)) {
      this.close();
      return;
    }

    const SEPARACION = 4;
    const MARGEN = 8;
    const ALTO_MAXIMO = 304; // 19rem, el mismo tope que tenia la lista.
    const ALTO_MINIMO = 132; // Por debajo de esto no se lee ni una ficha entera.

    const libreDebajo = window.innerHeight - campo.bottom - SEPARACION - MARGEN;
    const libreEncima = campo.top - SEPARACION - MARGEN;
    const haciaArriba = libreDebajo < ALTO_MINIMO && libreEncima > libreDebajo;
    const alto = Math.min(ALTO_MAXIMO, Math.max(ALTO_MINIMO, haciaArriba ? libreEncima : libreDebajo));

    // Alineado con el campo, y solo se separa de el si asi se saldria por la
    // derecha. El `max` evita que un campo mas ancho que la pantalla lo empuje
    // hacia la izquierda sin necesidad.
    const izquierda = Math.min(
      campo.left,
      Math.max(MARGEN, window.innerWidth - campo.width - MARGEN)
    );

    panel.style.left = `${Math.round(izquierda)}px`;
    panel.style.width = `${Math.round(campo.width)}px`;
    if (haciaArriba) {
      panel.style.top = 'auto';
      panel.style.bottom = `${Math.round(window.innerHeight - campo.top + SEPARACION)}px`;
    } else {
      panel.style.bottom = 'auto';
      panel.style.top = `${Math.round(campo.bottom + SEPARACION)}px`;
    }
    panel.style.setProperty('--person-picker-alto', `${Math.round(alto)}px`);
    panel.dataset['direccion'] = haciaArriba ? 'arriba' : 'abajo';
  }

  /**
   * `true` mientras el campo siga a la vista dentro de todo lo que lo recorta.
   *
   * No basta con mirar la ventana del navegador: dentro de un modal con scroll
   * el campo puede estar fuera del area visible del modal y seguir dentro de la
   * pantalla. Por eso se recorre la cadena de ancestros con `overflow`.
   */
  private isVisible(field: HTMLElement, rect: DOMRect): boolean {
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      return false;
    }
    for (let padre = field.parentElement; padre; padre = padre.parentElement) {
      const { overflowX, overflowY } = getComputedStyle(padre);
      if (overflowX === 'visible' && overflowY === 'visible') {
        continue;
      }
      const corte = padre.getBoundingClientRect();
      if (rect.bottom <= corte.top || rect.top >= corte.bottom) {
        return false;
      }
    }
    return true;
  }

  // --- búsqueda --------------------------------------------------------------

  onInput(event: Event) {
    const term = (event.target as HTMLInputElement).value;
    this.query.set(term);
    this.searched.set(false);
    this.open.set(true);
    this.terms.next(term);
  }

  // --- selección -------------------------------------------------------------

  select(person: IPerson) {
    this.valueChange.emit(this.directory.toRef(person));
    this.close();
  }

  clear(event?: Event) {
    event?.stopPropagation();
    this.valueChange.emit(null);
    this.query.set('');
    this.results.set([]);
  }

  // --- teclado ---------------------------------------------------------------

  onKeydown(event: KeyboardEvent) {
    if (this.disabled()) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open()) {
          this.openList();
          return;
        }
        this.move(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        this.move(-1);
        return;
      case 'Enter': {
        if (!this.open()) {
          return;
        }
        event.preventDefault();
        const person = this.results()[this.activeIndex()];
        if (person) {
          this.select(person);
        }
        return;
      }
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          // Se frena aqui: la ventana que contiene el selector tambien cierra
          // con Escape, y sin esto una sola pulsacion cerraba las dos cosas.
          // Primero se sale de la lista; la ventana, en la siguiente.
          event.stopPropagation();
          this.close();
        }
        return;
      case 'Tab':
        this.close();
        return;
    }
  }

  private move(delta: number) {
    const total = this.results().length;
    if (total === 0) {
      return;
    }
    const next = (this.activeIndex() + delta + total) % total;
    this.activeIndex.set(next);
    // Mantiene visible la opción activa cuando la lista tiene scroll.
    queueMicrotask(() => {
      this.host.nativeElement
        .querySelector(`#${this.uid}-option-${next}`)
        ?.scrollIntoView({ block: 'nearest' });
    });
  }

  optionId(index: number): string {
    return `${this.uid}-option-${index}`;
  }
}
