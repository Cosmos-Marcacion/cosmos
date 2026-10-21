import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface FingerprintTemplate {
    employeeId: string;
    template: string;
    capturedAt: Date;
    quality?: number;
}

export interface FingerprintVerification {
    employeeId: string;
    template: string;
}

@Injectable({
    providedIn: 'root'
})
export class FingerprintStorageService {
    private http = inject(HttpClient);
    private backendUrl = environment.api;

    /**
     * Almacena el template de huella dactilar de un empleado
     */
    storeFingerprint(fingerprint: FingerprintTemplate): Observable<any> {
        return this.http.post(`${this.backendUrl}/fingerprint/store`, fingerprint);
    }

    /**
     * Verifica una huella dactilar contra las almacenadas
     */
    verifyFingerprint(verification: FingerprintVerification): Observable<any> {
        return this.http.post(`${this.backendUrl}/fingerprint/verify`, verification);
    }

    /**
     * Obtiene el template de huella dactilar de un empleado
     */
    getFingerprint(employeeId: string): Observable<any> {
        return this.http.get(`${this.backendUrl}/fingerprint/${employeeId}`);
    }

    /**
     * Elimina el template de huella dactilar de un empleado
     */
    deleteFingerprint(employeeId: string): Observable<any> {
        return this.http.delete(`${this.backendUrl}/fingerprint/${employeeId}`);
    }

    /**
     * Obtiene la lista de empleados con huellas dactilares registradas
     */
    getEmployeesWithFingerprints(): Observable<any> {
        return this.http.get(`${this.backendUrl}/fingerprint/employees`);
    }

    /**
     * Actualiza el template de huella dactilar de un empleado
     */
    updateFingerprint(employeeId: string, template: string): Observable<any> {
        return this.http.put(`${this.backendUrl}/fingerprint/${employeeId}`, { template });
    }

    /**
     * Verifica la calidad de un template de huella dactilar
     */
    checkTemplateQuality(template: string): Observable<any> {
        return this.http.post(`${this.backendUrl}/fingerprint/quality-check`, { template });
    }

    /**
     * Obtiene estadísticas de las huellas dactilares
     */
    getFingerprintStats(): Observable<any> {
        return this.http.get(`${this.backendUrl}/fingerprint/stats`);
    }
}
