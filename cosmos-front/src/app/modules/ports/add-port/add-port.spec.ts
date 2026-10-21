import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import AddPort from './add-port';
import { environment } from '../../../../environments/environment';
import { componentProviders, httpMock } from '../../../../testing/setup';
import { NotificationService } from '../../../services/notification.service';

/**
 * El mismo formulario sirve para crear y para editar; lo que decide cual es el
 * `id` de la ruta. Confundir los dos casos es el fallo caro: al guardar una
 * edicion se crearia un puerto duplicado en vez de actualizar el existente.
 */
describe('AddPort', () => {
  const api = environment.api;

  /** Monta el componente con —o sin— el id de la ruta. */
  const montar = async (id?: string) => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AddPort],
      providers: componentProviders({ params: id ? { id } : {} }),
    }).compileComponents();

    const fixture: ComponentFixture<AddPort> = TestBed.createComponent(AddPort);
    const router = TestBed.inject(Router);
    const notificaciones = TestBed.inject(NotificationService);
    spyOn(router, 'navigate');
    spyOn(notificaciones, 'show');
    return { fixture, component: fixture.componentInstance, router, notificaciones };
  };

  describe('alta', () => {
    it('no pide nada al arrancar', async () => {
      const { fixture } = await montar();

      fixture.detectChanges();

      httpMock().verify();
    });

    it('el formulario empieza invalido', async () => {
      const { component } = await montar();

      expect(component.form.invalid).toBeTrue();
    });

    it('no guarda con el formulario incompleto', async () => {
      const { component } = await montar();
      component.form.patchValue({ name: 'Callao', address: '' });

      component.save();

      httpMock().expectNone(`${api}/port`);
    });

    it('crea el puerto y vuelve al listado', async () => {
      const { component, router, notificaciones } = await montar();
      component.form.patchValue({ name: 'Callao', address: 'Av. Mora 1' });

      component.save();

      const peticion = httpMock().expectOne(`${api}/port`);
      expect(peticion.request.method).toBe('POST');
      peticion.flush({ _id: 'pt1' });

      expect(notificaciones.show).toHaveBeenCalledWith('Puerto creado correctamente', 'success');
      expect(router.navigate).toHaveBeenCalledWith(['/puertos']);
    });
  });

  describe('edicion', () => {
    it('carga el puerto de la ruta y rellena el formulario', async () => {
      const { fixture, component } = await montar('pt1');

      fixture.detectChanges();
      httpMock().expectOne(`${api}/port/pt1`).flush({
        _id: 'pt1',
        name: 'Callao',
        address: 'Av. Mora 1',
      });

      expect(component.form.value).toEqual({ name: 'Callao', address: 'Av. Mora 1' });
    });

    it('guardar actualiza en vez de crear', async () => {
      const { fixture, component, router } = await montar('pt1');
      fixture.detectChanges();
      httpMock().expectOne(`${api}/port/pt1`).flush({ name: 'Callao', address: 'Av. 1' });

      component.form.patchValue({ address: 'Muelle 9' });
      component.save();

      const peticion = httpMock().expectOne(`${api}/port/pt1`);
      // Con POST se crearia un segundo puerto con el mismo nombre y el original
      // quedaria sin tocar.
      expect(peticion.request.method).toBe('PATCH');
      peticion.flush({ _id: 'pt1' });

      expect(router.navigate).toHaveBeenCalledWith(['/puertos']);
    });
  });

  it('volver lleva al listado sin guardar', async () => {
    const { component, router } = await montar();

    component.goBack();

    expect(router.navigate).toHaveBeenCalledWith(['/puertos']);
    httpMock().verify();
  });
});
