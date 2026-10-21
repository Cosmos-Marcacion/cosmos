import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
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
  readonly showEmpty = computed(
    () => this.open() && this.searched() && !this.loading() && this.results().length === 0
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
          // El error se absorbe aqui dentro: si llegaba al `subscribe` cerraba la
          // tuberia y, tras un solo fallo de red, el selector ya no volvia a
          // buscar nada hasta salir de la pantalla.
          return this.directory
            .search(term, this.position() || undefined)
            .pipe(catchError(() => of([])));
        }),
        takeUntilDestroyed()
      )
      .subscribe(people => {
        this.results.set(people);
        this.loading.set(false);
        this.searched.set(true);
        this.activeIndex.set(people.length > 0 ? 0 : -1);
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
    this.open.set(false);
    this.activeIndex.set(-1);
    // El texto tecleado se descarta: lo que vale es la persona seleccionada.
    this.query.set('');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
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
