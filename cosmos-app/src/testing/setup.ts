import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

/**
 * Piezas comunes de los tests de la aplicacion movil.
 *
 * Los specs generados por el CLI repetian los mismos cuatro providers en cada
 * fichero y no llegaban a afirmar nada mas que "el servicio existe". Tener el
 * arnes en un sitio quita la excusa: escribir un test de comportamiento cuesta
 * lo mismo que copiar el molde.
 */

export function httpProviders() {
  return [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()];
}

export function componentProviders(
  options: { params?: Record<string, string>; queryParams?: Record<string, string> } = {}
) {
  return [
    ...httpProviders(),
    provideRouter([]),
    {
      provide: ActivatedRoute,
      useValue: {
        snapshot: {
          paramMap: convertToParamMap(options.params ?? {}),
          queryParamMap: convertToParamMap(options.queryParams ?? {}),
          params: options.params ?? {},
          queryParams: options.queryParams ?? {},
          data: {},
        },
        paramMap: of(convertToParamMap(options.params ?? {})),
        queryParamMap: of(convertToParamMap(options.queryParams ?? {})),
        params: of(options.params ?? {}),
        queryParams: of(options.queryParams ?? {}),
        data: of({}),
      },
    },
  ];
}

export function httpMock(): HttpTestingController {
  return TestBed.inject(HttpTestingController);
}

/**
 * Comprueba que no quedan peticiones sin atender. Sin esto, un test que dispara
 * una peticion que nadie responde pasa igual y el fallo aparece mas tarde, en
 * otro fichero.
 */
export function expectNoPendingRequests(): void {
  httpMock().verify();
}
