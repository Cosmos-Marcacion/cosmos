import { ComponentFixture, TestBed } from '@angular/core/testing';

import Dni, { DOCUMENT_PATTERN } from './dni';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';

describe('Dni', () => {
  let component: Dni;
  let fixture: ComponentFixture<Dni>;
  let http: HttpTestingController;
  let router: Router;

  const type = (value: string) => {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#dni-input');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    return input;
  };

  const submitButton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('button[type="submit"]');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dni],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Dni);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('acepta DNI de 8 digitos y carne de hasta 12', () => {
    expect(DOCUMENT_PATTERN.test('70024465')).toBeTrue();
    expect(DOCUMENT_PATTERN.test('001234567890')).toBeTrue();
    expect(DOCUMENT_PATTERN.test('7002446')).toBeFalse();
    expect(DOCUMENT_PATTERN.test('1234567890123')).toBeFalse();
  });

  it('muestra un boton Buscar visible, deshabilitado hasta tener un documento valido', () => {
    expect(submitButton().textContent).toContain('Buscar');
    expect(submitButton().disabled).toBeTrue();
    type('70024465');
    expect(submitButton().disabled).toBeFalse();
  });

  it('no busca sola al llegar a 8 digitos', () => {
    type('70024465');
    http.expectNone(() => true);
  });

  it('descarta lo que no es digito', () => {
    const input = type('7002-44.65');
    expect(input.value).toBe('70024465');
    expect(component.document()).toBe('70024465');
  });

  it('con Enter busca y navega si el empleado existe', () => {
    type('70024465');
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(component.status()).toBe('loading');
    expect(submitButton().disabled).toBeTrue();

    http.expectOne((r) => r.url.endsWith('/employee/search/70024465')).flush({ _id: 'e1' });
    expect(router.navigate).toHaveBeenCalledWith(['/validacion-registro/e1'], {
      queryParams: { metodo: 'documento' },
    });
  });

  it('avisa cuando el documento no existe (200 con null)', () => {
    type('70024465');
    component.search();
    http.expectOne((r) => r.url.endsWith('/employee/search/70024465')).flush(null);
    fixture.detectChanges();
    expect(component.status()).toBe('not-found');
    expect(fixture.nativeElement.textContent).toContain('No encontramos a nadie con el documento 70024465');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('trata un 404 como no encontrado', () => {
    type('70024465');
    component.search();
    http
      .expectOne((r) => r.url.endsWith('/employee/search/70024465'))
      .flush({ message: 'No existe' }, { status: 404, statusText: 'Not Found' });
    expect(component.status()).toBe('not-found');
  });

  it('un fallo de red deja reintentar', () => {
    type('70024465');
    component.search();
    http
      .expectOne((r) => r.url.endsWith('/employee/search/70024465'))
      .flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(component.status()).toBe('error');

    const retry: HTMLButtonElement = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('button')
    ).find((b) => b.textContent?.includes('Reintentar'))!;
    retry.click();
    http.expectOne((r) => r.url.endsWith('/employee/search/70024465')).flush({ _id: 'e1' });
    expect(router.navigate).toHaveBeenCalled();
  });

  it('al corregir el documento se retira el aviso anterior', () => {
    type('70024465');
    component.search();
    http.expectOne(() => true).flush(null);
    type('7002446');
    expect(component.status()).toBe('idle');
  });
});
