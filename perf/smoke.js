import http from 'k6/http';
import { check, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';

/**
 * Prueba de humo de rendimiento.
 *
 * No busca el limite del sistema: busca que el limite no haya cambiado. Corre
 * con un solo usuario virtual y treinta segundos, asi que cabe en el CI de cada
 * cambio sin alargarlo, y detecta lo que de verdad se rompe entre versiones:
 * una consulta que perdio su indice, una llamada al sistema externo que dejo de
 * cachearse, un endpoint que empezo a traerse la coleccion entera.
 *
 * Los umbrales son la parte importante. Sin ellos k6 imprime numeros bonitos y
 * siempre termina con exito.
 *
 *   k6 run perf/smoke.js
 *   k6 run -e BASE_URL=https://apicheckin.cosmos.com.pe/api/v1 perf/smoke.js
 */

const BASE = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const TOKEN = __ENV.TOKEN || '';

const duracionSalud = new Trend('duracion_salud', true);
const duracionListado = new Trend('duracion_listado', true);
const erroresDeNegocio = new Rate('errores_de_negocio');

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    // Ningun fallo de transporte. Con un solo usuario, un error de red es un
    // servidor que se cae, no saturacion.
    http_req_failed: ['rate<0.01'],

    // El percentil 95 y no la media: la media esconde justo la cola que sufre
    // quien esta esperando delante de una pantalla.
    http_req_duration: ['p(95)<800', 'p(99)<2000'],

    // La salud del servicio la consulta el orquestador cada pocos segundos: si
    // tarda, el despliegue se marca como caido.
    duracion_salud: ['p(95)<150'],

    // Un listado paginado que pasa de medio segundo suele significar que se
    // perdio un indice o que se dejo de paginar.
    duracion_listado: ['p(95)<500'],

    errores_de_negocio: ['rate<0.01'],
  },
};

const cabeceras = TOKEN
  ? { headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } }
  : { headers: { 'Content-Type': 'application/json' } };

export default function () {
  group('salud', () => {
    const respuesta = http.get(`${BASE.replace('/api/v1', '')}/health`);
    duracionSalud.add(respuesta.timings.duration);
    const bien = check(respuesta, {
      'la salud responde 200': (r) => r.status === 200,
    });
    erroresDeNegocio.add(!bien);
  });

  group('listado paginado', () => {
    const respuesta = http.get(`${BASE}/port/10/1`, cabeceras);
    duracionListado.add(respuesta.timings.duration);

    // 401 es una respuesta correcta cuando no se paso token: lo que se mide es
    // el tiempo de la ruta, no el permiso. Un 500 si es un fallo.
    const bien = check(respuesta, {
      'el listado no falla en el servidor': (r) => r.status < 500,
      'el listado devuelve la forma esperada o rechaza el acceso': (r) =>
        r.status === 401 || r.status === 403 || (r.json() !== null && 'data' in r.json()),
    });
    erroresDeNegocio.add(!bien);
  });
}

export function handleSummary(data) {
  return {
    'perf/resultados/smoke.json': JSON.stringify(data, null, 2),
    stdout: resumenLegible(data),
  };
}

function resumenLegible(data) {
  const m = data.metrics;
  const p95 = (nombre) => m[nombre]?.values?.['p(95)']?.toFixed(0) ?? '-';
  return [
    '',
    'Resumen de la prueba de humo',
    `  peticiones          ${m.http_reqs?.values?.count ?? 0}`,
    `  fallidas            ${((m.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2)}%`,
    `  duracion p95        ${p95('http_req_duration')} ms`,
    `  salud p95           ${p95('duracion_salud')} ms`,
    `  listado p95         ${p95('duracion_listado')} ms`,
    '',
  ].join('\n');
}
