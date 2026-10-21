import { ComponentFixture, TestBed } from '@angular/core/testing';

import DniScan, { parseScannedCode } from './dni-scan';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';

describe('DniScan', () => {
  let component: DniScan;
  let fixture: ComponentFixture<DniScan>;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DniScan],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(DniScan);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('distingue el id de la ficha de un numero de documento', () => {
    expect(parseScannedCode('65f1a2b3c4d5e6f708192a3b')).toEqual({ kind: 'id', value: '65f1a2b3c4d5e6f708192a3b' });
    expect(parseScannedCode('70024465')).toEqual({ kind: 'document', value: '70024465' });
    expect(parseScannedCode('PER70024465<<X')).toEqual({ kind: 'document', value: '70024465' });
    expect(parseScannedCode('hola')).toBeNull();
  });

  it('con el QR de la plataforma va directo a la marcacion', () => {
    component.manejarEscaneoExitoso('65f1a2b3c4d5e6f708192a3b');
    http.expectNone(() => true);
    expect(router.navigate).toHaveBeenCalledWith(['/validacion-registro/65f1a2b3c4d5e6f708192a3b'], {
      queryParams: { metodo: 'qr' },
    });
  });

  it('con un DNI busca la ficha y navega con su id, no con el DNI', () => {
    component.manejarEscaneoExitoso('70024465');
    http.expectOne((r) => r.url.endsWith('/employee/search/70024465')).flush({ _id: 'e1' });
    expect(router.navigate).toHaveBeenCalledWith(['/validacion-registro/e1'], {
      queryParams: { metodo: 'qr' },
    });
  });

  it('avisa cuando el DNI no esta registrado y deja volver a escanear', () => {
    component.manejarEscaneoExitoso('70024465');
    http.expectOne((r) => r.url.endsWith('/employee/search/70024465')).flush(null);
    fixture.detectChanges();
    expect(component.status()).toBe('not-found');
    expect(fixture.nativeElement.textContent).toContain('No encontramos a nadie con el documento 70024465');
    expect(router.navigate).not.toHaveBeenCalled();

    component.scanAgain();
    expect(component.status()).toBe('scanning');
    expect(component.scannerEnabled()).toBeTrue();
  });

  it('avisa si el codigo no trae documento', () => {
    component.manejarEscaneoExitoso('abc');
    http.expectNone(() => true);
    expect(component.status()).toBe('unreadable');
  });
});
