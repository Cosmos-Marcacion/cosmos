import { Component, computed, inject, signal } from '@angular/core';
import { EmployeeRegisterService } from '../../employee-register/services/employee-register.service';
import { Router } from '@angular/router';
import { NavigationStateService } from '../../../services/navigation-state.service';
import { HttpErrorResponse } from '@angular/common/http';
import { Icon } from '../../../components/icon/icon';
import { identificationParams } from '../../../services/mark-identification';

/**
 * DNI (8 digitos) o carne de extranjeria (hasta 12). Antes la busqueda solo se
 * lanzaba al llegar exactamente a 8 caracteres: un carne nunca buscaba y la
 * pantalla no tenia ningun boton, asi que no habia forma de saber como seguir.
 */
export const DOCUMENT_PATTERN = /^\d{8,12}$/;

export type DniStatus = 'idle' | 'loading' | 'not-found' | 'error';

@Component({
  selector: 'app-dni',
  imports: [Icon],
  templateUrl: './dni.html',
  styleUrl: './dni.scss'
})
export default class Dni {

  private router = inject(Router)
  private navigationStateService = inject(NavigationStateService)

  private employeeRegisterService = inject(EmployeeRegisterService)

  readonly document = signal('')
  readonly status = signal<DniStatus>('idle')
  /** Documento de la ultima busqueda, para el mensaje de "no encontrado". */
  readonly searched = signal('')

  readonly canSearch = computed(
    () => DOCUMENT_PATTERN.test(this.document()) && this.status() !== 'loading'
  )

  onInput(event: Event) {
    const input = event.target as HTMLInputElement
    // Solo digitos: el teclado numerico de algunos Android deja pasar puntos y guiones.
    const clean = input.value.replace(/\D/g, '').slice(0, 12)
    if (clean !== input.value) {
      input.value = clean
    }
    this.document.set(clean)
    // Al corregir el documento, el aviso anterior ya no aplica.
    if (this.status() === 'not-found' || this.status() === 'error') {
      this.status.set('idle')
    }
  }

  clear() {
    this.document.set('')
    this.status.set('idle')
  }

  search() {
    if (!this.canSearch()) {
      return
    }
    const dni = this.document()
    this.searched.set(dni)
    this.status.set('loading')
    this.employeeRegisterService.getByDni(dni).subscribe({
      next: (employee) => {
        if (!employee) {
          this.status.set('not-found')
          return
        }
        this.status.set('idle')
        this.navigationStateService.markInternalNavigation();
        this.router.navigate([`/validacion-registro/${employee._id}`], {
          queryParams: identificationParams({ method: 'documento' }),
        })
      },
      error: (error: unknown) => {
        const notFound = error instanceof HttpErrorResponse && error.status === 404
        this.status.set(notFound ? 'not-found' : 'error')
      },
    })
  }

  goBack() {
    this.router.navigate(['/marcacion'])
  }
}
