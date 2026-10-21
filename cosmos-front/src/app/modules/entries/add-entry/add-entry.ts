import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { EntriesService } from '../services/entries.service';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { IEntry } from '../interfaces/entries.interface';
import { NotificationService } from '../../../services/notification.service';
import { IEmployeeResponse } from '../../../interfaces/employee.interface';
import { PointsService } from '../../points/services/points.service';
import { IPointResponse } from '../../points/interfaces/point.interface';
import { TURNS } from '../../../constants/turns.contant';
import { INamedResponseFormat, IShiftDescription } from '../../../interfaces/named.interface';
import { NamedService } from '../../../services/named.service';
import { Observable } from 'rxjs';

const pad = (value: number) => String(value).padStart(2, '0');

/** Id de una referencia que puede llegar como id suelto o poblada. */
const idOf = (ref: string | { _id: string } | null | undefined): string =>
  typeof ref === 'string' ? ref : ref?._id ?? '';

@Component({
  selector: 'app-add-entry',
  imports: [FormsModule, ReactiveFormsModule, NgTemplateOutlet],
  templateUrl: './add-entry.html',
  styleUrl: './add-entry.scss',
})
export default class AddEntry {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private entriesService = inject(EntriesService);
  private pointsService = inject(PointsService);
  private formBuilder = inject(FormBuilder);
  private notificationService = inject(NotificationService);
  private namedService = inject(NamedService);

  id: string = this.route.snapshot.params['id'];
  form = this.formBuilder.group(
    {
      employeeId: ['', Validators.required],
      pointId: ['', Validators.required],
      date: ['', Validators.required],
      turn: ['', Validators.required],
      // Con `[null, ...]` a secas, el formulario tipado deduce que el control
      // solo puede valer `null`: cualquier `patchValue` con un id real seria un
      // error de compilacion, y el campo quedaba fuera de la comprobacion de
      // tipos justo donde mas hace falta.
      namedId: [null as string | null, Validators.required],
      time: ['', Validators.required],
      observation: [''],
    }
  );
  employees: IEmployeeResponse[] = [];
  points: IPointResponse[] = [];
  turns: string[] = TURNS
  nameds: INamedResponseFormat[] = [];
  /** Ya se consultaron las nombradas de la fecha; distingue "sin nombradas" de "cargando". */
  namedsLoaded = false;
  saving = signal(false);
  currentEmployees: IEmployeeResponse[] = [];
  namedsTurn: IShiftDescription[] = [];

  observations: string[] = [
    'Accidente',
    'Enfermedad',
    'Permiso',
    'Otros',
  ];

  goBack() {
    this.router.navigate(['/marcaciones']);
  }

  ngOnInit() {
    if (this.id) {
      // En edicion la nombrada, el turno y el empleado quedan fijos: la API
      // solo admite cambiar punto, fecha y motivo (`UpdateEntryDto`).
      this.form.controls.turn.disable();
      this.form.controls.namedId.disable();
      this.form.controls.employeeId.disable();
      this.getEntry();
    }
    this.getEmployees();
    this.getPoints();
  }

  /**
   * Cambiar la fecha invalida lo elegido para la anterior: sin limpiar, el
   * turno, la nombrada y el empleado seguian valiendo y se podia guardar una
   * marcacion contra una nombrada de otro dia.
   */
  onDateChange() {
    if (this.id) {
      return;
    }
    this.form.patchValue({ turn: '', namedId: null, employeeId: '' });
    this.namedsTurn = [];
    this.currentEmployees = [];
    this.getNameds();
  }

  getNameds() {
    this.namedsLoaded = false;
    this.namedService.getNameds({
      sInitialDate: this.namedService.formatDate(this.form.get('date')?.value || ''),
      sFinalDate: this.namedService.formatDate(this.form.get('date')?.value || ''),
    }).subscribe({
      next: (nameds) => {
        this.nameds = nameds;
        this.namedsLoaded = true;
      },
      error: () => {
        this.nameds = [];
        this.namedsLoaded = true;
      },
    });
  }

  getNamedTurns() {
    const turn = this.form.get('turn')?.value;
    const nameds = this.nameds[0]?.turns.find((named) => named.turn === turn);
    this.namedsTurn = nameds?.entries || [];
    // La nombrada y el empleado del turno anterior ya no aplican.
    this.form.patchValue({ namedId: null, employeeId: '' });
    this.currentEmployees = [];
  }

  getCurrentEmployees() {
    this.form.patchValue({ employeeId: '' });
    const namedId = this.form.get('namedId')?.value;
    const named = this.namedsTurn.find((named) => named.named.staff_transmission_id === Number(namedId));
    this.currentEmployees = named?.detail.map((employee) => ({
      _id: '',
      firstName: employee.first_name,
      lastName: employee.last_name,
      document: employee.personal_id,
    } as IEmployeeResponse)) || [];
  }

  getEmployees() {
    this.entriesService.getAllEmployees().subscribe((employees) => {
      this.employees = employees;
    });
  }

  getPoints() {
    this.pointsService.getPoints(0, 1, '').subscribe((points) => {
      this.points = points.data;
    });
  }

  /**
   * `GET /entry/:id` devuelve la marcacion sin poblar: `pointId` y
   * `employeeId` son ids, no objetos. Leer `entry.point._id` lanzaba un
   * TypeError y la edicion abria vacia.
   */
  getEntry() {
    this.entriesService.getEntry(this.id).subscribe((entry) => {
      const when = new Date(entry.date);
      const valid = !Number.isNaN(when.getTime());
      this.form.patchValue({
        employeeId: idOf(entry.employeeId ?? entry.employee),
        pointId: idOf(entry.pointId ?? entry.point),
        date: valid ? `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` : '',
        time: valid ? `${pad(when.getHours())}:${pad(when.getMinutes())}` : '',
        observation: entry.observation ?? '',
      });
    });
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.saving()) {
      return;
    }
    const formData = this.form.getRawValue();

    if (this.id) {
      // Solo lo que acepta `UpdateEntryDto`: con `time` o con el documento
      // como `employeeId` la API respondia 400 y no se guardaba nada.
      const when = new Date(`${formData.date}T${formData.time}:00`);
      this.submit(
        this.entriesService.updateEntry(this.id, {
          pointId: formData.pointId!,
          date: when.toISOString(),
          observation: formData.observation || '',
        }),
        'Marcación actualizada correctamente'
      );
      return;
    }

    const entryData: Partial<IEntry> = {
      employeeId: formData.employeeId!,
      pointId: formData.pointId!,
      date: formData.date!,
      // El desplegable entrega texto y el contrato de la API pide numero.
      // Hoy cuela porque el `ValidationPipe` del backend convierte por su
      // cuenta, pero apoyarse en eso deja el tipo mintiendo en los dos lados.
      namedId: formData.namedId ? Number(formData.namedId) : undefined,
      time: formData.time!,
      observation: formData.observation || '',
    };
    this.submit(this.entriesService.createEntry(entryData), 'Marcación creada correctamente');
  }

  private submit(request: Observable<unknown>, message: string) {
    this.saving.set(true);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.notificationService.show(message, 'success');
        this.router.navigate(['/marcaciones']);
      },
      // El interceptor ya muestra el mensaje de la API; aqui solo se libera el boton.
      error: () => this.saving.set(false),
    });
  }

  get employeeId() {
    return this.form.get('employeeId');
  }

  get pointId() {
    return this.form.get('pointId');
  }

  get date() {
    return this.form.get('date');
  }

  get time() {
    return this.form.get('time');
  }

  get namedId() {
    return this.form.get('namedId');
  }



}
