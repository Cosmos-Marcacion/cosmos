import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Icon } from '../../components/icon/icon';
import { EmployeeRegisterService } from './services/employee-register.service';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IDirectoryPerson,
  IDirectoryResponse,
  IEmployeeResponse,
} from './interfaces/employee.interface';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { CapPipe } from '../../pipes/cap-pipe';
import { FingerprintService } from '../../services/fingerprint.service';
import { ScannerService } from '../../services/scanner.service';
import { FingerprintStorageService } from '../../services/fingerprint-storage.service';
import { Observable, Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { EnrollmentStatus } from '../../services/fingerprint.service';

/** Filtros del buscador. Se combinan entre si: todos deben cumplirse. */
type FilterId = 'no-finger' | 'no-signature' | 'active';

type SortId = 'name-asc' | 'name-desc' | 'document';

const SORTS: { id: SortId; label: string }[] = [
  { id: 'name-asc', label: 'Apellido A-Z' },
  { id: 'name-desc', label: 'Apellido Z-A' },
  { id: 'document', label: 'Documento' },
];

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'no-finger', label: 'Sin huella' },
  { id: 'no-signature', label: 'Sin firma' },
  { id: 'active', label: 'Solo activos' },
];

/** Cuantos resultados se pintan de una vez. */
const RESULT_LIMIT = 40;

/**
 * Espera antes de consultar a Visma. El maestro local se filtra en memoria y
 * responde en cada tecla; Visma es una llamada de red por termino, asi que se
 * deja de teclear antes de pedirla.
 */
const REMOTE_DEBOUNCE_MS = 350;

