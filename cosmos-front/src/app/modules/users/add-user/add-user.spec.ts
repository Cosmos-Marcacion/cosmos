import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import AddUser from './add-user';
import { environment } from '../../../../environments/environment';
import { componentProviders, httpMock } from '../../../../testing/setup';

describe('AddUser', () => {
  const api = environment.api;
  const roles = [{ _id: 'r1', name: 'Admin' }];

  const montar = async (id?: string) => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AddUser],
      providers: componentProviders({ params: id ? { id } : {} }),
    }).compileComponents();

    const fixture: ComponentFixture<AddUser> = TestBed.createComponent(AddUser);
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    return { fixture, component: fixture.componentInstance, router };
  };

  it('en alta solo carga los perfiles', async () => {
    const { fixture, component } = await montar();

    fixture.detectChanges();
    httpMock().expectOne(`${api}/user/assignable-roles`).flush(roles);

    expect(component.roles().length).toBe(1);
    expect(component.rolesState()).toBe('ready');
    httpMock().verify();
  });

  it('en alta la contrasena es obligatoria', async () => {
    const { fixture, component } = await montar();
    fixture.detectChanges();
    httpMock().expectOne(`${api}/user/assignable-roles`).flush(roles);

    expect(component.form.get('password')?.hasValidator).toBeDefined();
    component.form.patchValue({ name: 'Ana', email: 'ana@cosmos.com.pe', password: '' });
    expect(component.form.get('password')?.valid).toBeFalse();
  });

  it('en edicion carga el usuario ademas de los perfiles', async () => {
    const { fixture, component } = await montar('u1');

    fixture.detectChanges();
    httpMock().expectOne(`${api}/user/assignable-roles`).flush(roles);
    httpMock().expectOne(`${api}/user/by-id/u1`).flush({
      _id: 'u1',
      name: 'Ana',
      email: 'ana@cosmos.com.pe',
      role: { _id: 'r1', name: 'Admin' },
    });

    expect(component.form.get('name')?.value).toBe('Ana');
  });

  it('en edicion la contrasena deja de ser obligatoria', async () => {
    const { fixture, component } = await montar('u1');
    fixture.detectChanges();
    httpMock().expectOne(`${api}/user/assignable-roles`).flush(roles);
    httpMock()
      .expectOne(`${api}/user/by-id/u1`)
      .flush({ name: 'Ana', email: 'a@b.pe', role: { _id: 'r1' } });

    // Editar el nombre de alguien no puede obligar a reescribir su contrasena:
    // quien edita no la sabe.
    expect(component.form.get('password')?.valid).toBeTrue();
  });

  it('en edicion el correo queda bloqueado', async () => {
    const { fixture, component } = await montar('u1');
    fixture.detectChanges();
    httpMock().expectOne(`${api}/user/assignable-roles`).flush(roles);
    httpMock()
      .expectOne(`${api}/user/by-id/u1`)
      .flush({ name: 'Ana', email: 'a@b.pe', role: { _id: 'r1' } });

    // El correo es la clave unica de la cuenta y la que usa el login. Dejarlo
    // editable convierte una correccion tipografica en una cuenta inaccesible.
    expect(component.form.get('email')?.disabled).toBeTrue();
  });

  it('un usuario sin perfil resuelto no tumba la pantalla', async () => {
    const { fixture, component } = await montar('u1');
    fixture.detectChanges();
    httpMock().expectOne(`${api}/user/assignable-roles`).flush(roles);
    httpMock().expectOne(`${api}/user/by-id/u1`).flush({ name: 'Ana', email: 'a@b.pe' });

    // Antes reventaba con "Cannot read properties of undefined" y el formulario
    // desaparecia entero.
    expect(component.form.get('name')?.value).toBe('Ana');
  });

  it('pinta las opciones de rol sin esperar a otro evento (CKI02)', async () => {
    const { fixture } = await montar();
    fixture.detectChanges();
    httpMock().expectOne(`${api}/user/assignable-roles`).flush(roles);
    await fixture.whenStable();
    fixture.detectChanges();

    const opciones = fixture.nativeElement.querySelectorAll('#roleId option');
    expect(opciones.length).toBe(2);
    expect(opciones[1].textContent.trim()).toBe('Admin');
  });

  it('si fallan los roles lo dice y deja reintentar', async () => {
    const { fixture, component } = await montar();
    fixture.detectChanges();
    httpMock().expectOne(`${api}/user/assignable-roles`).flush('x', { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.rolesState()).toBe('error');
    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar los roles');
    component.getRoles();
    httpMock().expectOne(`${api}/user/assignable-roles`).flush(roles);
    expect(component.rolesState()).toBe('ready');
  });

  it('rechaza nombres cortos, numericos o con emojis (CKI09, CKI13)', async () => {
    const { fixture, component } = await montar();
    fixture.detectChanges();
    httpMock().expectOne(`${api}/user/assignable-roles`).flush(roles);
    const name = component.form.get('name')!;

    for (const malo of ['A', '4322343424', 'al\u{1F600}onso', '   ', 'Ana#1']) {
      name.setValue(malo);
      expect(name.valid).withContext(malo).toBeFalse();
    }
    for (const bueno of ['Ana', 'María José Peña', "O'Neill", 'Ruiz-Tagle']) {
      name.setValue(bueno);
      expect(name.valid).withContext(bueno).toBeTrue();
    }
  });

  it('exige contrasena de 8 con letra y numero', async () => {
    const { fixture, component } = await montar();
    fixture.detectChanges();
    httpMock().expectOne(`${api}/user/assignable-roles`).flush(roles);
    const password = component.form.get('password')!;

    for (const mala of ['1', 'abcdefgh', '12345678', 'abc123']) {
      password.setValue(mala);
      expect(password.valid).withContext(mala).toBeFalse();
    }
    password.setValue('clave2026');
    expect(password.valid).toBeTrue();
  });

  it('volver lleva al listado de usuarios', async () => {
    const { fixture, component, router } = await montar();
    fixture.detectChanges();
    httpMock().expectOne(`${api}/user/assignable-roles`).flush(roles);

    component.goBack();

    expect(router.navigate).toHaveBeenCalledWith(['/usuarios']);
  });
});
