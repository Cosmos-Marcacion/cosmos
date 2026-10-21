import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import AddEntry from './add-entry';
import { environment } from '../../../../environments/environment';
import { componentProviders, httpMock } from '../../../../testing/setup';

describe('AddEntry', () => {
  const api = environment.api;

  const puntos = { data: [{ _id: 'p1', name: 'Garita' }], total: 1, page: 1, limit: 10 };

  const nombradas = [
    {
      turns: [
        {
          turn: '07:00 - 15:00',
          entries: [
            {
              named: { staff_transmission_id: 9 },
              detail: [{ first_name: 'Ana', last_name: 'Torres', personal_id: '12345678' }],
            },
          ],
        },
      ],
    },
  ];

  const montar = async (id?: string) => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AddEntry],
      providers: componentProviders({ params: id ? { id } : {} }),
    }).compileComponents();

    const fixture: ComponentFixture<AddEntry> = TestBed.createComponent(AddEntry);
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    return { fixture, component: fixture.componentInstance, router };
  };

  /** Atiende las cargas iniciales: marcacion (si edita), empleados y puntos. */
  const atenderCargas = (editando = false) => {
    if (editando) {
      // Asi responde la API: sin poblar, con los ids sueltos.
      httpMock().expectOne(`${api}/entry/x1`).flush({
        _id: 'x1',
        employeeId: 'e1',
        pointId: 'p1',
        namedId: 9,
        workerDate: '2026-03-09',
        observation: 'Permiso',
        date: '2026-03-09T11:00:00.000Z',
      });
    }
    httpMock().expectOne(`${api}/employee`).flush([]);
    httpMock().expectOne((r) => r.url.startsWith(`${api}/point/`)).flush(puntos);
  };

  it('en alta carga empleados y puntos, sin pedir ninguna marcacion', async () => {
    const { fixture, component } = await montar();

    fixture.detectChanges();
    atenderCargas();

    expect(component.points.length).toBe(1);
    httpMock().verify();
  });

  it('en edicion carga ademas la marcacion de la ruta', async () => {
    const { fixture, component } = await montar('x1');

    fixture.detectChanges();
    atenderCargas(true);

    expect(component.form.getRawValue().employeeId).toBe('e1');
    expect(component.form.get('pointId')?.value).toBe('p1');
    expect(component.form.get('observation')?.value).toBe('Permiso');
    expect(component.form.get('time')?.value).toMatch(/^\d{2}:\d{2}$/);
    // Turno, nombrada y empleado no se editan: no bloquean el guardado.
    expect(component.form.valid).toBeTrue();
  });

  it('en edicion solo envia lo que admite UpdateEntryDto', async () => {
    const { fixture, component, router } = await montar('x1');
    fixture.detectChanges();
    atenderCargas(true);

    component.form.patchValue({ date: '2026-03-09', time: '07:30' });
    component.save();

    const peticion = httpMock().expectOne(`${api}/entry/x1`);
    expect(peticion.request.method).toBe('PATCH');
    expect(Object.keys(peticion.request.body).sort()).toEqual(['date', 'observation', 'pointId']);
    expect(peticion.request.body.date).toBe(new Date('2026-03-09T07:30:00').toISOString());
    peticion.flush({});
    expect(router.navigate).toHaveBeenCalledWith(['/marcaciones']);
  });

  it('cambiar la fecha limpia turno, nombrada y empleado', async () => {
    const { fixture, component } = await montar();
    fixture.detectChanges();
    atenderCargas();
    component.form.patchValue({ date: '2026-03-09', turn: '07:00 - 15:00', namedId: '9', employeeId: '12345678' });

    component.onDateChange();
    httpMock().expectOne(`${api}/named/nameds/grouped`).flush([]);

    expect(component.form.getRawValue()).toEqual(
      jasmine.objectContaining({ turn: '', namedId: null, employeeId: '' })
    );
    expect(component.namedsLoaded).toBeTrue();
  });

  it('consulta las nombradas del mismo dia, en el formato del sistema externo', async () => {
    const { fixture, component } = await montar();
    fixture.detectChanges();
    atenderCargas();

    component.form.patchValue({ date: '2026-03-09' });
    component.getNameds();

    // La API externa solo entiende dia/mes/ano. Con ISO devuelve una lista vacia
    // sin error, y el desplegable de nombradas sale vacio sin explicacion.
    const peticion = httpMock().expectOne(`${api}/named/nameds/grouped`);
    expect(peticion.request.body).toEqual({
      sInitialDate: '09/03/2026',
      sFinalDate: '09/03/2026',
    });
    peticion.flush(nombradas);
  });

  it('el turno elegido filtra las nombradas de ese turno', async () => {
    const { fixture, component } = await montar();
    fixture.detectChanges();
    atenderCargas();
    component.form.patchValue({ date: '2026-03-09' });
    component.getNameds();
    httpMock().expectOne(`${api}/named/nameds/grouped`).flush(nombradas);

    component.form.patchValue({ turn: '07:00 - 15:00' });
    component.getNamedTurns();

    expect(component.namedsTurn.length).toBe(1);
  });

  it('un turno sin nombradas deja la lista vacia en vez de la anterior', async () => {
    const { fixture, component } = await montar();
    fixture.detectChanges();
    atenderCargas();
    component.form.patchValue({ date: '2026-03-09' });
    component.getNameds();
    httpMock().expectOne(`${api}/named/nameds/grouped`).flush(nombradas);

    component.form.patchValue({ turn: '23:00 - 07:00' });
    component.getNamedTurns();

    // Arrastrar la lista del turno anterior haria que se registrara la
    // marcacion contra la nombrada equivocada.
    expect(component.namedsTurn).toEqual([]);
  });

  it('la nombrada elegida trae su propio personal', async () => {
    const { fixture, component } = await montar();
    fixture.detectChanges();
    atenderCargas();
    component.form.patchValue({ date: '2026-03-09' });
    component.getNameds();
    httpMock().expectOne(`${api}/named/nameds/grouped`).flush(nombradas);
    component.form.patchValue({ turn: '07:00 - 15:00' });
    component.getNamedTurns();

    component.form.patchValue({ namedId: '9' });
    component.getCurrentEmployees();

    expect(component.currentEmployees.length).toBe(1);
    expect(component.currentEmployees[0].document).toBe('12345678');
  });

  it('una nombrada sin personal deja la lista vacia', async () => {
    const { fixture, component } = await montar();
    fixture.detectChanges();
    atenderCargas();
    component.form.patchValue({ date: '2026-03-09' });
    component.getNameds();
    httpMock().expectOne(`${api}/named/nameds/grouped`).flush(nombradas);
    component.form.patchValue({ turn: '07:00 - 15:00' });
    component.getNamedTurns();

    component.form.patchValue({ namedId: '404' });
    component.getCurrentEmployees();

    expect(component.currentEmployees).toEqual([]);
  });

  it('volver lleva al listado de marcaciones', async () => {
    const { fixture, component, router } = await montar();
    fixture.detectChanges();
    atenderCargas();

    component.goBack();

    expect(router.navigate).toHaveBeenCalledWith(['/marcaciones']);
  });
});
