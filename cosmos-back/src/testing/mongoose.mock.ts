import { getModelToken } from '@nestjs/mongoose';
import type { Provider } from '@nestjs/common';

/**
 * Dobles de prueba para los modelos de Mongoose.
 *
 * Los servicios encadenan (`find().skip().limit().exec()`), asi que un
 * `jest.fn()` pelado no sirve: hay que devolver algo encadenable. `query()`
 * construye ese eslabon y ademas registra que metodos de la cadena se llamaron,
 * de forma que un test puede afirmar sobre la paginacion —el sitio donde de
 * verdad se cuelan los errores— y no solo sobre el resultado final.
 */

export interface QueryStub<T> {
  exec: jest.Mock<Promise<T>, []>
  skip: jest.Mock
  limit: jest.Mock
  sort: jest.Mock
  /** Orden con collation: lo usan los listados que se ordenan en espanol. */
  collation: jest.Mock
  select: jest.Mock
  populate: jest.Mock
  lean: jest.Mock
  then: (
    onfulfilled?: (value: T) => unknown,
    onrejected?: (reason: unknown) => unknown
  ) => Promise<unknown>
}

/**
 * Eslabon encadenable que termina resolviendo `value`.
 *
 * Es *thenable* a proposito: parte del codigo hace `await model.findById(id)`
 * sin `.exec()`, y un doble que solo implementara `exec` fallaria ahi con un
 * `undefined` dificil de rastrear.
 */
export function query<T>(value: T): QueryStub<T> {
  const stub = {} as QueryStub<T>;
  const chain = jest.fn(() => stub);

  stub.exec = jest.fn(() => Promise.resolve(value));
  stub.skip = chain;
  stub.limit = chain;
  stub.sort = chain;
  stub.collation = chain
  stub.select = chain;
  stub.populate = chain;
  stub.lean = chain;
  stub.then = (onfulfilled, onrejected) => Promise.resolve(value).then(onfulfilled, onrejected);

  return stub;
}

/** Eslabon encadenable que termina rechazando con `error`. */
export function failingQuery(error: Error): QueryStub<never> {
  const stub = {} as QueryStub<never>;
  const chain = jest.fn(() => stub);

  stub.exec = jest.fn(() => Promise.reject(error));
  stub.skip = chain;
  stub.limit = chain;
  stub.sort = chain;
  stub.collation = chain
  stub.select = chain;
  stub.populate = chain;
  stub.lean = chain;
  stub.then = (_onfulfilled, onrejected) => Promise.reject(error).then(undefined, onrejected);

  return stub;
}

export type ModelMock = {
  create: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  findById: jest.Mock;
  findByIdAndUpdate: jest.Mock;
  findByIdAndDelete: jest.Mock;
  findOneAndUpdate: jest.Mock;
  findOneAndDelete: jest.Mock;
  updateOne: jest.Mock;
  updateMany: jest.Mock;
  deleteOne: jest.Mock;
  deleteMany: jest.Mock;
  countDocuments: jest.Mock;
  aggregate: jest.Mock;
  insertMany: jest.Mock;
  exists: jest.Mock;
  distinct: jest.Mock;
  bulkWrite: jest.Mock;
  db: { collection: jest.Mock };
};

/**
 * Modelo entero mockeado. Por defecto todo devuelve vacio, que es el estado en
 * el que un test deberia tener que declarar lo que necesita en vez de heredar
 * datos de otro.
 */
export function createModelMock(): ModelMock {
  return {
    create: jest.fn().mockResolvedValue({}),
    find: jest.fn(() => query([])),
    findOne: jest.fn(() => query(null)),
    findById: jest.fn(() => query(null)),
    findByIdAndUpdate: jest.fn(() => query(null)),
    findByIdAndDelete: jest.fn(() => query(null)),
    findOneAndUpdate: jest.fn(() => query(null)),
    findOneAndDelete: jest.fn(() => query(null)),
    updateOne: jest.fn(() => query({ acknowledged: true, modifiedCount: 1 })),
    updateMany: jest.fn(() => query({ acknowledged: true, modifiedCount: 0 })),
    deleteOne: jest.fn(() => query({ acknowledged: true, deletedCount: 1 })),
    deleteMany: jest.fn(() => query({ acknowledged: true, deletedCount: 0 })),
    countDocuments: jest.fn(() => query(0)),
    aggregate: jest.fn(() => query([])),
    insertMany: jest.fn().mockResolvedValue([]),
    exists: jest.fn(() => query(null)),
    distinct: jest.fn(() => query([])),
    bulkWrite: jest.fn().mockResolvedValue({ ok: 1 }),
    db: { collection: jest.fn() },
  };
}

/**
 * Provider listo para `Test.createTestingModule`, atado al token que genera
 * `@InjectModel(Entidad.name)`.
 */
export function modelProvider(entityName: string, mock: ModelMock = createModelMock()): Provider {
  return { provide: getModelToken(entityName), useValue: mock };
}
