import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { EmployeeRegisterService } from '../../modules/employee-register/services/employee-register.service';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ChekinConfirmationStateService } from '../../services/chekin-confirmation-state.service';
import { IPointsResponse } from '../../modules/employee-register/interfaces/point.interface';
import { IEmployeeResponse } from '../../modules/employee-register/interfaces/employee.interface';
import { OriginStateService } from '../../services/origin-state.service';
import { readIdentification } from '../../services/mark-identification';

/**
 * `unavailable`: el backend respondio 404 con un motivo (no esta nombrado para
 * hoy, no existe). `error`: no hubo respuesta util y se puede reintentar.
 */
export type PointsStatus = 'loading' | 'ready' | 'unavailable' | 'error';

@Component({
  selector: 'app-register-validation',
  imports: [
    FormsModule,
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './register-validation.html',
  styleUrl: './register-validation.scss'
})
export default class RegisterValidation {


  private employeeRegisterService = inject(EmployeeRegisterService)
  private checkinConfirmationStateService = inject(ChekinConfirmationStateService)
  private originStateService = inject(OriginStateService)
  private router = inject(Router)

  private route = inject(ActivatedRoute)
  points = signal<IPointsResponse[]>([])
  id: string = this.route.snapshot.params['id']

  employee = signal<IEmployeeResponse>({} as IEmployeeResponse)
  isAbsence = signal(false)
  status = signal<PointsStatus>('loading')
  /** Motivo que da el backend cuando no hay puntos que marcar. */
  reason = signal('')

  ngOnInit(): void {
    this.getEmployee()
    this.getPoints()
  }

  /**
   * Antes, si la persona no estaba en la nombrada de hoy, la respuesta era un
   * 404 y la pantalla se quedaba con el titulo "Selecciona el punto de
   * registro" y ningun punto; con una lista vacia, `points[0].isAbsence`
   * reventaba. Ahora cada caso tiene su mensaje.
   */
  getPoints() {
    this.status.set('loading')
    this.employeeRegisterService.getPointsByEmployee(this.id).subscribe({
      next: (points) => {
        this.points.set(points ?? [])
        this.isAbsence.set(!!points?.[0]?.isAbsence)
        if (!points?.length) {
          this.reason.set('No hay puntos de marcación configurados.')
          this.status.set('unavailable')
          return
        }
        this.status.set('ready')
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          const message = (error.error as { message?: unknown } | null)?.message
          this.reason.set(
            typeof message === 'string' && message.trim()
              ? message
              : 'No hay una nombrada para hoy con este empleado.'
          )
          this.status.set('unavailable')
          return
        }
        this.status.set('error')
      },
    })
  }

  getEmployee() {
    this.employeeRegisterService.getEmployee(this.id).subscribe((employee) => {
      if (employee) {
        this.employee.set(employee)
      }
    })
  }

  /** Con qué se identificó la persona; viaja con la marcación. */
  private readonly identification = readIdentification(this.route.snapshot.queryParamMap)

  register(pointId: string, namedId: string) {
    this.employeeRegisterService.checkin(this.id, pointId, namedId, this.identification).subscribe(() => {
      const origin = this.originStateService.getOrigin()
      this.checkinConfirmationStateService.show('Registro exitoso', 'success', origin || '/marcacion')
      this.originStateService.setOrigin(null as unknown as string)
    })
  }

  lastPointChecked() {
    return this.points()[this.points().length - 1]?.isChecked
  }

  goBack() {
    this.router.navigate(['/marcacion'])
  }

}
