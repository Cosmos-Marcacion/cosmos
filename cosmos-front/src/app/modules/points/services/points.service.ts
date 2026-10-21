import { inject, Injectable } from '@angular/core';
import { IPoint, IPointResponse } from '../interfaces/point.interface';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { IResponse } from '../../../interfaces/response.interface';
import { environment } from '../../../../environments/environment';
@Injectable({
  providedIn: 'root'
})
export class PointsService {

  private http = inject(HttpClient)

  getPoints(limit: number, page: number, search: string): Observable<IResponse<IPointResponse[]>> {
    if (search) {
      return this.http.get<IResponse<IPointResponse[]>>(`${environment.api}/point/${limit}/${page}?search=${encodeURIComponent(search)}`)
    }
    return this.http.get<IResponse<IPointResponse[]>>(`${environment.api}/point/${limit}/${page}`)
  }

  getPointsByPort(portId: string, limit: number, page: number, search: string): Observable<IResponse<IPointResponse[]>> {
    if (search) {
      return this.http.get<IResponse<IPointResponse[]>>(`${environment.api}/point/by-port/${portId}/${limit}/${page}?search=${encodeURIComponent(search)}`)
    }
    return this.http.get<IResponse<IPointResponse[]>>(`${environment.api}/point/by-port/${portId}/${limit}/${page}`)
  }

  getPoint(id: string): Observable<IPointResponse> {
    return this.http.get<IPointResponse>(`${environment.api}/point/${id}`)
  }

  createPoint(point: IPoint): Observable<IPointResponse> {
    return this.http.post<IPointResponse>(`${environment.api}/point`, point)
  }

  updatePoint(id: string, point: IPoint): Observable<IPointResponse> {
    return this.http.patch<IPointResponse>(`${environment.api}/point/${id}`, point)
  }

  deletePoint(id: string): Observable<IPointResponse> {
    return this.http.delete<IPointResponse>(`${environment.api}/point/${id}`)
  }

}
