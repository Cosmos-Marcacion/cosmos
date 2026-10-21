import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

/**
 * Piezas comunes de los tests del panel.
 *
 * Los specs generados por el CLI configuraban un `TestBed` con lo minimo, sin
 * `HttpClient` ni rutas, y por eso veintitres de ellos fallaban con
 * `NullInjectorError` en cuanto el componente inyectaba un servicio. Aqui estan
 * los providers que casi todo necesita, en un solo sitio, para que anadir un
 * test no obligue a reconstruirlos.
 *
 * La aplicacion va sin zonas (`provideZonelessChangeDetection`), asi que los
 * tests tambien: con zonas, un `fixture.detectChanges()` se comporta distinto
 * que en produccion y el test dejaria de describir la aplicacion real.
 */

/** Providers para probar un servicio que habla con la API. */
export function httpProviders() {
  return [
    provideZonelessChangeDetection(),
    provideHttpClient(),
    provideHttpClientTesting(),
  ];
}

/**
 * Providers para probar un componente: HTTP simulado, router de prueba y una
 * ruta activa con los parametros que se le pasen.
 */
export function componentProviders(
  options: {
    params?: Record<string, string>;
    queryParams?: Record<string, string>;
  } = {}
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

/** Controlador de peticiones simuladas, ya inyectado. */
export function httpMock(): HttpTestingController {
  return TestBed.inject(HttpTestingController);
}

/**
 * Comprueba que no quedan peticiones sin atender.
 *
 * Se llama en un `afterEach`. Sin esto, un test que dispara una peticion que
 * nadie responde pasa igualmente, y el fallo aparece mas tarde en otro test que
 * si mira la cola: el sintoma queda a varios ficheros del origen.
 */
export function expectNoPendingRequests(): void {
  httpMock().verify();
}
