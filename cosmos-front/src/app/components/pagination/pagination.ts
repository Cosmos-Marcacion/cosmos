import { Component, computed, input, output } from '@angular/core';

/**
 * Paginacion de los listados.
 *
 * ## Por que las paginas se calculan y no se guardan
 *
 * Antes el numero de paginas se calculaba una sola vez, en `ngOnInit`:
 *
 *     ngOnInit() {
 *       this.totalPages = Array.from({ length: Math.ceil(this.total / this.limit) }, ...)
 *       if (this.totalPages.length === 0) this.totalPages = [1]
 *     }
 *
 * `total` es una entrada que llega despues, cuando responde la API. En
 * `ngOnInit` todavia vale 0, asi que entraba por la rama del `[1]` y ahi se
 * quedaba: ningun cambio posterior de `total` lo recalculaba. De ahi que la
 * paginacion mostrase siempre el numero 1, hubiera los registros que hubiera.
 *
 * Con `computed` el calculo se rehace solo cuando cambian `total` o `limit`,
 * que es cuando tiene sentido rehacerlo.
 *
 * El otro lado del mismo fallo estaba en la API, que devolvia en `total` el
 * tamano de la pagina en vez del numero de coincidencias. Sin aquello, esto
 * solo, tampoco habria pasado de la primera pagina.
 */
@Component({
  selector: 'app-pagination',
  imports: [],
  templateUrl: './pagination.html',
  styleUrl: './pagination.scss',
})
export class Pagination {
  /** Numero de coincidencias, no de registros en esta pagina. */
  readonly total = input<number>(0);
  readonly page = input<number>(1);
  readonly limit = input<number>(10);

  readonly pageChange = output<number>();

  /**
   * Siempre hay al menos una pagina: un listado vacio se sigue leyendo como
   * "pagina 1 de 1", no como un hueco sin numeros.
   */
  readonly totalPages = computed(() => {
    const cuantas = Math.max(1, Math.ceil(this.total() / Math.max(1, this.limit())));
    return Array.from({ length: cuantas }, (_, i) => i + 1);
  });

  readonly lastPage = computed(() => this.totalPages().length);
  readonly isFirst = computed(() => this.page() <= 1);
  readonly isLast = computed(() => this.page() >= this.lastPage());

  /** Primer y ultimo registro de la pagina, para el texto de resumen. */
  readonly from = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.limit() + 1));
  readonly to = computed(() => Math.min(this.page() * this.limit(), this.total()));

  /**
   * Como mucho cinco numeros, con la pagina actual centrada mientras se pueda.
   * Mas numeros no ayudan a orientarse y en movil no caben.
   */
  readonly visiblePages = computed(() => {
    const paginas = this.totalPages();
    const MAXIMO = 5;
    if (paginas.length <= MAXIMO) {
      return paginas;
    }

    const actual = this.page();
    if (actual <= 3) {
      return paginas.slice(0, MAXIMO);
    }
    if (actual >= paginas.length - 2) {
      return paginas.slice(-MAXIMO);
    }
    return paginas.slice(actual - 3, actual + 2);
  });

  readonly showEllipsisStart = computed(() => this.visiblePages()[0] > 1);
  readonly showEllipsisEnd = computed(
    () => this.visiblePages()[this.visiblePages().length - 1] < this.lastPage()
  );

  /**
   * Cambia de pagina solo dentro del rango.
   *
   * Las flechas emitian `page - 1` y `page + 1` sin mirar donde estaban: en la
   * primera pagina se pedia la 0, que el servidor traduce a un `skip` negativo.
   */
  go(page: number) {
    if (page < 1 || page > this.lastPage() || page === this.page()) {
      return;
    }
    this.pageChange.emit(page);
  }
}
