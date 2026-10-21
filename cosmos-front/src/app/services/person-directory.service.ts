import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { map, Observable, shareReplay, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { IPerson, IPersonRef } from '../interfaces/person.interface';
import { silent } from '../interceptors/silent-request';

/**
 * Maestro de personal propio, único origen de personas para todos los cargos
 * que se asignan desde la plataforma: jefe de cubierta, supervisor de
 * operaciones, supervisor SSOMA, entrenador, responsable del registro y los
 * aprobadores de la inspección de nave.
 *
 * Antes cada uno de esos campos era un texto libre distinto (o un desplegable
 * propio), así que la misma persona se escribía de tres formas y no había
 * manera de cruzarla con el maestro. Ahora todos consumen este servicio.
 */
@Injectable({ providedIn: 'root' })
export class PersonDirectoryService {
  private readonly url = environment.api;
  private readonly http = inject(HttpClient);

  /**
   * Respuestas cacheadas por término. El selector consulta en cada tecla y el
   * usuario borra y reescribe constantemente; sin esto se repiten las mismas
   * peticiones varias veces por campo.
   */
  private readonly cache = new Map<string, Observable<IPerson[]>>();

  /**
   * Caracteres mínimos para que el maestro responda.
   *
   * Visma TuRecibo no tiene endpoint de listado y su buscador rechaza filtros
   * de menos de tres caracteres, así que con menos no hay resultados que
   * mostrar. El backend lo declara en cada respuesta y aquí se guarda para que
   * el selector diga «escribe al menos N» en vez de «nadie coincide».
   * Con el maestro simulado vale `0` y todo sigue como antes.
   */
  readonly minLength = signal(0);

  search(search: string = '', position?: string, limit = 20): Observable<IPerson[]> {
    const term = search.trim();
    const key = `${position ?? ''}|${term.toLowerCase()}|${limit}`;

    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    const params: Record<string, string> = { limit: String(limit) };
    if (term) params['search'] = term;
    if (position) params['position'] = position;

    const request = this.http
      .get<{ source: string; minLength?: number; data: IPerson[] }>(`${this.url}/visma/personal`, {
        params,
        context: silent(),
      })
      .pipe(
        tap(response => this.minLength.set(response.minLength ?? 0)),
        map(response => response.data ?? []),
        shareReplay({ bufferSize: 1, refCount: false }),
        tap({ error: () => this.cache.delete(key) })
      );

    this.cache.set(key, request);
    return request;
  }

  /** Convierte una persona del maestro en la copia que se guarda en la ficha. */
  toRef(person: IPerson): IPersonRef {
    return {
      fullName: person.fullName,
      document: person.document,
      position: person.position,
      source: 'visma',
      externalId: person.id,
    };
  }

  /**
   * Resuelve una persona a su `Trainer` local. Las charlas siguen guardando el
   * entrenador y el responsable por identificador, así que la selección hay que
   * traducirla; el maestro sigue siendo el único sitio donde se eligen.
   */
  resolveTrainer(person: IPersonRef) {
    return this.http.post<{ _id: string; firstName: string; lastName: string }>(
      `${this.url}/trainer/resolve`,
      { fullName: person.fullName, document: person.document, position: person.position }
    );
  }

  /** Vacía la caché. Necesario tras un cambio en el maestro. */
  clearCache() {
    this.cache.clear();
  }
}
