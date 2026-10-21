import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';
import { FormatsService } from '../services/formats.service';
import { FormatDocument } from '../format-document/format-document';
import { IResolvedFormat } from '../interfaces/format-document.interface';
import { apiErrorMessage } from '../../../interceptors/handled-error';

/**
 * Ver e imprimir el formato de una nombrada, sin descargar nada.
 *
 * Es la tercera salida del motor v2. Las otras dos (Excel y PDF) siguen
 * estando; ésta evita tener que generar un fichero solo para mirar si el
 * formato está completo antes de emitirlo.
 */
@Component({
  selector: 'app-format-print',
  standalone: true,
  imports: [CommonModule, RouterLink, FormatDocument],
  templateUrl: './format-print.html',
  styleUrl: './format-print.scss',
})
export default class FormatPrint {
  private route = inject(ActivatedRoute);
  private formats = inject(FormatsService);

  readonly format = signal<IResolvedFormat | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly selected = signal<string[]>([]);

  readonly staffTransmissionId = Number(this.route.snapshot.paramMap.get('staffTransmissionId'));
  readonly workerDate = this.route.snapshot.queryParamMap.get('workerDate') ?? '';

  /**
   * La fecha para volver al detalle, que la pide como `aaaa-mm-dd`.
   *
   * Aquí llega como `dd/mm/aaaa`, que es lo que espera la API del formato. Sin
   * convertirla, "Volver" abría el detalle sin fecha y este decía "No
   * encontramos esta nombrada".
   */
  readonly backDate = toIsoDate(this.workerDate);

  readonly documents = computed(() => this.format()?.documents ?? []);

  constructor() {
    if (!this.workerDate) {
      this.error.set(
        'A esta dirección le falta la fecha de la jornada. Vuelve a la nombrada y abre el formato desde ahí.'
      );
      this.loading.set(false);
      return;
    }
    this.formats
      .getDocument(this.staffTransmissionId, this.workerDate)
      .pipe(
        catchError((error) => {
          const fallback =
            'No se pudo componer el formato de esta nombrada. Vuelve a intentarlo; si sigue igual, revisa que la jornada tenga personal y responsables.';
          // Un 4xx trae el motivo concreto (tipo de nave sin formato, nombrada
          // que no existe); el texto generico mandaba a revisar lo que no era.
          const status = Number(error?.status ?? 0);
          this.error.set(status >= 400 && status < 500 ? apiErrorMessage(error, fallback) : fallback);
          return of(null);
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe((format) => this.format.set(format));
  }

  /** Alterna qué documentos del libro se ven y se imprimen. */
  toggle(documentId: string) {
    const current = this.selected();
    this.selected.set(
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId]
    );
  }

  isVisible(documentId: string): boolean {
    const selected = this.selected();
    return selected.length === 0 || selected.includes(documentId);
  }

  print() {
    window.print();
  }
}

/** `dd/mm/aaaa` a `aaaa-mm-dd`; lo que ya viene en ISO o no se entiende, tal cual. */
export function toIsoDate(date: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date.trim());
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : date;
}
