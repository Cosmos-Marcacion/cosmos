import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { handled } from '../../../interceptors/handled-error';
import {
  IDefinitionDiff,
  IDefinitionResponse,
  IDefinitionSummary,
  IDefinitionVersion,
  IFormatCatalog,
  IFormatDefinition,
  IResolvedFormat,
  IValidationIssue,
} from '../interfaces/format-document.interface';

@Injectable({ providedIn: 'root' })
export class FormatsService {
  private url = environment.api;
  private http = inject(HttpClient);

  /**
   * El documento resuelto de una nombrada: el mismo modelo del que salen el
   * Excel y el PDF. Mismos cortes de página y mismos correlativos.
   */
  getDocument(staffTransmissionId: number, workerDate: string, formatType?: string) {
    const params: Record<string, string> = { workerDate };
    if (formatType) {
      params['formatType'] = formatType;
    }
    return this.http.get<IResolvedFormat>(
      `${this.url}/format/${staffTransmissionId}/document`,
      { params, context: handled() }
    );
  }

  // --- maestro ---------------------------------------------------------------

  /**
   * Las peticiones del maestro van marcadas como `handled`.
   *
   * Cada fallo lo cuenta la pantalla en su sitio y con lo que hay que hacer
   * ("el borrador sigue guardado tal como estaba"). Sin la marca sale además el
   * aviso genérico del interceptor con el mensaje del servidor, y el usuario lee
   * dos cosas distintas sobre lo mismo.
   */
  getCatalog() {
    return this.http.get<IFormatCatalog>(`${this.url}/format/definitions/catalog`, {
      context: handled(),
    });
  }

  listDefinitions() {
    return this.http.get<IDefinitionSummary[]>(`${this.url}/format/definitions`, {
      context: handled(),
    });
  }

  getDefinition(formatType: string) {
    return this.http.get<IDefinitionResponse>(`${this.url}/format/definitions/${formatType}`, {
      context: handled(),
    });
  }

  saveDraft(formatType: string, definition: IFormatDefinition) {
    return this.http.put<{ definition: IFormatDefinition; issues: IValidationIssue[] }>(
      `${this.url}/format/definitions/${formatType}/draft`,
      definition,
      { context: handled() }
    );
  }

  /**
   * Carga un borrador que se habia quedado atras, tal como se guardo.
   *
   * Es una accion aparte y explicita: por defecto se sirve lo publicado, que es
   * lo que emite los formatos.
   */
  recoverDraft(formatType: string) {
    return this.http.post<{ draft: IFormatDefinition; issues: IValidationIssue[] }>(
      `${this.url}/format/definitions/${formatType}/draft/recover`,
      {},
      { context: handled() }
    );
  }

  discardDraft(formatType: string) {
    return this.http.delete<IFormatDefinition>(
      `${this.url}/format/definitions/${formatType}/draft`,
      { context: handled() }
    );
  }

  publish(formatType: string) {
    return this.http.post<IFormatDefinition>(
      `${this.url}/format/definitions/${formatType}/publish`,
      {},
      { context: handled() }
    );
  }

  /** Rehace la definición desde las plantillas del cliente. */
  restoreFactory(formatType: string) {
    return this.http.post<IFormatDefinition>(
      `${this.url}/format/definitions/${formatType}/restore`,
      {},
      { context: handled() }
    );
  }

  listVersions(formatType: string) {
    return this.http.get<IDefinitionVersion[]>(
      `${this.url}/format/definitions/${formatType}/versions`,
      { context: handled() }
    );
  }

  /** La definición completa tal como estaba en una publicación. */
  getVersion(formatType: string, version: number) {
    return this.http.get<IFormatDefinition>(
      `${this.url}/format/definitions/${formatType}/versions/${version}`
    );
  }

  /**
   * Qué cambió en una publicación respecto a la anterior, o a la que se
   * indique en `against`. Lo compara el servidor: ver `IDefinitionDiff`.
   */
  getVersionChanges(formatType: string, version: number, against?: number) {
    const params: Record<string, string> =
      against === undefined ? {} : { against: String(against) };
    return this.http.get<IDefinitionDiff>(
      `${this.url}/format/definitions/${formatType}/versions/${version}/changes`,
      { params, context: handled() }
    );
  }

  /** Qué cambiaría al publicar el borrador. La parte del historial aún no ocurrida. */
  getDraftChanges(formatType: string) {
    return this.http.get<IDefinitionDiff>(
      `${this.url}/format/definitions/${formatType}/draft/changes`,
      { context: handled() }
    );
  }

  revertTo(formatType: string, version: number) {
    return this.http.post<IFormatDefinition>(
      `${this.url}/format/definitions/${formatType}/revert/${version}`,
      {},
      { context: handled() }
    );
  }
}
