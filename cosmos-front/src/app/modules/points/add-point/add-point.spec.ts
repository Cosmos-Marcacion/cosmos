import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import AddPoint from './add-point';
import { environment } from '../../../../environments/environment';
import { componentProviders, httpMock } from '../../../../testing/setup';

describe('AddPoint', () => {
  const api = environment.api;

  const puertos = {
    data: [{ _id: 'pt1', name: 'Callao' }, { _id: 'pt2', name: 'Paita' }],
    total: 2, page: 1, limit: 0,
  };
  const puntosCallao = {
    data: [{ _id: 'p0', name: 'Garita' }, { _id: 'p1', name: 'Muelle' }],
    total: 2, page: 1, limit: 0,
  };
  const puntosPaita = { data: [{ _id: 'q0', name: 'Ingreso Puerto' }], total: 1, page: 1, limit: 0 };

  const montar = async (id?: string) => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AddPoint],
      providers: componentProviders({ params: id ? { id } : {} }),
    }).compileComponents();

    const fixture: ComponentFixture<AddPoint> = TestBed.createComponent(AddPoint);
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    return { fixture, component: fixture.componentInstance, router };
  };

  const atenderPuertos = () =>
    httpMock().expectOne((r) => r.url.startsWith(`${api}/port/`)).flush(puertos);
  const atenderPuntosDe = (portId: string, respuesta: object) =>
    httpMock().expectOne(`${api}/point/by-port/${portId}/0/1`).flush(respuesta);

  const cargarEdicion = (punto: Record<string, unknown>) => {
    atenderPuertos();
    httpMock().expectOne(`${api}/point/p1`).flush(punto);
  };

  const puntoGuardado = {
    _id: 'p1',
    name: 'Muelle',
    port: { _id: 'pt1', name: 'Callao' },
    dependOn: { _id: 'p0', name: 'Garita' },
    previousTolerance: 15,
    nextTolerance: 30,
  };

  it('en alta carga los puertos y no pide puntos hasta elegir puerto', async () => {
    const { fixture, component } = await montar();

    fixture.detectChanges();
    atenderPuertos();

    expect(component.ports().length).toBe(2);
    expect(component.dependencyOptions().length).toBe(0);
    httpMock().verify();
  });

  it('las dependencias son solo del puerto elegido (CKI07)', async () => {
    const { fixture, component } = await montar();
    fixture.detectChanges();
    atenderPuertos();

    component.form.controls.portId.setValue('pt1');
    atenderPuntosDe('pt1', puntosCallao);
    component.form.controls.dependOnId.setValue('p0');

    component.form.controls.portId.setValue('pt2');
    atenderPuntosDe('pt2', puntosPaita);

    expect(component.dependencyOptions().map((p) => p._id)).toEqual(['q0']);
    // La dependencia de Callao no vale en Paita: se limpia.
    expect(component.form.controls.dependOnId.value).toBe('');
  });

  it('en edicion rellena puerto, dependencia y tolerancias, y no se ofrece a si mismo', async () => {
    const { fixture, component } = await montar('p1');

    fixture.detectChanges();
    cargarEdicion(puntoGuardado);
    atenderPuntosDe('pt1', puntosCallao);

    expect(component.form.getRawValue()).toEqual(
      jasmine.objectContaining({
        name: 'Muelle',
        portId: 'pt1',
        dependOnId: 'p0',
        previousTolerance: '15',
        nextTolerance: '30',
      })
    );
    expect(component.dependencyOptions().map((p) => p._id)).toEqual(['p0']);
  });

  it('un punto sin puerto poblado no tumba la pantalla', async () => {
    const { fixture, component } = await montar('p1');

    fixture.detectChanges();
    cargarEdicion({ _id: 'p1', name: 'Muelle' });

    // Antes reventaba con "Cannot read properties of undefined": el formulario
    // desaparecia entero por un campo que faltaba.
    expect(component.form.value.name).toBe('Muelle');
    expect(component.form.value.portId).toBe('');
  });

  it('la tolerancia solo admite enteros de 0 a 240 (CKI15)', async () => {
    const { fixture, component } = await montar();
    fixture.detectChanges();
    atenderPuertos();
    const tolerancia = component.form.controls.previousTolerance;

    for (const mala of ['-13', '-102e', '1e2', '12.5', 'abc', '241', '', '   ']) {
      tolerancia.setValue(mala);
      expect(tolerancia.valid).withContext(mala).toBeFalse();
    }
    for (const buena of ['0', '15', '240']) {
      tolerancia.setValue(buena);
      expect(tolerancia.valid).withContext(buena).toBeTrue();
    }
  });

  it('el nombre rechaza emojis y simbolos (CKI15)', async () => {
    const { fixture, component } = await montar();
    fixture.detectChanges();
    atenderPuertos();
    const name = component.form.controls.name;

    name.setValue('al\u{1F600}onso @#$%');
    expect(name.valid).toBeFalse();
    name.setValue('1er Ingreso Muelle');
    expect(name.valid).toBeTrue();
  });

  it('guarda las tolerancias como numeros y no envia si el formulario es invalido', async () => {
    const { fixture, component } = await montar();
    fixture.detectChanges();
    atenderPuertos();

    component.form.patchValue({ name: 'Garita', previousTolerance: '-5' });
    component.form.controls.portId.setValue('pt1');
    atenderPuntosDe('pt1', puntosCallao);
    component.save();
    httpMock().expectNone(`${api}/point`);

    component.form.patchValue({ previousTolerance: '10', nextTolerance: '20' });
    component.save();
    const peticion = httpMock().expectOne(`${api}/point`);
    expect(peticion.request.body).toEqual(
      jasmine.objectContaining({ name: 'Garita', portId: 'pt1', previousTolerance: 10, nextTolerance: 20 })
    );
    peticion.flush({});
  });

  it('los dos desplegables tienen id propio (CKI06)', async () => {
    const { fixture } = await montar();
    fixture.detectChanges();
    atenderPuertos();
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('#portId').length).toBe(1);
    expect(el.querySelectorAll('#dependOnId').length).toBe(1);
    expect(el.querySelector('label[for="dependOnId"]')?.textContent).toContain('Depende de');
  });

  it('volver lleva al listado de puntos', async () => {
    const { fixture, component, router } = await montar();
    fixture.detectChanges();
    atenderPuertos();

    component.goBack();

    expect(router.navigate).toHaveBeenCalledWith(['/puntos']);
  });
});
