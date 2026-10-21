import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

/**
 * Prueba de carga del turno.
 *
 * Reproduce lo que pasa de verdad en el puerto: el marcaje no se reparte a lo
 * largo del dia, se concentra en los quince minutos del cambio de turno, cuando
 * doscientas personas pasan por la garita casi a la vez. Un sistema que aguanta
 * la media diaria sin despeinarse puede caerse exactamente en ese pico.
 *
 * Esta prueba **no** va en el gate de cada cambio: tarda minutos y necesita un
 * entorno parecido a produccion. Va en la corrida nocturna y antes de un
 * despliegue grande.
 *
 *   k6 run -e BASE_URL=... -e TOKEN=... perf/carga.js
 */

const BASE = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const TOKEN = __ENV.TOKEN || '';

const duracionMarcaje = new Trend('duracion_marcaje', true);
const duracionNombradas = new Trend('duracion_nombradas', true);
const rechazos = new Counter('rechazos');
const erroresDeNegocio = new Rate('errores_de_negocio');

export const options = {
  scenarios: {
    cambio_de_turno: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        // Rampa corta: lo que se quiere ver es el pico, no el arranque.
        { duration: '30s', target: 20 },
        // El pico sostenido: quince minutos comprimidos en dos.
        { duration: '2m', target: 60 },
        // Y la bajada, donde se ven las conexiones que no se soltaron.
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '20s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],

    // Bajo carga se admite mas latencia que en la prueba de humo, pero con
    // techo: por encima de dos segundos la persona de la garita vuelve a pulsar
    // y duplica la carga justo cuando menos conviene.
    http_req_duration: ['p(95)<2000', 'p(99)<4000'],

    duracion_marcaje: ['p(95)<1500'],

    // Las nombradas vienen de un sistema externo y estan cacheadas. Si este
    // numero se dispara bajo carga, la cache no esta sirviendo y cada peticion
    // esta saliendo a la red.
    duracion_nombradas: ['p(95)<1000'],

    erroresDeNegocio: ['rate<0.02'],
  },
};

const cabeceras = {
  headers: {
    'Content-Type': 'application/json',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  },
};

export default function () {
  group('consulta de nombradas', () => {
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const fecha = `${dia}/${mes}/${hoy.getFullYear()}`;

    const respuesta = http.post(
      `${BASE}/named/nameds`,
      JSON.stringify({ sInitialDate: fecha, sFinalDate: fecha }),
      cabeceras
    );
    duracionNombradas.add(respuesta.timings.duration);
    const bien = check(respuesta, {
      'las nombradas no fallan en el servidor': (r) => r.status < 500,
    });
    if (respuesta.status >= 400) rechazos.add(1);
    erroresDeNegocio.add(!bien);
  });

  group('consulta del recorrido', () => {
    const respuesta = http.get(`${BASE}/point/50/1`, cabeceras);
    duracionMarcaje.add(respuesta.timings.duration);
    const bien = check(respuesta, {
      'el recorrido no falla en el servidor': (r) => r.status < 500,
    });
    erroresDeNegocio.add(!bien);
  });

  // Una persona no pulsa cien veces por segundo: sin la pausa se mide la
  // capacidad del generador de carga, no la del sistema.
  sleep(Math.random() * 2 + 0.5);
}

export function handleSummary(data) {
  return {
    'perf/resultados/carga.json': JSON.stringify(data, null, 2),
    stdout: resumenLegible(data),
  };
}

function resumenLegible(data) {
  const m = data.metrics;
  const p95 = (nombre) => m[nombre]?.values?.['p(95)']?.toFixed(0) ?? '-';
  return [
    '',
    'Resumen de la prueba de carga (cambio de turno)',
    `  peticiones          ${m.http_reqs?.values?.count ?? 0}`,
    `  fallidas            ${((m.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2)}%`,
    `  rechazos 4xx        ${m.rechazos?.values?.count ?? 0}`,
    `  duracion p95        ${p95('http_req_duration')} ms`,
    `  nombradas p95       ${p95('duracion_nombradas')} ms`,
    `  recorrido p95       ${p95('duracion_marcaje')} ms`,
    '',
  ].join('\n');
}
