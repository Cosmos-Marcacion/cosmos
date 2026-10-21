import type { Config } from 'jest';
import { swcTransform, tsJestTransform, CYCLIC_SERVICES, notLogic } from './jest.shared';

/**
 * Suite de integracion: Nest de verdad, Mongo de verdad (en memoria), HTTP de
 * verdad via supertest.
 *
 * Corre en serie y con un solo worker. No es por prudencia: cada worker
 * levantaria su propio `mongod`, y con eso el tiempo de arranque supera al de
 * los propios tests.
 */
const config: Config = {
  displayName: 'integration',
  rootDir: '..',
  roots: ['<rootDir>/test'],
  testMatch: ['<rootDir>/test/**/*.int-spec.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  // El orden importa: Jest aplica el primer patron que casa.
  transform: {
    [CYCLIC_SERVICES]: tsJestTransform,
    '^.+\\.(t|j)s$': swcTransform,
  },
  moduleNameMapper: { '^src/(.*)$': '<rootDir>/src/$1' },
  setupFilesAfterEnv: ['<rootDir>/test/setup-integration.ts'],
  clearMocks: true,
  restoreMocks: true,
  // La primera corrida descarga el binario de mongod.
  testTimeout: 60_000,
  maxWorkers: 1,

  collectCoverageFrom: ['src/**/*.ts'],
  coveragePathIgnorePatterns: notLogic,
  coverageDirectory: '<rootDir>/coverage-integration',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
};

export default config;
