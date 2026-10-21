import { HttpClient, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../environments/environment';
import { FileSaverService } from './file-saver.service';
import { ownErrorMessage } from '../interceptors/silent-request';

export interface IFormatDownload {
  blob: Blob;
  fileName: string;
  formatType: string;
  staffCount: number;
  /** Paginas que ocupa la lista de personal. */
  pages: number;
}

/**
 * Formato unico de una nombrada.
 *
 * Antes la app armaba en el dispositivo el reporte de asistencia, el permiso de
 * trabajo y el ATS, cada uno con su propio layout. Ahora los emite el backend
 * sobre la plantilla oficial del tipo de nombrada, en un solo Excel con todos
 * los libros dentro: la app y la web descargan exactamente el mismo archivo y
 * un cambio de formato ya no obliga a republicar el APK.
 */
@Injectable({ providedIn: 'root' })
export class FormatService {
  private readonly http = inject(HttpClient);
  private readonly fileSaver = inject(FileSaverService);

  /** `workerDate` va en `dd/mm/yyyy`, que es lo que espera el backend. */
  download(staffTransmissionId: number, workerDate: string) {
    return this.http
      .get(`${environment.api}/format/${staffTransmissionId}`, {
        params: { workerDate },
        responseType: 'blob',
        observe: 'response',
        // El error llega como Blob y el interceptor no sabe leerlo: pintaba el
        // "Http failure response..." en crudo. Lo traduce quien descarga.
        context: ownErrorMessage(),
      })
      .pipe(
        map((response: HttpResponse<Blob>): IFormatDownload => {
          const disposition = response.headers.get('Content-Disposition') ?? '';
          const match = /filename="?([^"]+)"?/.exec(disposition);
          return {
            blob: response.body as Blob,
            fileName: match?.[1] ?? `formato_${staffTransmissionId}.xlsx`,
            formatType: response.headers.get('X-Format-Type') ?? '',
            staffCount: Number(response.headers.get('X-Format-Staff-Count') ?? 0),
            pages: Number(response.headers.get('X-Format-Pages') ?? 1),
          };
        })
      );
  }

  /** Entrega el archivo al sistema con el nombre que envio el servidor. */
  save(result: IFormatDownload) {
    return this.fileSaver.save(result.blob, result.fileName);
  }
}
