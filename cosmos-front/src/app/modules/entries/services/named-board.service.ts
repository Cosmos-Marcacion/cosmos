import { HttpClient, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, from, map, switchMap, throwError } from 'rxjs';
import { handled, readBlobError } from '../../../interceptors/handled-error';
import { environment } from '../../../../environments/environment';
import {
  FormatOutput,
  IFormatType,
  INamedBoardFilters,
  INamedBoardRow,
  INamedRecord,
} from '../interfaces/named-board.interface';
import { INamedDetail } from '../interfaces/named-detail.interface';

/**
 * Vista de marcaciones centrada en la nombrada.
 *
 * Antes cada descarga (asistencia, ATS, permiso de trabajo) se armaba en el
 * navegador a partir de la lista plana de trabajadores. Ahora el backend emite
 * un único Excel por nombrada, con todos los libros dentro, generado sobre la
 * plantilla oficial del tipo que corresponda.
 */
@Injectable({ providedIn: 'root' })
export class NamedBoardService {
  private readonly url = environment.api;
  private readonly http = inject(HttpClient);

  /** Nombradas del rango con su ficha, asistencias y capacitaciones. */
  getBoard(filters: INamedBoardFilters) {
    return this.http.post<INamedBoardRow[]>(`${this.url}/named/board`, filters);
  }

  /**
   * Todo lo que se sabe de una nombrada en una sola petición: cabecera,
   * ficha, personal con sus marcaciones, charlas y formatos emitidos.
   */
  getDetail(staffTransmissionId: number, workerDate: string) {
    return this.http.get<INamedDetail>(`${this.url}/named/detail/${staffTransmissionId}`, {
      params: { workerDate },
    });
  }

  getRecord(staffTransmissionId: number) {
    return this.http.get<INamedRecord | null>(
      `${this.url}/named/records/${staffTransmissionId}`
    );
  }

  saveRecord(staffTransmissionId: number, record: Partial<INamedRecord> & { workerDate: string }) {
    return this.http.put<INamedRecord>(
      `${this.url}/named/records/${staffTransmissionId}`,
      record
    );
  }

  getFormatTypes() {
    return this.http.get<IFormatType[]>(`${this.url}/format/types`);
  }

  /** Si el servidor tiene convertidor a PDF (LibreOffice) instalado y respondiendo. */
  getPdfStatus() {
    return this.http.get<{ ok: boolean; version: string }>(`${this.url}/format/pdf/status`);
  }

  /**
   * Descarga el formato único de la nombrada. Se pide como `blob` y se conserva
   * el nombre que envía el servidor, que ya identifica tipo, nave y fecha.
   *
   * `output` solo cambia cómo se entrega, no qué se entrega: el PDF es una
   * conversión del mismo libro que devuelve el Excel, hecha en el servidor, así
   * que ambos llevan los mismos datos y la misma maquetación.
   */
  downloadFormat(staffTransmissionId: number, workerDate: string, output: FormatOutput = 'xlsx') {
    const path = output === 'pdf'
      ? `${this.url}/format/${staffTransmissionId}/pdf`
      : `${this.url}/format/${staffTransmissionId}`;

    return this.http.get(path, {
      params: { workerDate },
      responseType: 'blob',
      observe: 'response',
      // Con `responseType: 'blob'` el error tambien llega como blob y el
      // interceptor solo podia mostrar "Http failure response for ...". La
      // pantalla lo cuenta con el mensaje de la API ya leido (ver abajo).
      context: handled(),
    }).pipe(
      catchError((error: unknown) =>
        from(readBlobError(error)).pipe(switchMap(parsed => throwError(() => parsed)))
      ),
      map((response: HttpResponse<Blob>) => {
        const disposition = response.headers.get('Content-Disposition') ?? '';
        const match = /filename="?([^"]+)"?/.exec(disposition);
        return {
          blob: response.body as Blob,
          fileName: match?.[1] ?? `formato_${staffTransmissionId}.${output}`,
          pages: Number(response.headers.get('X-Format-Pages') ?? 1),
          staffCount: Number(response.headers.get('X-Format-Staff-Count') ?? 0),
          formatType: response.headers.get('X-Format-Type') ?? '',
          workPermitNumber: Number(response.headers.get('X-Format-Work-Permit') ?? 0),
          output: (response.headers.get('X-Format-Output') ?? output) as FormatOutput,
        };
      })
    );
  }
}
