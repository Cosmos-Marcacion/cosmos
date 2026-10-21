/**
 * Umbrales de cobertura del backend.
 *
 * Politica (ver QA_PLAN.md): el umbral es un trinquete, no un deseo. Se fija en
 * el valor real medido, redondeado un punto hacia abajo para que un reordenado
 * de codigo no ponga el CI en rojo, y solo sube. Si un cambio baja la cobertura,
 * el gate falla; si la sube, se sube tambien el numero de este fichero y ya no
 * se puede volver atras.
 *
 * Poner aqui el objetivo en vez de la medida seria peor que no tener gate: un
 * CI que lleva meses en rojo no lo mira nadie.
 *
 * `branches` es el numero que de verdad importa: distingue una suite que
 * ejercita los caminos de error de una que solo recorre el camino feliz. Es
 * tambien el que va mas retrasado, y por eso el que marca el trabajo pendiente.
 *
 * Medicion del 09/09/2026, con 1056 casos en 71 suites.
 */
interface Piso {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

/** Objetivo declarado del proyecto. No es lo que exige el gate: es a donde va. */
export const OBJETIVO: Piso = {
  statements: 90,
  branches: 85,
  functions: 90,
  lines: 90,
};

export const unitThresholds: { global: Piso } & Record<string, Piso> = {
  /**
   * Ojo con la semantica: en cuanto hay umbrales por carpeta, `global` deja de
   * medir toda la base y pasa a medir **solo lo que no cae bajo ninguno de
   * ellos**. Aqui eso son puertos, puntos, permisos, perfiles, usuarios,
   * charlas, asistencias, huellas, entrenadores, subidas y el SDK.
   *
   * Confundir las dos cosas es la forma habitual de acabar con un gate que no
   * mide lo que su autor creia: la cifra global de la base (74.2 / 54.4 / 75.3
   * / 76.1) no es esta.
   *
   * Medido sobre el residual: 79.5 / 47.9 / 84.8 / 84.4
   */
  global: {
    statements: 78,
    branches: 47,
    functions: 84,
    lines: 83,
  },

  // Nucleo transversal: cache, numeracion de documentos, acceso, validacion.
  // Medido: 91.5 / 62.1 / 92.9 / 94.8
  './src/common/': {
    statements: 90,
    branches: 61,
    functions: 92,
    lines: 94,
  },

  // Quien entra y con que permisos. Un fallo aqui no da un error, da un acceso.
  // Medido: 88.3 / 51.8 / 100 / 95.1
  './src/modules/auth/': {
    statements: 87,
    branches: 51,
    functions: 100,
    lines: 94,
  },

  // Emision de documentos oficiales.
  // Medido: 74.5 / 60.1 / 75.6 / 75.2
  './src/modules/format/': {
    statements: 74,
    branches: 59,
    functions: 75,
    lines: 74,
  },

  // Marcaciones: el registro con valor legal de la jornada.
  // Medido: 72.3 / 67.2 / 71.2 / 73.3
  './src/modules/entry/': {
    statements: 71,
    branches: 66,
    functions: 70,
    lines: 72,
  },

  // Maestro de personal y reconocimiento.
  // Medido: 73.6 / 65.4 / 66.0 / 74.1
  './src/modules/employee/': {
    statements: 72,
    branches: 64,
    functions: 65,
    lines: 73,
  },

  // Integracion con el sistema externo de nombradas. Es la carpeta mas floja de
  // la base y la que marca el siguiente trabajo: `getNamedBoard`,
  // `getNamedDetail` y `formatNames` concentran casi todo lo no cubierto.
  // Medido: 51.4 / 33.2 / 40.3 / 52.5
  './src/modules/named/': {
    statements: 50,
    branches: 32,
    functions: 39,
    lines: 51,
  },
};
