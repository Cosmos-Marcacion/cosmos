import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { IEmployeeResponse } from '../../interfaces/employee.interface';

/**
 * Selector de empleado con busqueda por palabras.
 *
 * Sustituye al `<select>` nativo del generador de codigos. El desplegable del
 * navegador tiene dos limitaciones que con una plantilla larga lo vuelven
 * inservible:
 *
 *  - Su busqueda es un salto por prefijo. Se teclea una letra y salta a la
 *    primera opcion que empieza por ella; las siguientes letras, si no llegan
 *    seguidas y rapido, vuelven a contar como una busqueda nueva. No hay forma
 *    de buscar por apellido ni por documento.
 *  - No ordena nada: pinta las opciones en el orden en que llegan de la API,
 *    que es el de creacion en la base de datos.
 *
 * Aqui la lista va ordenada alfabeticamente y el filtro parte lo tecleado en
 * palabras: cada una tiene que aparecer en el nombre, el apellido o el
 * documento, en cualquier orden. Asi "torres ana" y "ana torres" encuentran a
 * la misma persona, y un trozo de DNI tambien vale.
 *
 * La comparacion es sin tildes y sin mayusculas por ambos lados: el maestro
 * trae los nombres acentuados y nadie los escribe con tilde al buscar.
 */
@Component({
  selector: 'app-employee-picker',
  standalone: true,
  imports: [],
  templateUrl: './employee-picker.html',
})
export class EmployeePicker {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  readonly employees = input<IEmployeeResponse[]>([]);
  readonly value = input<string>('');
  readonly label = input<string>('Empleado');
  readonly required = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly placeholder = input<string>('Buscar por nombre, apellido o documento');

  readonly valueChange = output<string>();

  readonly query = signal('');
  readonly open = signal(false);
  readonly activeIndex = signal(-1);

  /** Contador de instancia, para que los `id` de accesibilidad no choquen. */
  private static instances = 0;
  readonly uid = `employee-picker-${++EmployeePicker.instances}`;

  /**
   * Orden alfabetico por apellido y luego nombre.
   *
   * `Intl.Collator` y no `<`: con el orden de puntos de codigo, "Ñ" cae detras
   * de "Z" y "Álvarez" detras de "Zamora". `sensitivity: 'base'` iguala
   * mayusculas y tildes, y `numeric` deja en orden a los homonimos numerados.
   */
  private readonly collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

  readonly sorted = computed(() =>
    [...this.employees()].sort(
      (a, b) =>
        this.collator.compare(a.lastName ?? '', b.lastName ?? '') ||
        this.collator.compare(a.firstName ?? '', b.firstName ?? '') ||
        this.collator.compare(a.document ?? '', b.document ?? '')
    )
  );

  /** Cada empleado con su texto de busqueda ya normalizado, calculado una vez. */
  private readonly indexed = computed(() =>
    this.sorted().map(employee => ({
      employee,
      haystack: normalize(
        `${employee.firstName ?? ''} ${employee.lastName ?? ''} ${employee.document ?? ''}`
      ),
    }))
  );

  readonly results = computed(() => {
    const terms = normalize(this.query()).split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      return this.sorted();
    }
    return this.indexed()
      .filter(({ haystack }) => terms.every(term => haystack.includes(term)))
      .map(({ employee }) => employee);
  });

  readonly selected = computed(
    () => this.employees().find(employee => employee._id === this.value()) ?? null
  );

  readonly showEmpty = computed(
    () => this.open() && this.results().length === 0 && this.employees().length > 0
  );

  constructor() {
    // Cierre al pulsar fuera. En fase de captura y sobre `pointerdown` para que
    // tambien cuente dentro de contenedores que paran la propagacion del clic.
    const onPointerDown = (event: Event) => {
      if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
        this.close();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    this.destroyRef.onDestroy(() => document.removeEventListener('pointerdown', onPointerDown, true));
  }

  displayName(employee: IEmployeeResponse | null): string {
    if (!employee) {
      return '';
    }
    return `${employee.lastName ?? ''} ${employee.firstName ?? ''}`.trim();
  }

  openList() {
    if (this.disabled()) {
      return;
    }
    this.open.set(true);
    // Arranca sobre el elegido, si sigue en la lista filtrada: al reabrir, la
    // flecha continua desde donde estaba en vez de saltar al primero.
    const actual = this.results().findIndex(employee => employee._id === this.value());
    this.activeIndex.set(actual);
  }

  close() {
    this.open.set(false);
    this.activeIndex.set(-1);
    // Lo tecleado se descarta: lo que vale es el empleado elegido, que es lo
    // que el campo vuelve a mostrar.
    this.query.set('');
  }

  onInput(event: Event) {
    this.query.set((event.target as HTMLInputElement).value);
    this.open.set(true);
    this.activeIndex.set(this.results().length > 0 ? 0 : -1);
  }

  select(employee: IEmployeeResponse) {
    this.valueChange.emit(employee._id);
    this.close();
  }

  clear(event?: Event) {
    event?.stopPropagation();
    this.valueChange.emit('');
    this.query.set('');
  }

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
        if (!this.open()) {
          this.openList();
          return;
        }
        this.move(-1);
        return;
      case 'Enter': {
        if (!this.open()) {
          return;
        }
        event.preventDefault();
        const employee = this.results()[this.activeIndex()];
        if (employee) {
          this.select(employee);
        }
        return;
      }
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
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
    // Mantiene visible la opcion activa cuando la lista tiene scroll.
    queueMicrotask(() => {
      this.host.nativeElement
        .querySelector(`#${this.optionId(next)}`)
        ?.scrollIntoView({ block: 'nearest' });
    });
  }

  optionId(index: number): string {
    return `${this.uid}-option-${index}`;
  }
}

/** Minusculas y sin tildes, para que la busqueda no dependa de como se teclee. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
