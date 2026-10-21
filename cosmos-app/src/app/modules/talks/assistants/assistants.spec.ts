import { ComponentFixture, TestBed } from '@angular/core/testing';

import Assistants from './assistants';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';

const API = environment.api;

describe('Assistants', () => {
  let component: Assistants;
  let fixture: ComponentFixture<Assistants>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Assistants],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { params: { id: 'talk1', workerDate: '2026-09-24', turn: '07:00 - 15:00' } } },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Assistants);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  /** Responde a las tres cargas iniciales (charla, empleados y asistentes). */
  function flushInitial(assistants: { _id: string; isAssistant: boolean }[]) {
    http.expectOne(`${API}/talk/talk1`).flush({ _id: 'talk1', turn: '07:00 - 15:00' });
    http.expectOne(`${API}/employee`).flush([]);
    http.expectOne(`${API}/named/date-turn`).flush(
      assistants.map(a => ({ ...a, name: 'Ana Diaz', document: '1', signature: '', isAbsence: false, isEntry: false }))
    );
  }

  it('should create', () => {
    flushInitial([]);
    expect(component).toBeTruthy();
  });

  it('sin personal en la nombrada "Seleccionar todos" no sale marcada', () => {
    flushInitial([]);
    expect(component.checkedAll).toBe(false);
  });

  it('al desmarcar borra el registro de esta charla, no uno cualquiera del empleado', () => {
    flushInitial([{ _id: 'emp1', isAssistant: true }]);

    component.deleteAssistant('emp1');

    http.expectOne(`${API}/assistant/talk/talk1`).flush([
      { _id: 'reg-otro', employee: { _id: 'emp2' } },
      { _id: 'reg-emp1', employee: { _id: 'emp1' } },
    ]);
    const deletion = http.expectOne(`${API}/assistant/reg-emp1`);
    expect(deletion.request.method).toBe('DELETE');
    http.expectNone(r => r.url.includes('delete-by-employee-id'));
    deletion.flush({});
    http.expectOne(`${API}/named/date-turn`).flush([]);
  });

  it('seleccionar todos solo envia a quien aun no asiste', () => {
    flushInitial([
      { _id: 'emp1', isAssistant: true },
      { _id: 'emp2', isAssistant: false },
    ]);

    component.selectAll();

    const request = http.expectOne(`${API}/assistant/save-by-employee-ids`);
    expect(request.request.body).toEqual({ employeeIds: ['emp2'], talkId: 'talk1' });
    request.flush({});
    http.expectOne(`${API}/named/date-turn`).flush([]);
  });

  afterEach(() => {
    http.verify();
  });
});
