import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { IResponse } from '../../../interfaces/response.interface';
import { Observable } from 'rxjs';
import { IPort, IPortResponse } from '../interfaces/port.interface';

@Injectable({
  providedIn: 'root'
})
export class PortsService {

  private http = inject(HttpClient)
  private url = environment.api

  // La ruta es `/port/:limit/:page`; los parametros estaban nombrados al reves
  // y las llamadas pasaban `(0, 0)`, es decir, pagina 0.
  getPorts(limit: number, page: number, search: string = ''): Observable<IResponse<IPortResponse[]>> {
    if (search) {
      return this.http.get<IResponse<IPortResponse[]>>(`${this.url}/port/${limit}/${page}?search=${encodeURIComponent(search)}`)
    }
    return this.http.get<IResponse<IPortResponse[]>>(`${this.url}/port/${limit}/${page}`)
  }

  getPort(id: string): Observable<IPortResponse> {
    return this.http.get<IPortResponse>(`${this.url}/port/${id}`)
  }

  createPort(port: IPort): Observable<IPortResponse> {
    return this.http.post<IPortResponse>(`${this.url}/port`, port)
  }

  updatePort(id: string, port: IPort): Observable<IPortResponse> {
    return this.http.patch<IPortResponse>(`${this.url}/port/${id}`, port)
  }

  deletePort(id: string): Observable<IPortResponse> {
    return this.http.delete<IPortResponse>(`${this.url}/port/${id}`)
  }
}
