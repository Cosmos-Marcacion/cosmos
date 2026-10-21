import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { PersonPicker } from '../../../components/person-picker/person-picker';
import { PersonDirectoryService } from '../../../services/person-directory.service';
import { IPersonRef } from '../../../interfaces/person.interface';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TalksService } from '../services/talks.service';
import { CommonModule } from '@angular/common';
import { NamedService } from '../../../services/named.service';
import { INamedResponseFormat } from '../../home/interfaces/named-payload.interface';
import { TURNS } from '../../../constants/turns.contant';
import { NotificationService } from '../../../services/notification.service';

@Component({
  selector: 'app-add-talk',
  imports: [ReactiveFormsModule, CommonModule, PersonPicker],
  templateUrl: './add-talk.html',
  styleUrl: './add-talk.scss',
})
export default class AddTalkComponent implements OnInit {
  private formBuilder = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private talksService = inject(TalksService);
  private namedService = inject(NamedService);
  private notificationService = inject(NotificationService);
  private personDirectory = inject(PersonDirectoryService);
  // Sin Zone.js y bajo el armazon OnPush, lo que llega por HTTP no repinta solo:
  // el formulario (que depende de `nameds`) no aparecia hasta tocar la pantalla.
  private cdr = inject(ChangeDetectorRef);

  talkForm!: FormGroup;
  talkId: string = this.route.snapshot.params['id'];

  types = [
    { value: 'Inducción', label: 'Inducción' },
    { value: 'Charla', label: 'Charla' },
    { value: 'Entrenamiento', label: 'Entrenamiento' },
    { value: 'Simulacro de emergencia', label: 'Simulacro de emergencia' },
    { value: 'Otros: TOOLBOX SEGURIDAD', label: 'Otros: TOOLBOX SEGURIDAD' },
  ];

  places = [
    { value: 'Embarcación', label: 'Embarcación' },
    { value: 'Terminal', label: 'Terminal' },
    { value: 'Oficina', label: 'Oficina' },
    { value: 'Otros', label: 'Otros' },
  ];

  turns: string[] = TURNS;
  nameds: INamedResponseFormat[] = [];
  /** Personas elegidas en el maestro de personal, no en la nombrada. */
  trainer: IPersonRef | null = null;
  register: IPersonRef | null = null;
  staff_vessel_number: string = '';
  branch: string = '';
  /**
   * Nombrada del turno elegido. El backend la exige al crear la charla
   * (`staffTransmissionId`) y la app no la enviaba: toda alta acababa en 400.
   */
  staffTransmissionId: string = '';
  private saving = false;

  constructor() {
    this.initForm();
  }

  ngOnInit() {
    if (this.talkId) {
      this.loadTalk();
    }
  }

  initForm() {
    this.talkForm = this.formBuilder.group({
      workerDate: ['', Validators.required],
      turn: ['', Validators.required],
      type: ['', Validators.required],
      topic: ['', Validators.required],
      summary: ['', Validators.required],
      isAnnual: [false],
      area: ['', Validators.required],
      place: ['', Validators.required],
      branch: [{ value: '', disabled: true }, Validators.required],
      otherPlace: [''],
      startTime: [
        '',
        [
          Validators.required,
          Validators.pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
        ],
      ],
      endTime: [
        '',
        [
          Validators.required,
          Validators.pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
        ],
      ],
      hours: [0, [Validators.required, Validators.min(0)]],
      registerNumber: [{ value: '', disabled: true }, [Validators.required]],
      trainerId: ['', Validators.required],
      registerId: ['', Validators.required],
    });
  }

  onChangeTurn() {
    // Lo dispara el <select> del turno, que ofrece todos los turnos aunque la
    // fecha elegida no tenga nombrada en alguno de ellos.
    const turn = this.nameds[0]?.turns?.find(t => t.turn === this.talkForm.get('turn')?.value);
    const named = turn?.entries?.[0]?.named;
    if (named) {
      this.applyNamed(named);
      return;
    }
    // Antes se quedaban los datos del turno anterior y la charla se guardaba
    // con la nave y la nombrada de otro turno.
    this.applyNamed(null);
    this.notificationService.show('No hay nombrada para el turno seleccionado', 'error');
  }

  /** Copia en la charla los datos de la nombrada del turno, o los vacia. */
  private applyNamed(named: { staff_vessel_number: string; location_id: string; staff_transmission_id: number } | null) {
    this.staff_vessel_number = named?.staff_vessel_number ?? '';
    this.branch = named?.location_id ?? '';
    this.staffTransmissionId = named ? String(named.staff_transmission_id) : '';
    this.talkForm.get('registerNumber')?.setValue(this.staff_vessel_number);
    this.talkForm.get('branch')?.setValue(this.branch);
  }

  verifyPlaces() {
    const currentPlace = this.talkForm.get('place')?.value;
    const issetPlace = this.places.find(p => p.value === currentPlace);
    if (!issetPlace) {
      this.talkForm.get('place')?.setValue('Otros');
      this.talkForm.get('otherPlace')?.setValue(currentPlace);
    }
  }

