import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PointsService } from '../services/points.service';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IPoint, IPointResponse } from '../interfaces/point.interface';
import { PortsService } from '../../ports/services/ports.service';
import { IPortResponse } from '../../ports/interfaces/port.interface';
import { NotificationService } from '../../../services/notification.service';
import { catalogName, integerInRange, requiredTrimmed } from '../../../validators/text-rules';

/** Rango acordado para las tolerancias, en minutos (CKI15). */
export const TOLERANCE_MIN = 0;
export const TOLERANCE_MAX = 240;

@Component({
  selector: 'app-add-point',
  imports: [
    ReactiveFormsModule
  ],
  templateUrl: './add-point.html',
  styleUrl: './add-point.scss'
})
export default class AddPoint {

  private pointsService = inject(PointsService)
  private router = inject(Router)
  private route = inject(ActivatedRoute)
  private formBuilder = inject(FormBuilder)
  private portsService = inject(PortsService)
  private notificationService = inject(NotificationService)
  private destroyRef = inject(DestroyRef)
  id: string = this.route.snapshot.params['id']
  readonly toleranceMin = TOLERANCE_MIN
  readonly toleranceMax = TOLERANCE_MAX

  // Las tolerancias van como texto y no como `type="number"`: con "-102e" el
  // navegador entrega `null`, el formulario lo daba por bueno y al guardar la
  // tolerancia se borraba. Como texto, el validador ve lo que se escribio.
  form = this.formBuilder.group({
    name: ['', [requiredTrimmed, catalogName]],
    portId: ['', Validators.required],
    dependOnId: [''],
    previousTolerance: ['0', [requiredTrimmed, integerInRange(TOLERANCE_MIN, TOLERANCE_MAX)]],
    nextTolerance: ['0', [requiredTrimmed, integerInRange(TOLERANCE_MIN, TOLERANCE_MAX)]]
  })
  ports = signal<IPortResponse[]>([])
  /** Puntos del puerto elegido: una dependencia solo puede ser del mismo puerto (CKI07). */
  private portPoints = signal<IPointResponse[]>([])
  dependencyOptions = computed(() => this.portPoints().filter(p => p._id !== this.id))
  loadingPoints = signal(false)
  saving = signal(false)
  /** Dependencia guardada que hay que respetar al cargar los puntos del puerto. */
  private pendingDependOnId = ''

  ngOnInit() {
    this.getPorts()
    this.form.controls.portId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(portId => this.loadPortPoints(portId ?? ''))
    if (this.id) {
      this.getPoint()
    }
  }

  getPorts() {
    this.portsService.getPorts(0, 1, '').subscribe((ports) => {
      this.ports.set(ports.data)
    })
  }

  /**
   * Carga los puntos del puerto y limpia la dependencia si ya no pertenece a
   * el. Antes se ofrecian los puntos de todos los puertos: con Callao elegido
   * aparecian los de Paita.
   */
  loadPortPoints(portId: string) {
    if (!portId) {
      this.portPoints.set([])
      this.form.controls.dependOnId.setValue('')
      return
    }
    this.loadingPoints.set(true)
    this.pointsService.getPointsByPort(portId, 0, 1, '').subscribe({
      next: (points) => {
        this.portPoints.set(points.data)
        this.loadingPoints.set(false)
        const wanted = this.pendingDependOnId || this.form.controls.dependOnId.value
        this.pendingDependOnId = ''
        const stillValid = this.dependencyOptions().some(p => p._id === wanted)
        this.form.controls.dependOnId.setValue(stillValid ? wanted : '')
      },
      error: () => {
        this.portPoints.set([])
        this.loadingPoints.set(false)
      },
    })
  }

  getPoint() {
    this.pointsService.getPoint(this.id).subscribe((point) => {
      this.pendingDependOnId = point.dependOn ? point.dependOn._id : ''
      this.form.patchValue({
        name: point.name,
        // `port` llega poblado desde la API, pero si alguna vez no lo hiciera
        // —un punto huerfano, un cambio en el endpoint— la pantalla se quedaba
        // en blanco con un TypeError. Con el desplegable vacio al menos se ve
        // el resto del formulario y el fallo es diagnosticable.
        portId: point.port?._id ?? '',
        dependOnId: this.pendingDependOnId,
        previousTolerance: String(point.previousTolerance ?? 0),
        nextTolerance: String(point.nextTolerance ?? 0)
      })
    })
  }

  goBack() {
    this.router.navigate(['/puntos'])
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched()
      return
    }
    if (this.saving()) {
      return
    }
    const value = this.form.getRawValue()
    const point = {
      name: (value.name ?? '').trim(),
      portId: value.portId ?? '',
      dependOnId: value.dependOnId ?? '',
      previousTolerance: Number(value.previousTolerance),
      nextTolerance: Number(value.nextTolerance),
    } as IPoint
    const request = this.id
      ? this.pointsService.updatePoint(this.id, point)
      : this.pointsService.createPoint(point)
    this.saving.set(true)
    request.subscribe({
      next: () => {
        this.saving.set(false)
        this.notificationService.show(
          this.id ? 'Punto actualizado correctamente' : 'Punto creado correctamente',
          'success'
        )
        this.router.navigate(['/puntos'])
      },
      // El interceptor ya muestra el mensaje de la API; aqui solo se libera el boton.
      error: () => this.saving.set(false),
    })
  }

  get name() {
    return this.form.get('name')
  }

  get portId() {
    return this.form.get('portId')
  }

  get dependOnId() {
    return this.form.get('dependOnId')
  }

  get previousTolerance() {
    return this.form.get('previousTolerance')
  }

  get nextTolerance() {
    return this.form.get('nextTolerance')
  }
}
