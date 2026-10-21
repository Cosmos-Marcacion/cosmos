import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
@Injectable({
  providedIn: 'root'
})
export class UploadService {

  baseUrl = environment.api

  constructor(private http: HttpClient) { }

  upload(file: File, resourceType: string = 'image'): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('resourceType', resourceType);
    return this.http.post<any>(`${this.baseUrl}/upload`, formData);
  }



}
