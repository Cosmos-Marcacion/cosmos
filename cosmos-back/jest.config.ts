import type { Config } from 'jest';
import { swcTransform, tsJestTransform, CYCLIC_SERVICES, notLogic } from './test/jest.shared';
import { unitThresholds } from './test/coverage-thresholds';

/**
 * Suite unitaria del backend.
 *
 * La configuracion vivia dentro de package.json con `ts-jest`. Compilar 64
 * suites con el type-checker de TypeScript en cada corrida costaba mas de siete
 * minutos, asi que la transformacion pasa a SWC —el mismo compilador que ya usa
 * `nest build`—. El chequeo de tipos no se pierde: corre aparte en
 * `npm run typecheck`, que es un gate propio del CI.
 *
 * Los tests de integracion (Mongo real en memoria) tienen su propia config en
 * `test/jest-integration.config.ts`; no comparten worker con estos.
 */
const config: Config = {
  displayName: 'unit',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  // El orden importa: Jest aplica el primer patron que casa.
  transform: {
    [CYCLIC_SERVICES]: tsJestTransform,
    '^.+\\.(t|j)s$': swcTransform,
  },
  // Los servicios importan desde la raiz del proyecto (`src/interfaces/...`).
  moduleNameMapper: { '^src/(.*)$': '<rootDir>/src/$1' },
  setupFilesAfterEnv: ['<rootDir>/test/setup-unit.ts'],
  clearMocks: true,
  restoreMocks: true,
  // Un test unitario que tarda mas de 10 s no esta probando una unidad.
  testTimeout: 10_000,

  collectCoverageFrom: ['src/**/*.ts'],
  coveragePathIgnorePatterns: notLogic,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary', 'cobertura'],
  coverageThreshold: unitThresholds,
};

export default config;
