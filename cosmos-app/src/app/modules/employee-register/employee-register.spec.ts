import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import EmployeeRegister from './employee-register';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { IDirectoryPerson } from './interfaces/employee.interface';

/** Persona del maestro local (Cosmos), ya con ficha en la plataforma. */
function cosmos(overrides: Partial<IDirectoryPerson> = {}): IDirectoryPerson {
  return {
    key: '74355639',
    employeeId: 'e1',
    id: 4412,
    firstName: 'DARWIN JAVIER',
    lastName: 'HIDALGO CASTILLO',
    fullName: 'HIDALGO CASTILLO DARWIN JAVIER',
    document: '74355639',
    status: 'active',
    issetFinger: false,
    signature: '',
    sources: ['cosmos'],
    ...overrides,
  };
}

/** Persona que solo existe en Visma: sin ficha local y sin staff_id. */
function soloVisma(overrides: Partial<IDirectoryPerson> = {}): IDirectoryPerson {
  return {
    key: '41591769',
    vismaId: '1177106',
    firstName: 'LEANDRO ROYER',
    lastName: 'MALDONADO GARCIA',
    fullName: 'LEANDRO ROYER MALDONADO GARCIA',
    document: '41591769',
    status: 'active',
    issetFinger: false,
    signature: '',
    sources: ['visma'],
    ...overrides,
  };
}

describe('EmployeeRegister', () => {
  let component: EmployeeRegister;
  let fixture: ComponentFixture<EmployeeRegister>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmployeeRegister],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(EmployeeRegister);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  /** Responde a la carga inicial del maestro local. */
  function flushInitial(data: IDirectoryPerson[] = [cosmos()]) {
    const request = http.expectOne(
      r => r.url === `${environment.api}/employee/directory` && !r.params.get('search')
    );
    request.flush({ data, total: data.length, minLength: 3, vismaAvailable: true });
    return request;
  }

  it('should create', () => {
    flushInitial();
    expect(component).toBeTruthy();
  });

  it('arranca pidiendo el maestro sin filtro, que es el local', () => {
    const request = flushInitial();

    expect(request.request.params.get('search')).toBeNull();
    expect(component.people()).toHaveSize(1);
    expect(component.results()[0].document).toBe('74355639');
  });

  it('no consulta a Visma con menos caracteres de los que acepta', fakeAsync(() => {
    flushInitial();

    component.onQuery('hi');
    tick(500);

    http.expectNone(r => r.params.get('search') === 'hi');
    expect(component.canAskVisma()).toBe(false);
  }));

  it('suma los resultados de Visma a los locales sin sustituirlos', fakeAsync(() => {
    flushInitial();

    component.onQuery('mal');
    tick(500);

    const request = http.expectOne(r => r.params.get('search') === 'mal');
    request.flush({
      data: [cosmos(), soloVisma()],
      total: 2,
      minLength: 3,
      vismaAvailable: true,
    });

    // "mal" no casa con nadie del maestro local, pero sí con el de Visma.
    expect(component.results().map(p => p.key)).toEqual(['41591769']);
    expect(component.fromVisma()).toBe(1);
  }));

  it('avisa cuando Visma no responde en vez de decir que no hay nadie', fakeAsync(() => {
    flushInitial();

    component.onQuery('mal');
    tick(500);

    http.expectOne(r => r.params.get('search') === 'mal').flush({
      data: [cosmos()],
      total: 1,
      minLength: 3,
      vismaAvailable: false,
    });

    expect(component.vismaAvailable()).toBe(false);
  }));

  it('al elegir a alguien de Visma pide su ficha y separa nombre y apellido', () => {
    flushInitial([]);

    component.selectEmployee(soloVisma());

    const request = http.expectOne(`${environment.api}/visma/personal/1177106`);
    request.flush({
      source: 'visma',
      data: {
        id: '1177106',
        fullName: 'MALDONADO GARCIA LEANDRO ROYER',
        firstName: 'LEANDRO ROYER',
        lastName: 'MALDONADO GARCIA',
        document: '41591769',
        fileNumber: '417580',
        position: '',
        active: true,
      },
    });

    // `cap` solo pone en mayúscula la primera letra de la cadena; lo que
    // importa aquí es que el corte entre nombre y apellido sea el de la ficha.
    expect(component.firstName?.toUpperCase()).toBe('LEANDRO ROYER');
    expect(component.lastName?.toUpperCase()).toBe('MALDONADO GARCIA');
    expect(component.document).toBe('41591769');
    // No está en Cosmos: no hay staff_id que mandar al guardar.
    expect(component.id).toBeNull();
  });

  it('quien solo está en Visma se guarda sin staff_id', () => {
    flushInitial([]);

    component.selectEmployee(soloVisma());
    http.expectOne(`${environment.api}/visma/personal/1177106`).flush({
      source: 'visma',
      data: {
        id: '1177106',
        fullName: 'MALDONADO GARCIA LEANDRO ROYER',
        firstName: 'LEANDRO ROYER',
        lastName: 'MALDONADO GARCIA',
        document: '41591769',
        fileNumber: '417580',
        position: '',
        active: true,
      },
    });

    const body = component.transformToFormData();

    expect(body.get('id')).toBeNull();
    expect(body.get('vismaId')).toBe('1177106');
    expect(body.get('fileNumber')).toBe('417580');
    expect(body.get('document')).toBe('41591769');
  });

  it('al elegir a alguien con ficha local abre esa ficha', () => {
    flushInitial();

    component.selectEmployee(cosmos());

    const request = http.expectOne(`${environment.api}/employee/e1`);
    request.flush({
      _id: 'e1',
      id: 4412,
      firstName: 'DARWIN JAVIER',
      lastName: 'HIDALGO CASTILLO',
      document: '74355639',
      faceDescriptor: [],
      signature: 'firma.png',
      fingerprintId: 'f1',
      image: '',
    });

    expect(component.employeeId()).toBe('e1');
    expect(component.issetSignature()).toBe(true);
    expect(component.issetFingerprint()).toBe(true);
    expect(component.id).toBe(4412);
  });

  it('tras un fallo de red el buscador sigue consultando a Visma', fakeAsync(() => {
    flushInitial();

    component.onQuery('mal');
    tick(500);
    http
      .expectOne(r => r.params.get('search') === 'mal')
      .flush('caido', { status: 500, statusText: 'Server Error' });
    expect(component.vismaAvailable()).toBe(false);

    // Antes el error cerraba la tuberia y esta segunda busqueda no salia.
    component.onQuery('mald');
    tick(500);
    http.expectOne(r => r.params.get('search') === 'mald').flush({
      data: [soloVisma()],
      total: 1,
      minLength: 3,
      vismaAvailable: true,
    });

    expect(component.vismaAvailable()).toBe(true);
    expect(component.results().map(p => p.key)).toEqual(['41591769']);
  }));

  it('un doble toque en guardar manda una sola alta', () => {
    flushInitial([]);
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    component.form.patchValue({ firstName: 'Ana', lastName: 'Diaz', document: '12345678' });

    component.save();
    component.save();

    const requests = http.match(`${environment.api}/employee`);
    expect(requests.length).toBe(1);
    requests[0].flush({ _id: 'nuevo' });
    expect(component.saving()).toBe(false);
  });

  afterEach(() => {
    http.verify();
  });
});
