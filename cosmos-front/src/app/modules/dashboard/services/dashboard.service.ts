import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { IAssistancesResponse, IDashboardFilters, IDashboardResponse, IFiltersDashboardData, INamedsResponse } from '../interfaces/dashboard.interface';
import { map, Observable, shareReplay, tap } from 'rxjs';

const EMPTY_PAGE = { data: [], total: 0, page: 1, limit: 10 };

@Injectable({
  providedIn: 'root'
})
export class DashboardService {

  private url = environment.api
  private http = inject(HttpClient)
  /** Los catálogos de los desplegables no cambian dentro de una sesión. */
  private filters$?: Observable<IFiltersDashboardData>

  getDashboard(filters: IDashboardFilters) {
    return this.http.post<IDashboardResponse>(`${this.url}/entry/dashboard`, filters);
  }

  getDashboardAssistances(filters: IDashboardFilters) {
    return this.http.post<IAssistancesResponse>(`${this.url}/entry/dashboard/assistances`, filters).pipe(
      map((res) => this.normalizePage<IAssistancesResponse>(res, filters))
    );
  }

  getDashboardNameds(filters: IDashboardFilters) {
    // El backend ya ordena por fecha antes de paginar. Reordenar aquí sólo
    // reordenaba la página visible, y `res.data.sort(...)` reventaba cuando la
    // respuesta llegaba sin filas.
    return this.http.post<INamedsResponse>(`${this.url}/entry/dashboard/nameds`, filters).pipe(
      map((res) => this.normalizePage<INamedsResponse>(res, filters))
    );
  }

  getDashboardFilters() {
    if (!this.filters$) {
      this.filters$ = this.http.get<IFiltersDashboardData>(`${this.url}/entry/dashboard/filters`).pipe(
        tap((res) => {
          res.employees = (res.employees ?? []).sort((a, b) => a.firstName.trim().localeCompare(b.firstName.trim()));
          res.ships = (res.ships ?? []).sort((a, b) => a.trim().localeCompare(b.trim()));
          res.positions = (res.positions ?? []).sort((a, b) => a.trim().localeCompare(b.trim()));
          res.nameds = (res.nameds ?? []).sort((a, b) => b.trim().localeCompare(a.trim()));
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.filters$;
  }

  /** Una respuesta paginada incompleta no debe romper la tabla que la pinta. */
  private normalizePage<T extends { data: any[]; total: number; page: number; limit: number }>(
    res: T,
    filters: IDashboardFilters
  ): T {
    return {
      ...EMPTY_PAGE,
      ...(res ?? {}),
      page: res?.page ?? filters.page ?? 1,
      limit: res?.limit ?? filters.limit ?? 10,
      total: typeof res?.total === 'number' ? res.total : 0,
      data: Array.isArray(res?.data) ? res.data : [],
    } as T;
  }
}
