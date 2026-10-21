import { Component, computed, input, output } from '@angular/core';

/**
 * Estado de un listado o grafico que no tiene nada que pintar.
 *
 * Antes un listado vacio dejaba un hueco en blanco: no se distinguia entre "no
 * hay registros", "la busqueda no encontro nada", "todavia esta cargando" y "la
 * consulta fallo". Cada caso pide una salida distinta (esperar, cambiar el
 * termino, reintentar), asi que cada uno lleva su propio mensaje.
 *
 * El tono sigue al del selector de empleados del Generador, que era el unico que
 * ya lo explicaba bien.
 */
export type EmptyStateKind = 'loading' | 'error' | 'no-match' | 'empty';

@Component({
  selector: 'app-empty-state',
  template: `
    <div
      class="empty-state flex flex-col items-center justify-center gap-2 px-4 py-8 text-center"
      [attr.role]="kind() === 'error' ? 'alert' : 'status'"
      [attr.data-kind]="kind()"
    >
      <p class="text-sm" [class.text-red-700]="kind() === 'error'" [class.text-color1-60]="kind() !== 'error'">
        {{ message() }}
      </p>
      @if (kind() === 'error' && retryable()) {
        <button
          type="button"
          class="rounded-md border border-color2 px-3 py-1 text-sm font-medium text-color2 hover:bg-color1-10"
          (click)="retry.emit()"
        >
          Reintentar
        </button>
      }
    </div>
  `,
})
export class EmptyState {
  readonly loading = input(false);
  /** Texto del error de la consulta. Vacio si no hubo error. */
  readonly error = input<string | null | undefined>('');
  /** Termino de busqueda o filtro aplicado; si hay, el vacio es "sin coincidencias". */
  readonly searchTerm = input<string | null | undefined>('');
  readonly emptyMessage = input('No hay registros que mostrar.');
  readonly noMatchMessage = input('');
  readonly retryable = input(false);

  readonly retry = output<void>();

  readonly kind = computed<EmptyStateKind>(() => {
    if (this.loading()) return 'loading';
    if (this.error()) return 'error';
    if ((this.searchTerm() ?? '').trim()) return 'no-match';
    return 'empty';
  });

  readonly message = computed(() => {
    switch (this.kind()) {
      case 'loading':
        return 'Cargando...';
      case 'error':
        return this.error() as string;
      case 'no-match':
        return (
          this.noMatchMessage() ||
          `Nada coincide con «${(this.searchTerm() ?? '').trim()}». Prueba con otro término o limpia la búsqueda.`
        );
      default:
        return this.emptyMessage();
    }
  });
}
