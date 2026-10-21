import { ChangeDetectorRef, Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { EmployeeRegisterService } from '../../employee-register/services/employee-register.service';
import { IListStaff, IListStaffEmployee } from '../interfaces/named-payload.interface';
import { IEmployeeResponse } from '../../employee-register/interfaces/employee.interface';
import { ConfirmationService } from '../../../services/confirmation.service';
import { NotificationService } from '../../../services/notification.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CapPipe } from '../../../pipes/cap-pipe';
import { IPointsResponse } from '../../employee-register/interfaces/point.interface';
import { OriginStateService } from '../../../services/origin-state.service';
import { NavigationStateService } from '../../../services/navigation-state.service';

@Component({
  selector: 'app-employee-detail',
  imports: [
    CommonModule,
    FormsModule,
    CapPipe
  ],
  templateUrl: './employee-detail.html',
  styleUrl: './employee-detail.scss'
})
export default class EmployeeDetail implements OnInit, OnDestroy {

  private confirmationService = inject(ConfirmationService)
  private notificationService = inject(NotificationService)
  private router = inject(Router)
  private route = inject(ActivatedRoute)
  private employeeRegisterService = inject(EmployeeRegisterService)
  private navigationStateService = inject(NavigationStateService)
  private cdr = inject(ChangeDetectorRef)
  id = this.route.snapshot.params['id']
  date = this.route.snapshot.params['date']
  staffTransmissionId = this.route.snapshot.params['staffTransmissionId']
  points: IPointsResponse[] = []
  employee: IEmployeeResponse = {} as IEmployeeResponse
  nameds!: IListStaff
  named!: IListStaffEmployee
  isRemate = false
  canRegisterAbsence = false
  /** Hay una falta ya registrada, asi que lo que procede es cancelarla. */
  hasAbsence = false
  disabledAbsence = signal(false)
  originStateService = inject(OriginStateService)

  ngOnInit() {
    if (this.id && this.staffTransmissionId) {
      this.getEmployee()
    } else {
      this.notificationService.show('No se encontró el empleado', 'error')
      this.router.navigate(['/inicio'], { replaceUrl: true })
    }
  }

  ngOnDestroy() {
    // Limpiar el estado al destruir el componente
  }

  getEmployee() {
    this.employeeRegisterService.getEntriesEmployee(this.id, this.staffTransmissionId, this.date).subscribe((res) => {
      this.points = res.points ?? []
      this.employee = res.employee ?? ({} as IEmployeeResponse)
      this.nameds = res.nameds
      this.named = res.named
      this.verifyRemate()
      this.verifyCanRegisterAbsence()
      this.verifyDisabledAbsence()
      // Sin Zone.js y bajo el armazon OnPush, asignar campos sueltos desde la
      // respuesta no repinta: la ficha se quedaba vacia hasta tocar la pantalla.
      this.cdr.markForCheck()
    })
  }

  verifyDisabledAbsence() {
    this.disabledAbsence.set(this.points.some(point => point.isChecked))
  }



  zeroDatePad(value: number) {
    if (value < 10) {
      return `0${value}`
    }
    return value
  }

  verifyRemate() {
    if (this.points.length === 0) {
      this.isRemate = false
      return
    }
    const today = `${new Date().getFullYear()}-${this.zeroDatePad(new Date().getMonth() + 1)}-${this.zeroDatePad(new Date().getDate())}`
    this.isRemate = today === this.date && this.points[0].isChecked && !this.points[this.points.length - 1].isChecked
  }

  /**
   * Estado de la falta.
   *
   * Son dos cosas distintas y antes se guardaban en una sola bandera:
   * `verifyRemate` calculaba "se puede registrar" (mismo dia y sin marcaciones)
   * y acto seguido `verifyCanRegisterAbsence` la sobreescribia con "no hay falta
   * registrada", que es lo que de verdad usaba la plantilla para decidir entre
   * "Registrar falta" y "Cancelar falta". El resultado era que el boton de
   * registrar aparecia tambien sobre nombradas de dias pasados.
   *
   * Ahora `hasAbsence` decide cual de los dos botones se ve y
   * `canRegisterAbsence` decide si el de registrar tiene sentido.
   */
  verifyCanRegisterAbsence() {
    if (this.points.length === 0) {
      this.hasAbsence = false
      this.canRegisterAbsence = false
      return
    }
    const today = `${new Date().getFullYear()}-${this.zeroDatePad(new Date().getMonth() + 1)}-${this.zeroDatePad(new Date().getDate())}`
    this.hasAbsence = Boolean(this.points[0].isAbsence)
    this.canRegisterAbsence =
      !this.hasAbsence &&
      today === this.date &&
      this.points.every(point => !point.isChecked)
  }


  // Listeners eliminados: la navegación por back se gestiona via CanDeactivate guard

  goBack() {
    this.router.navigate(['/inicio'], { replaceUrl: true })
  }

  confirmRemate() {
    this.confirmationService.show('¿Estás seguro de realizar esta acción?', () => {
      this.employeeRegisterService.remate(this.id).subscribe(response => {
        this.notificationService.show(response.message, response.status, 10000)
        this.getEmployee()
      })
    })
  }

  confirmAbsence() {
    this.confirmationService.show('¿Estás seguro de registrar la falta del empleado?', () => {
      const firstPoint = this.points[0]

      this.employeeRegisterService.registerAbsence(
        firstPoint._id,
        this.id,
        this.date,
        this.staffTransmissionId
      ).subscribe(() => {
        this.notificationService.show('Falta registrada correctamente', 'success')
        this.getEmployee()
      })
    })
  }

  cancelAbsence() {
    this.confirmationService.show('¿Estás seguro de cancelar la falta del empleado?', () => {
      this.employeeRegisterService.cancelAbsence(this.id, this.date, this.staffTransmissionId, this.points[0]._id).subscribe(() => {
        this.notificationService.show('Falta cancelada correctamente', 'success')
        this.getEmployee()
      })
    })
  }

  redirectToMarcacion() {
    this.originStateService.setOrigin(`/detalle-empleado/${this.id}/${this.staffTransmissionId}/${this.date}`)
    this.navigationStateService.markInternalNavigation()
    this.router.navigate([`/validacion-registro/${this.id}`])
  }



}
