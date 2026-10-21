import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ScannerStatus {
    initialized: boolean;
    device_connected: boolean;
    message: string;
}

export interface ScannerResponse {
    status: 'success' | 'error';
    message?: string;
    template?: string;
    data?: ScannerStatus;
    timestamp?: number;
    client_address?: string;
}

@Injectable({
    providedIn: 'root'
})
export class ScannerService {

    isConnected = signal<boolean>(false);
    scannerStatus = signal<ScannerStatus | null>(null);
    isCapturing = signal<boolean>(false);

    private connectionStatus$ = new BehaviorSubject<boolean>(false);
    private scannerStatus$ = new BehaviorSubject<ScannerStatus | null>(null);
    private fingerprintCaptured$ = new Subject<string>();



    get connectionStatus(): Observable<boolean> {
        return this.connectionStatus$.asObservable();
    }

    get scannerStatusObservable(): Observable<ScannerStatus | null> {
        return this.scannerStatus$.asObservable();
    }

    get fingerprintCaptured(): Observable<string> {
        return this.fingerprintCaptured$.asObservable();
    }

}