/** Quita acentos y pasa a mayusculas, para comparar sin sorpresas. */
function norm(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

@Component({
  selector: 'app-employee-register',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, CommonModule, CapPipe, Icon],
  templateUrl: './employee-register.html',
  styleUrl: './employee-register.scss',
  providers: [CapPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class EmployeeRegister {

  private formBuilder = inject(FormBuilder)
  private employeeRegisterService = inject(EmployeeRegisterService)
  private router = inject(Router)
  private route = inject(ActivatedRoute)
  private notificationService = inject(NotificationService)
  private confirmationService = inject(ConfirmationService)
  private capPipe = inject(CapPipe)
  private fingerprintService = inject(FingerprintService);
  private scannerService = inject(ScannerService);
  private fingerprintStorageService = inject(FingerprintStorageService);

  // Signals del escáner
  isScannerConnected = this.scannerService.isConnected;
  scannerStatus = this.scannerService.scannerStatus;
  isCapturingFingerprint = this.scannerService.isCapturing;

  employeeId = signal<string>(this.route.snapshot.params['id'])

  issetFaceDescriptor = signal<boolean>(false)

  // === Buscador =============================================================
  //
  // Dos orígenes, fusionados por el backend en `GET /employee/directory`:
  //
  //  - **Cosmos**, el maestro que ya estaba sincronizado en la plataforma. Se
  //    descarga entero una vez, así que buscar, filtrar y ordenar sobre él no
  //    cuesta ni una petición más.
  //  - **Visma TuRecibo**, el maestro de RR. HH. No tiene endpoint de listado y
  //    su buscador exige al menos tres caracteres, de modo que no se puede
  //    descargar: se consulta por término, con espera, y sus resultados se
  //    suman a los locales sin repetir a quien está en los dos.
  //
  // Antes solo estaba Cosmos, y a quien no apareciera ahí no se le podía
  // registrar la huella, la firma ni el rostro.

  readonly query = signal('')
  readonly activeFilters = signal<ReadonlySet<FilterId>>(new Set())
  readonly sort = signal<SortId>('name-asc')
  readonly listOpen = signal(false)
  readonly loadingList = signal(true)

  /** Maestro local completo. */
  readonly people = signal<IDirectoryPerson[]>([])
  /** Resultados del término en curso, ya fusionados por el backend. */
  readonly remote = signal<IDirectoryPerson[]>([])
  readonly loadingRemote = signal(false)
  /** Caracteres mínimos para que Visma responda. */
  readonly minLength = signal(3)
  /** `false` cuando Visma no contestó: la lista sale solo de Cosmos. */
  readonly vismaAvailable = signal(true)

  /** Persona elegida en el buscador. La ficha cuelga de esto. */
  readonly selected = signal<IDirectoryPerson | null>(null)

  readonly sorts = SORTS
  readonly filters = FILTERS

  /** Término tecleado, para lanzar la consulta a Visma con espera. */
  private readonly terms = new Subject<string>()

  /**
   * Resultados ya filtrados y ordenados.
   *
   * La búsqueda incluye el **documento**: teclear el DNI, que es como se
   * identifica a alguien en el muelle, tiene que encontrar a la persona.
   *
   * El orden de relevancia importa cuando hay cientos de coincidencias:
   * documento exacto primero, luego prefijo de documento, luego apellido o
   * nombre que empieza por lo tecleado, y por último lo que solo lo contiene.
   *
   * Lo que llega de Visma se añade al final de la lista local en vez de
   * sustituirla: el filtrado local es instantáneo y la red no, así que la
   * lista no puede quedarse vacía mientras se espera la respuesta.
   */
  private readonly matches = computed(() => {
    const term = norm(this.query())
    const local = this.sortByRelevance(this.applyFilters(this.people()), term)

    if (!term) {
      return local
    }

    const seen = new Set(local.map(p => p.key))
    const extra = this.applyFilters(this.remote()).filter(p => !seen.has(p.key))
    return [...local, ...this.sortByRelevance(extra, term)]
  })

  readonly totalMatches = computed(() => this.matches().length)
  readonly results = computed(() => this.matches().slice(0, RESULT_LIMIT))
  readonly hiddenCount = computed(() => Math.max(0, this.totalMatches() - RESULT_LIMIT))
  readonly hasFilters = computed(() => this.activeFilters().size > 0)
  /** Cuántos de los resultados a la vista vienen solo de Visma. */
  readonly fromVisma = computed(
    () => this.results().filter(p => !p.sources.includes('cosmos')).length
  )
  readonly canAskVisma = computed(() => this.query().trim().length >= this.minLength())

  private applyFilters(list: IDirectoryPerson[]): IDirectoryPerson[] {
    const filters = this.activeFilters()
    if (filters.size === 0) {
      return list
    }
    return list.filter(person => {
      if (filters.has('no-finger') && person.issetFinger) return false
      if (filters.has('no-signature') && person.signature) return false
      if (filters.has('active') && person.status !== 'active') return false
      return true
    })
  }

  private sortByRelevance(list: IDirectoryPerson[], term: string): IDirectoryPerson[] {
    if (!term) {
      return this.sorted(list)
    }

    const scored: { person: IDirectoryPerson; score: number }[] = []
    for (const person of list) {
      const first = norm(person.firstName)
      const last = norm(person.lastName)
      const full = norm(person.fullName)
      const document = norm(person.document)

      let score = -1
      if (document === term) score = 0
      else if (document.startsWith(term)) score = 1
      else if (last.startsWith(term) || first.startsWith(term)) score = 2
      // Cada palabra cuenta como inicio: buscar "DARWIN" encuentra
      // "HIDALGO CASTILLO DARWIN JAVIER".
      else if (`${last} ${first} ${full}`.split(' ').some(word => word.startsWith(term))) score = 3
      else if (last.includes(term) || first.includes(term) || full.includes(term) || document.includes(term)) score = 4

      if (score >= 0) {
        scored.push({ person, score })
      }
    }

    // Dentro del mismo nivel de relevancia manda el criterio de orden elegido.
    const byScore = new Map<number, IDirectoryPerson[]>()
    for (const { person, score } of scored) {
      const bucket = byScore.get(score)
      bucket ? bucket.push(person) : byScore.set(score, [person])
    }
    return [...byScore.keys()]
      .sort((a, b) => a - b)
      .flatMap(score => this.sorted(byScore.get(score)!))
  }

  private sorted(list: IDirectoryPerson[]): IDirectoryPerson[] {
    const mode = this.sort()
    // Copia: ordenar en el sitio mutaría la lista maestra cacheada.
    return [...list].sort((a, b) => {
      if (mode === 'document') {
        return (a.document ?? '').localeCompare(b.document ?? '', 'es', { numeric: true })
      }
      const compared = `${a.lastName} ${a.firstName}`.localeCompare(
        `${b.lastName} ${b.firstName}`,
        'es',
        { numeric: true, sensitivity: 'base' }
      )
      return mode === 'name-desc' ? -compared : compared
    })
  }

  onQuery(value: string) {
    this.query.set(value)
    this.listOpen.set(true)
    this.terms.next(value)
  }

  clearQuery() {
    this.query.set('')
    this.remote.set([])
    this.terms.next('')
  }

  toggleFilter(id: FilterId) {
    this.activeFilters.update(set => {
      const next = new Set(set)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    this.listOpen.set(true)
  }

  clearFilters() {
    this.activeFilters.set(new Set())
  }

  setSort(value: string) {
    this.sort.set(value as SortId)
  }

  toggleList() {
    this.listOpen.update(v => !v)
  }

  closeList() {
    this.listOpen.set(false)
  }

  form = this.formBuilder.group({
    // `id` es el `staff_id` de Cosmos y deja de ser obligatorio: quien viene
    // solo de Visma no lo tiene, y aun así hay que poder registrarlo.
    id: [null as number | null],
    vismaId: [''],
    fileNumber: [''],
    firstName: [{ value: '', disabled: true }, Validators.required],
    lastName: [{ value: '', disabled: true }, Validators.required],
    document: [{ value: '', disabled: true }, Validators.required],
    image: ['', [Validators.required]],
    faceDescriptor: [[0]]
  })

  /**
   * Espejo en signal del valor del formulario.
   *
   * La aplicación va sin zone.js y este componente es `OnPush`: un
   * `patchValue()` no ensucia la vista, así que nadie volvería a evaluar lo que
   * dependa del formulario. `valueChanges` cubre `patchValue`, `setValue` y
   * `reset`, y `getRawValue` incluye los controles deshabilitados (nombre,
   * apellido y documento), que el `value` del grupo deja fuera.
   */
  private readonly formValue = signal(this.form.getRawValue())

  file = signal<File | null>(null)

  issetSignature = signal<boolean>(false)
  issetFingerprint = signal<boolean>(false)

  statusMessage: string = 'Desconectado';
  userIdToRegister: string = '';
  enrollmentStatus$!: Observable<EnrollmentStatus | null>;

  constructor() {
    this.enrollmentStatus$ = this.fingerprintService.enrollmentStatus$;
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.formValue.set(this.form.getRawValue()))

    // Consulta al buscador fusionado. `switchMap` descarta la respuesta de un
    // término que ya no está escrito, que si no puede llegar después de otra
    // más reciente y pintar resultados que no corresponden.
    this.terms
      .pipe(
        debounceTime(REMOTE_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap(term => {
          const clean = term.trim()
          if (clean.length < this.minLength()) {
            this.remote.set([])
            this.loadingRemote.set(false)
            return []
          }
          this.loadingRemote.set(true)
          // El error se absorbe dentro del `switchMap`: si llegaba al
          // `subscribe` cerraba la tuberia y, tras un solo fallo, el buscador
          // dejaba de consultar Visma hasta salir de la pantalla.
          return this.employeeRegisterService
            .getDirectory(clean)
            .pipe(catchError(() => of(null)))
        }),
        takeUntilDestroyed()
      )
      .subscribe((response: IDirectoryResponse | null) => {
        this.loadingRemote.set(false)
        if (!response) {
          this.remote.set([])
          this.vismaAvailable.set(false)
          return
        }
        this.remote.set(response.data ?? [])
        this.vismaAvailable.set(response.vismaAvailable !== false)
        this.minLength.set(response.minLength ?? this.minLength())
      })
  }

  ngOnInit() {
    this.loadDirectory();
    // Verificar si hay firma registrada cuando se regresa del componente de firma
    if (this.employeeId()) {
      this.checkSignatureStatus();
    }
  }

  checkSignatureStatus() {
    this.employeeRegisterService.getEmployee(this.employeeId()).subscribe((employee) => {
      this.issetSignature.set(employee.signature ? true : false);
    });
  }

  redirectToSignature() {
    this.router.navigate([`/signature/${this.employeeId()}`])
  }

  deleteSignature() {
    this.confirmationService.show('¿Estás seguro de que deseas eliminar la firma? Esta acción no se puede deshacer.', () => {
      if (this.employeeId()) {
        this.employeeRegisterService.deleteSignature(this.employeeId(), this.id as number).subscribe({
          next: () => {
            this.notificationService.show('Firma eliminada correctamente', 'success');
            this.issetSignature.set(false);
          },
          error: () => {
            this.notificationService.show('Error al eliminar la firma', 'error');
          }
        });
      } else {
        this.notificationService.show('Error: ID de empleado no válido', 'error');
      }
    });
  }

  /** Ficha local abierta desde la ruta `/registro/:id`. */
  getEmployee() {
    this.employeeRegisterService.getEmployee(this.employeeId()).subscribe((employee) => {
      this.fillFromEmployee(employee)
      this.employeeId.set(employee._id)
      this.issetFaceDescriptor.set(employee.faceDescriptor?.length > 0)
      this.issetSignature.set(employee.signature ? true : false)
      this.issetFingerprint.set(!!employee.fingerprintId)
    })
  }

  deleteFingerprint() {
    this.confirmationService.show('¿Estás seguro de que deseas eliminar el registro de huella? Esta acción no se puede deshacer.', () => {
      this.employeeRegisterService.deleteFingerprint(this.employeeId()).subscribe({
        next: () => {
          this.notificationService.show('Registro de huella eliminado correctamente', 'success');
          this.issetFingerprint.set(false);
        },
        error: () => {
          this.notificationService.show('Error al eliminar el registro de huella', 'error');
        }
      });
    });
  }

  deleteFaceDescriptor() {
    this.confirmationService.show('¿Estás seguro de que deseas eliminar el registro facial? Esta acción no se puede deshacer.', () => {
      this.employeeRegisterService.deleteFaceDescriptor(this.employeeId()).subscribe({
        next: () => {
          this.notificationService.show('Registro facial eliminado correctamente', 'success');
          this.issetFaceDescriptor.set(false);
          this.form.patchValue({ faceDescriptor: [] });
        },
        error: () => {
          this.notificationService.show('Error al eliminar el registro facial', 'error');
        }
      });
    });
  }

  /** Hay un alta o una actualizacion en vuelo. */
  readonly saving = signal(false)

  save() {
    // Un doble toque en "Guardar" mandaba dos altas del mismo empleado.
    if (this.saving()) {
      return
    }
    if (this.employeeId()) {
      this.updateEmployee()
    } else {
      this.saveEmployee()
    }
  }

  saveEmployee() {
    this.saving.set(true)
    this.employeeRegisterService.saveEmployee(this.transformToFormData()).subscribe({
      next: (response) => {
        this.saving.set(false)
        this.employeeId.set(response._id.toString())
        this.notificationService.show('Empleado registrado correctamente', 'success')
        this.router.navigate([`/registro/${response._id}`])
      },
      error: () => this.saving.set(false),
    })
  }

  updateEmployee() {
    this.saving.set(true)
    this.employeeRegisterService.updateEmployee(this.employeeId(), this.transformToFormData()).subscribe({
      next: (response) => {
        this.saving.set(false)
        this.notificationService.show('Empleado actualizado correctamente', 'success')
        this.router.navigate([`/registro/${response._id}`])
      },
      error: () => this.saving.set(false),
    })
  }

  transformToFormData() {
    const formData = new FormData()
    if (this.file()) {
      formData.append('image', this.file() as File)
    } else {
      formData.append('image', this.image || '')
    }
    formData.append('firstName', this.firstName || '')
    formData.append('lastName', this.lastName || '')
    formData.append('document', this.document || '')
    // Solo se manda lo que la persona tiene. Quien viene de Visma no tiene
    // `staff_id`, y mandarlo vacío guardaba un `NaN` en la ficha.
    if (this.id) {
      formData.append('id', this.id.toString())
    }
    const vismaId = this.formValue().vismaId
    if (vismaId) {
      formData.append('vismaId', vismaId)
    }
    const fileNumber = this.formValue().fileNumber
    if (fileNumber) {
      formData.append('fileNumber', fileNumber)
    }
    return formData
  }

  reset() {
    this.form.reset()
    this.issetFaceDescriptor.set(false)
    this.issetFingerprint.set(false)
    this.issetSignature.set(false)
    this.employeeId.set('')
    this.selected.set(null)
    this.closeList()
    this.query.set('')
  }

  /** Maestro local completo, con el que arranca el buscador. */
  loadDirectory() {
    this.loadingList.set(true)
    this.employeeRegisterService.getDirectory('', 500).subscribe({
      next: (response) => {
        this.people.set(response.data ?? [])
        this.minLength.set(response.minLength ?? this.minLength())
        this.loadingList.set(false)
        if (this.employeeId()) {
          this.getEmployee()
        }
      },
      error: () => {
        this.people.set([])
        this.loadingList.set(false)
      },
    })
  }

  /**
   * Persona elegida en la lista. Hay tres casos, y hasta ahora solo se
   * contemplaba el segundo:
   *
   *  1. Ya tiene ficha en la plataforma: se abre esa ficha, con sus registros
   *     biométricos.
   *  2. Está en Cosmos pero sin ficha: se rellena con lo que trae el maestro.
   *  3. Está solo en Visma: se pide su ficha completa, que es lo único que
   *     separa nombres de apellidos y trae el legajo.
   */
  selectEmployee(person: IDirectoryPerson) {
    this.reset()
    this.selected.set(person)
    this.fillFromDirectory(person)

    if (person.employeeId) {
      this.employeeId.set(person.employeeId)
      this.getEmployee()
      return
    }

    if (person.id !== undefined && person.id !== null) {
      this.employeeRegisterService.getEmployeeByIdBS(person.id).subscribe({
        // Sin ficha local la respuesta llega vacía: es el caso normal de dar de
        // alta a alguien nuevo, y el formulario ya está relleno.
        next: (employee) => employee && this.applyLocalRecord(employee),
        error: () => {
          this.notificationService.show('No se pudo consultar el registro previo del empleado', 'error')
        },
      })
      return
    }

    if (person.vismaId) {
      this.employeeRegisterService.getVismaPerson(person.vismaId).subscribe({
        next: ({ data }) => {
          this.form.patchValue({
            firstName: this.capPipe.transform((data.firstName ?? person.firstName).toLowerCase()) as string,
            lastName: this.capPipe.transform((data.lastName ?? person.lastName).toLowerCase()) as string,
            document: data.document || person.document,
            fileNumber: data.fileNumber ?? person.fileNumber ?? '',
            vismaId: data.id,
          })
        },
        error: () => {
          // El buscador ya trae nombre y documento; sin la ficha se registra
          // igual, solo se pierden el legajo y el corte exacto del apellido.
          this.notificationService.show('No se pudo consultar la ficha de Visma', 'error')
        },
      })
    }
  }

  /** Rellena el formulario con lo que ya trae el buscador. */
  private fillFromDirectory(person: IDirectoryPerson) {
    this.form.patchValue({
      firstName: this.capPipe.transform(person.firstName.toLowerCase()) as string,
      lastName: this.capPipe.transform(person.lastName.toLowerCase()) as string,
      document: person.document,
      image: '/images/user.png',
      id: person.id ?? null,
      vismaId: person.vismaId ?? '',
      fileNumber: person.fileNumber ?? '',
    })
    this.issetFingerprint.set(person.issetFinger)
    this.issetSignature.set(Boolean(person.signature))
    this.closeList()
    this.query.set('')
  }

  /** Completa el formulario con la ficha local ya guardada. */
  private applyLocalRecord(employee: IEmployeeResponse) {
    this.employeeId.set(employee._id)
    this.form.patchValue({
      image: employee.image || '/images/user.png',
      faceDescriptor: (employee.faceDescriptor ?? []) as number[],
    })
    this.issetFaceDescriptor.set((employee.faceDescriptor?.length ?? 0) > 0)
    this.issetFingerprint.set(!!employee.fingerprintId)
    this.issetSignature.set(!!employee.signature)
  }

  /** Rellena la ficha desde el empleado local, sin pasar por el buscador. */
  private fillFromEmployee(employee: IEmployeeResponse) {
    this.form.patchValue({
      firstName: this.capPipe.transform((employee.firstName ?? '').toLowerCase()) as string,
      lastName: this.capPipe.transform((employee.lastName ?? '').toLowerCase()) as string,
      document: employee.document,
      faceDescriptor: (employee.faceDescriptor ?? []) as number[],
      id: employee.id ?? null,
      image: employee.image,
    })
    if (!this.selected()) {
      this.selected.set({
        key: employee.document,
        employeeId: employee._id,
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        fullName: `${employee.lastName} ${employee.firstName}`,
        document: employee.document,
        status: employee.status,
        issetFinger: !!employee.fingerprintId,
        signature: employee.signature ?? '',
        sources: ['cosmos'],
      })
    }
  }

  redirectToFace() {
    this.router.navigate([`/face/${this.employeeId()}`])
  }

  onUploadImage(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (file) {
      this.file.set(file)
      this.form.patchValue({
        image: URL.createObjectURL(file)
      })
    }
  }

  async captureFingerprint() {
    this.router.navigate([`/fingerprint-register/${this.employeeId()}`])
  }

  // Los getters leen del espejo en signal, no del `FormGroup`: es lo que hace
  // que la plantilla se repinte cuando el formulario cambia desde una
  // respuesta HTTP. Ver `formValue`.

  get id() {
    return this.formValue().id
  }

  get faceDescriptor() {
    return this.formValue().faceDescriptor
  }

  get firstName() {
    return this.formValue().firstName
  }

  get lastName() {
    return this.formValue().lastName
  }

  get document() {
    return this.formValue().document
  }

  get image() {
    return this.formValue().image
  }
}