  getNameds() {
    this.namedService.getNameds({
      sInitialDate: this.namedService.formatDate(this.talkForm.get('workerDate')?.value),
      sFinalDate: this.namedService.formatDate(this.talkForm.get('workerDate')?.value),
    }).subscribe((nameds) => {
      // Una fecha puede volver con nombradas pero sin turnos, o con turnos sin
      // entradas. Comprobar solo `nameds.length` dejaba pasar esos dos casos y
      // la cadena de indices de abajo reventaba la pantalla.
      const turns = nameds[0]?.turns ?? [];
      const firstTurn = turns[0];
      const firstNamed = firstTurn?.entries?.[0]?.named;
      if (!firstNamed) {
        // Sin esto seguian en pantalla la nombrada y el turno de la fecha
        // anterior, y la charla se guardaba con datos de otro dia.
        this.nameds = [];
        this.applyNamed(null);
        this.notificationService.show('No hay turnos disponibles para la fecha seleccionada', 'error');
        this.cdr.markForCheck();
        return;
      }
      this.nameds = nameds;
      // Al editar se respeta el turno guardado; antes se sustituia siempre por
      // el primero de la fecha y la charla cambiaba de turno al actualizarla.
      const current = this.talkForm.get('turn')?.value;
      const keepCurrent = Boolean(this.talkId) && turns.some(t => t.turn === current);
      if (!keepCurrent) {
        this.talkForm.get('turn')?.setValue(firstTurn.turn);
      }
      this.onChangeTurn();
      if (this.talkId) {
        this.verifyPlaces();
      }
      this.cdr.markForCheck();
    });
  }

  loadTalk() {
    this.talksService.getTalk(this.talkId).subscribe((talk) => {
      this.talkForm.patchValue(talk);
      this.trainer = this.toPersonRef(talk.trainer);
      this.register = this.toPersonRef(talk.register);
      this.cdr.markForCheck();
      this.getNameds();
    });
  }

  onSubmit() {
    if (!this.talkForm.valid || this.saving) {
      return;
    }
    if (!this.staffTransmissionId) {
      this.notificationService.show('No hay nombrada para el turno seleccionado', 'error');
      return;
    }
    const formData = {
      ...this.talkForm.value,
      place: this.talkForm.get('place')?.value === 'Otros' ? this.talkForm.get('otherPlace')?.value : this.talkForm.get('place')?.value,
      registerNumber: this.staff_vessel_number,
      branch: this.branch,
      staffTransmissionId: this.staffTransmissionId,
    };

    const request = this.talkId
      ? this.talksService.updateTalk(this.talkId, formData)
      : this.talksService.createTalk(formData);
    // Evita el doble envio, que creaba la charla dos veces.
    this.saving = true;
    request.subscribe({
      next: () => this.router.navigate(['/capacitaciones']),
      error: () => (this.saving = false),
    });
  }

  onCancel() {
    this.router.navigate(['/capacitaciones']);
  }

  calculateHours() {
    const startTime = this.talkForm.get('startTime')?.value;
    const endTime = this.talkForm.get('endTime')?.value;

    if (startTime && endTime) {
      const start = new Date(`2000-01-01T${startTime}:00`);
      const end = new Date(`2000-01-01T${endTime}:00`);

      if (end < start) {
        end.setDate(end.getDate() + 1);
      }

      const diffMs = end.getTime() - start.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      this.talkForm.patchValue({
        hours: Math.round(diffHours * 100) / 100,
      });
    }
  }

  /**
   * El entrenador y el registrador no son personal de la nombrada sino de la
   * empresa, asi que salen del maestro. La charla los guarda por su
   * identificador local, que este metodo resuelve al elegir.
   */
  onSelectTrainer(person: IPersonRef | null) {
    this.trainer = person;
    if (!person) {
      this.talkForm.get('trainerId')?.setValue('');
      return;
    }
    this.personDirectory.resolveTrainer(person).subscribe((resolved) => {
      this.talkForm.get('trainerId')?.setValue(resolved._id);
      this.cdr.markForCheck();
    });
  }

  onSelectRegister(person: IPersonRef | null) {
    this.register = person;
    if (!person) {
      this.talkForm.get('registerId')?.setValue('');
      return;
    }
    this.personDirectory.resolveTrainer(person).subscribe((resolved) => {
      this.talkForm.get('registerId')?.setValue(resolved._id);
      this.cdr.markForCheck();
    });
  }

  /** Al editar una charla, la persona ya guardada se muestra en el selector. */
  private toPersonRef(trainer: any): IPersonRef | null {
    if (!trainer) {
      return null;
    }
    return {
      fullName: `${trainer.lastName ?? ''} ${trainer.firstName ?? ''}`.trim(),
      document: trainer.document ?? '',
      position: trainer.position ?? '',
      source: 'visma',
    };
  }

  capitalize(value: string) {
    const toLower = value.toLowerCase();
    return toLower.charAt(0).toUpperCase() + toLower.slice(1);
  }



}
