import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import AddTalkComponent from './add-talk';
import { environment } from '../../../../environments/environment';

const API = environment.api;

/** Respuesta de `named/nameds/grouped` con una nombrada por turno. */
function grouped(turns: { turn: string; id: number; vessel: string; branch: string }[]) {
  return [
    {
      turns: turns.map(t => ({
        turn: t.turn,
        entries: [
          {
            named: {
              staff_transmission_id: t.id,
              staff_vessel_number: t.vessel,
              location_id: t.branch,
            },
            detail: [],
          },
        ],
      })),
    },
  ];
}

function setup(talkId?: string) {
  TestBed.configureTestingModule({
    imports: [AddTalkComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { params: talkId ? { id: talkId } : {} } } },
    ],
  });
  spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  const fixture = TestBed.createComponent(AddTalkComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, http: TestBed.inject(HttpTestingController) };
}

function fillRequired(component: AddTalkComponent) {
  component.talkForm.patchValue({
    type: 'Charla',
    topic: 'Uso de EPP',
    summary: 'Resumen',
    area: 'Operaciones',
    place: 'Terminal',
    startTime: '08:00',
    endTime: '09:00',
    hours: 1,
    trainerId: '64b000000000000000000001',
    registerId: '64b000000000000000000002',
  });
}

describe('AddTalkComponent', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('al crear manda la nombrada del turno (staffTransmissionId), que el backend exige', () => {
    const { component, http } = setup();
    component.talkForm.patchValue({ workerDate: '2026-09-24' });
    component.getNameds();
    http.expectOne(`${API}/named/nameds/grouped`).flush(
      grouped([{ turn: '07:00 - 15:00', id: 55, vessel: '1234', branch: 'CALLAO' }])
    );
    fillRequired(component);

    component.onSubmit();

    const request = http.expectOne(`${API}/talk`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body.staffTransmissionId).toBe('55');
    expect(request.request.body.registerNumber).toBe('1234');
    expect(request.request.body.branch).toBe('CALLAO');
    request.flush({});
  });

  it('un doble envio crea la charla una sola vez', () => {
    const { component, http } = setup();
    component.talkForm.patchValue({ workerDate: '2026-09-24' });
    component.getNameds();
    http.expectOne(`${API}/named/nameds/grouped`).flush(
      grouped([{ turn: '07:00 - 15:00', id: 55, vessel: '1234', branch: 'CALLAO' }])
    );
    fillRequired(component);

    component.onSubmit();
    component.onSubmit();

    const requests = http.match(`${API}/talk`);
    expect(requests.length).toBe(1);
    requests[0].flush({});
  });

  it('al editar conserva el turno guardado en vez de pasar al primero de la fecha', () => {
    const { component, http } = setup('t1');
    http.expectOne(`${API}/talk/t1`).flush({
      _id: 't1',
      workerDate: '2026-09-24',
      turn: '15:00 - 23:00',
      place: 'Terminal',
      trainer: null,
      register: null,
    });
    http.expectOne(`${API}/named/nameds/grouped`).flush(
      grouped([
        { turn: '07:00 - 15:00', id: 55, vessel: '1234', branch: 'CALLAO' },
        { turn: '15:00 - 23:00', id: 66, vessel: '9999', branch: 'PAITA' },
      ])
    );

    expect(component.talkForm.get('turn')?.value).toBe('15:00 - 23:00');
    expect(component.staffTransmissionId).toBe('66');
    expect(component.staff_vessel_number).toBe('9999');
  });

  it('una fecha sin nombradas vacia los datos de la fecha anterior', () => {
    const { component, http } = setup();
    component.talkForm.patchValue({ workerDate: '2026-09-24' });
    component.getNameds();
    http.expectOne(`${API}/named/nameds/grouped`).flush(
      grouped([{ turn: '07:00 - 15:00', id: 55, vessel: '1234', branch: 'CALLAO' }])
    );

    component.talkForm.patchValue({ workerDate: '2026-09-25' });
    component.getNameds();
    http.expectOne(`${API}/named/nameds/grouped`).flush([]);

    expect(component.nameds).toEqual([]);
    expect(component.staffTransmissionId).toBe('');
    expect(component.branch).toBe('');
  });

  it('un turno sin nombrada no hereda la del turno anterior', () => {
    const { component, http } = setup();
    component.talkForm.patchValue({ workerDate: '2026-09-24' });
    component.getNameds();
    http.expectOne(`${API}/named/nameds/grouped`).flush(
      grouped([{ turn: '07:00 - 15:00', id: 55, vessel: '1234', branch: 'CALLAO' }])
    );

    component.talkForm.patchValue({ turn: '23:00 - 07:00' });
    component.onChangeTurn();
    fillRequired(component);
    component.onSubmit();

    expect(component.staffTransmissionId).toBe('');
    http.expectNone(`${API}/talk`);
  });
});
