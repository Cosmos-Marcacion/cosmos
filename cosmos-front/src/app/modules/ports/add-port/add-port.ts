import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PortsService } from '../services/ports.service';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IPort } from '../interfaces/port.interface';
import { NotificationService } from '../../../services/notification.service';
import { catalogName, requiredTrimmed } from '../../../validators/text-rules';

@Component({
  selector: 'app-add-port',
  imports: [FormsModule, ReactiveFormsModule],
  templateUrl: './add-port.html',
  styleUrl: './add-port.scss'
})
export default class AddPort {

  private router = inject(Router)
  private route = inject(ActivatedRoute)
  private portsService = inject(PortsService)
  private formBuilder = inject(FormBuilder)
  private notificationService = inject(NotificationService)

  id: string = this.route.snapshot.params['id']
  saving = signal(false)
  // `requiredTrimmed` y no `Validators.required`: con tres espacios el campo
  // contaba como relleno y GUARDAR se habilitaba (CKI05).
  form = this.formBuilder.group({
    name: ['', [requiredTrimmed, catalogName]],
    address: ['', requiredTrimmed]
  })

  goBack() {
    this.router.navigate(['/puertos'])
  }

  ngOnInit() {
    if (this.id) {
      this.getPort()
    }
  }

  getPort() {
    this.portsService.getPort(this.id).subscribe((port) => {
      this.form.patchValue(port)
    })
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched()
      return
    }
    if (this.saving()) {
      return
    }
    const port: IPort = {
      name: (this.form.value.name ?? '').trim(),
      address: (this.form.value.address ?? '').trim(),
    } as IPort
    const request = this.id
      ? this.portsService.updatePort(this.id, port)
      : this.portsService.createPort(port)
    this.saving.set(true)
    request.subscribe({
      next: () => {
        this.saving.set(false)
        this.notificationService.show(
          this.id ? 'Puerto actualizado correctamente' : 'Puerto creado correctamente',
          'success'
        )
        this.router.navigate(['/puertos'])
      },
      // El interceptor ya muestra el mensaje de la API; aqui solo se libera el boton.
      error: () => this.saving.set(false),
    })
  }

  get name() {
    return this.form.get('name')
  }
  get address() {
    return this.form.get('address')
  }


}
