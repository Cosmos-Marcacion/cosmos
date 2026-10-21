import { Component, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FingerprintService } from '../../services/fingerprint.service';
import { ActivatedRoute } from '@angular/router';
import { NotificationService } from '../../services/notification.service';
import { EmployeeRegisterService } from '../employee-register/services/employee-register.service';
import { IEmployeeResponse } from '../employee-register/interfaces/employee.interface';

@Component({
    selector: 'app-fingerprint-register',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './fingerprint-register.html',
    styleUrl: './fingerprint-register.scss'
})
export default class FingerprintRegister implements OnInit, OnDestroy {
    public fingerprintService = inject(FingerprintService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private notificationService = inject(NotificationService);
    private employeeRegisterService = inject(EmployeeRegisterService);

    employeeId = signal<string>(this.route.snapshot.params['id'])

    public selectedEmployeeId = signal<string>('');
    public isLoading = signal<boolean>(false);
    public message = signal<string>('');
    public employee = signal<IEmployeeResponse | null>(null);
    public loadingEmployee = signal<boolean>(false);
    private hasNotified = false;

    constructor() {
        // Efecto para notificar al registrar y navegar.
        //
        // Estaba dentro de `ngOnInit`, despues de dos `await`: fuera del contexto
        // de inyeccion `effect()` lanza NG0203, asi que nunca llegaba a crearse.
        // La huella se guardaba pero la pantalla no avisaba ni volvia a la ficha.
        effect(() => {
            const status = this.fingerprintService.enrollmentStatus();
            if (status?.step === 3 && !this.hasNotified) {
                this.hasNotified = true;
                this.notificationService.show('Huella registrada correctamente', 'success');
                // Navegar de vuelta al registro del empleado
                setTimeout(() => {
                    this.router.navigate([`/registro/${this.employeeId()}`]);
                }, 1500);
            } else if (status?.step === -1) {
                this.message.set(status.message || 'No se pudo registrar la huella. Intentelo de nuevo.');
            }
        });
    }

    async ngOnInit(): Promise<void> {
        // Limpiar estado previo
        this.fingerprintService.clearEnrollmentStatus();
        this.fingerprintService.clearIdentificationResult();

        // 1) Cargar datos del empleado
        await this.loadEmployeeData();

        // 2) Inicializar lector si fuese necesario
        try {
            if (!this.fingerprintService.isConnected()) {
                await this.fingerprintService.initializeScanner();
            }
        } catch (e) {
            this.message.set('No se pudo inicializar el lector.');
        }

        // 3) Si llega employeeId por ruta, autoseleccionar
        const routeId = (this.employeeId() || '').trim();
        if (routeId) {
            this.selectedEmployeeId.set(routeId);
            this.message.set('Pulse "Registrar" y coloque su dedo cuando se indique.');
        } else {
            this.message.set('Falta employeeId en la ruta');
        }
    }

    ngOnDestroy(): void {
        // Liberar listeners del dispositivo para evitar fugas y estados inválidos
        this.fingerprintService.ngOnDestroy();
    }

    async startRegister(): Promise<void> {
        if (!this.employeeId()) {
            this.message.set('El id del empleado es requerido');
            return;
        }

        if (!this.fingerprintService.isConnected()) {
            try {
                await this.fingerprintService.initializeScanner();
            } catch (e) {
                this.message.set('No se pudo inicializar el lector.');
                return;
            }
        }

        // Evitar dobles disparos durante captura
        if (this.fingerprintService.capturing()) {
            this.message.set('Captura en curso, espere…');
            return;
        }

        // Reset de estado de registro anterior
        this.fingerprintService.clearEnrollmentStatus();

        this.hasNotified = false;
        this.message.set('');
        await this.fingerprintService.registerFingerprint(this.employeeId(), this.employeeId());
    }

    private async loadEmployeeData(): Promise<void> {
        const employeeId = this.employeeId();
        if (!employeeId) {
            this.message.set('ID de empleado no válido');
            return;
        }

        this.loadingEmployee.set(true);
        try {
            const employeeData = await this.employeeRegisterService.getEmployee(employeeId).toPromise();
            if (employeeData) {
                this.employee.set(employeeData);
            } else {
                this.message.set('No se encontraron datos del empleado');
            }
        } catch (error) {
            console.error('Error al cargar datos del empleado:', error);
            this.message.set('Error al cargar datos del empleado');
        } finally {
            this.loadingEmployee.set(false);
        }
    }
}
