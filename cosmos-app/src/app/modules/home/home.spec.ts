import { ComponentFixture, TestBed } from '@angular/core/testing';

import Home, { formatErrorMessage } from './home';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('formatErrorMessage', () => {
  const blob = (body: unknown) => new Blob([JSON.stringify(body)], { type: 'application/json' });

  it('lee el motivo del backend en cualquier error, no solo en el 422', async () => {
    expect(await formatErrorMessage({ status: 404, error: blob({ message: 'Nombrada no encontrada' }) }))
      .toBe('Nombrada no encontrada');
    expect(await formatErrorMessage({ status: 422, error: blob({ message: 'Tipo de nave sin formato' }) }))
      .toBe('Tipo de nave sin formato');
  });

  it('sin conexion lo dice, y sin cuerpo legible da el generico', async () => {
    expect(await formatErrorMessage({ status: 0, error: null })).toBe('No hay conexion con el servidor');
    expect(await formatErrorMessage({ status: 500, error: new Blob(['<html>']) }))
      .toBe('No se pudo generar el formato');
  });
});
