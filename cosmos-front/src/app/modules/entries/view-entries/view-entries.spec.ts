import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import ViewEntries, { NEW_ENTRY } from './view-entries';
import { environment } from '../../../../environments/environment';
import { componentProviders, httpMock } from '../../../../testing/setup';
import { ConfirmationService } from '../../../services/confirmation.service';

describe('ViewEntries', () => {
  let component: ViewEntries;
  let fixture: ComponentFixture<ViewEntries>;
  let router: Router;
  let confirmacion: ConfirmationService;
  const api = environment.api;

  const params = { employeeId: 'e1', namedId: '9', workerDate: '09/03/2026' };

  const ingreso = { _id: 'p1', name: 'Ingreso', order: 1 };
  const salida = { _id: 'p5', name: 'Salida', order: 5 };

  const jornada = {
    entries: [{ _id: 'x1', date: '2026-03-09T11:00:00.000Z', pointId: ingreso, workerDate: '2026-03-09' }],
    named: { staff_transmission_id: 9 },
    employee: { _id: 'e1', firstName: 'Ana', lastName: 'Diaz', document: '12345678' },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewEntries],
      providers: componentProviders({ params }),
    }).compileComponents();

    fixture = TestBed.createComponent(ViewEntries);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    confirmacion = TestBed.inject(ConfirmationService);
    spyOn(router, 'navigate');
  });

  const arrancar = (respuesta: object = jornada) => {
    fixture.detectChanges();
    httpMock().expectOne((r) => r.url.includes('/entry/employee-and-named/')).flush(respuesta);
    httpMock().expectOne(`${api}/point/0/1`).flush({ data: [salida, ingreso] });
  };

  const repintar = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  it('pide la jornada con la fecha en formato ISO', () => {
    fixture.detectChanges();
    // Los parametros de la ruta llegan en dia/mes/ano y la API los espera al
    // reves. Sin la conversion, la jornada sale vacia sin ningun error.
    const peticion = httpMock().expectOne((r) => r.url.includes('/entry/employee-and-named/'));
    expect(peticion.request.url).toBe(`${api}/entry/employee-and-named/e1/9/2026-03-09`);
    peticion.flush(jornada);
    httpMock().expectOne(`${api}/point/0/1`).flush({ data: [] });
  });

  it('formatDate invierte la fecha y deja pasar la ISO', () => {
    expect(component.formatDate('05/01/2026')).toBe('2026-01-05');
    expect(component.formatDate('5/1/2026')).toBe('2026-01-05');
    // El detalle de la nombrada manda aaaa-mm-dd; partirla por "/" daba
    // "undefined-undefined-2026-09-10" y la lista salia vacia.
    expect(component.formatDate('2026-09-10')).toBe('2026-09-10');
  });

  it('guarda las marcaciones, la nombrada y el trabajador', () => {
    arrancar();

    expect(component.entries().length).toBe(1);
    expect(component.named()).toEqual(jornada.named as never);
    expect(component.employee()?.document).toBe('12345678');
  });

  it('lista los puntos sin marcar en orden de recorrido', () => {
    arrancar();

    expect(component.missingPoints().map((p) => p._id)).toEqual(['p5']);
  });

  it('Editar abre la fila con los datos de la marcacion', async () => {
    arrancar();
    await repintar();

    (fixture.nativeElement.querySelector('button[aria-label="Editar marcación"]') as HTMLButtonElement).click();
    await repintar();

    const local = new Date(jornada.entries[0].date);
    expect(component.editingId()).toBe('x1');
    expect(component.draft().pointId).toBe('p1');
    expect(component.draft().time).toBe(
      `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`
    );
    expect(fixture.nativeElement.querySelector('button[aria-label="Guardar marcación"]')).toBeTruthy();
  });

  it('la edicion conserva el dia de la propia marcacion, no el de la jornada', () => {
    // Salida del turno de noche: la jornada es el 9 y la marcacion el 10.
    arrancar({
      ...jornada,
      entries: [{ _id: 'x2', date: new Date(2026, 2, 10, 7, 5).toISOString(), pointId: salida }],
    });

    component.startEdit(component.entries()[0]);
    component.save();

    const peticion = httpMock().expectOne(`${api}/entry/x2`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body.date).toBe(new Date(2026, 2, 10, 7, 5).toISOString());
    expect(peticion.request.body.pointId).toBe('p5');
    peticion.flush({});
    httpMock().expectOne((r) => r.url.includes('/entry/employee-and-named/')).flush(jornada);
    expect(component.editingId()).toBeNull();
  });

  it('cancelar cierra la fila sin llamar a la API', () => {
    arrancar();

    component.startEdit(component.entries()[0]);
    component.cancelEdit();

    expect(component.editingId()).toBeNull();
    httpMock().expectNone(`${api}/entry/x1`);
  });

  it('registrar un punto que falta usa el documento y la nombrada', () => {
    arrancar();

    component.startNew('p5');
    expect(component.editingId()).toBe(NEW_ENTRY);
    component.draft.update((d) => ({ ...d, time: '15:10', date: '2026-03-10' }));
    component.save();

    const peticion = httpMock().expectOne(`${api}/entry/manual`);
    expect(peticion.request.body).toEqual(jasmine.objectContaining({
      employeeId: '12345678',
      pointId: 'p5',
      date: '2026-03-09',
      markDate: '2026-03-10',
      time: '15:10',
      namedId: 9,
    }));
    peticion.flush({});
    httpMock().expectOne((r) => r.url.includes('/entry/employee-and-named/')).flush(jornada);
  });

  it('no deja guardar con una hora imposible', () => {
    arrancar();
    component.startEdit(component.entries()[0]);

    // El campo se escribe a mano. Una hora invalida llega al backend como una
    // fecha imposible y queda guardada en el registro de la jornada.
    for (const invalida of ['24:00', '12:60', '6:5', 'ab:cd', '']) {
      component.draft.update((d) => ({ ...d, time: invalida }));
      expect(component.canSave()).withContext(`"${invalida}" no deberia valer`).toBeFalse();
    }
    component.draft.update((d) => ({ ...d, time: '23:59' }));
    expect(component.canSave()).toBeTrue();
  });

  it('volver sin historial lleva al tablero de marcaciones', () => {
    arrancar();

    component.goBack();

    expect(router.navigate).toHaveBeenCalledWith(['/marcaciones']);
  });

  it('borrar no llama a la API antes de que se confirme', () => {
    arrancar();
    spyOn(confirmacion, 'show');

    component.deletePoint(component.entries()[0]);

    // Una marcacion borrada es un registro con valor legal que desaparece.
    expect(confirmacion.show).toHaveBeenCalled();
    httpMock().expectNone(`${api}/entry/x1`);
  });
});
