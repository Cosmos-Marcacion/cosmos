import { EmployeeService } from './employee.service';

/**
 * La sincronización de empleados pasó de una escritura secuencial por usuario a
 * una sola operación agrupada. Aquí se comprueba que el estado final de la
 * colección y los contadores devueltos son idénticos a los de la versión
 * anterior, incluidos los casos que motivaron el arreglo del error E11000:
 * un empleado que cambia de `staff_id` conservando su documento.
 */

// --------------------------------------------------------------------------
// Colección de empleados en memoria, con índice único sobre `document`
// --------------------------------------------------------------------------

class DuplicateKeyError extends Error {
  code = 11000;
  constructor(document: string) {
    super(`E11000 duplicate key error collection: employees index: document_1 dup key: { document: "${document}" }`);
  }
}

function createFakeEmployeeModel(seed: any[] = []) {
  let counter = 0;
  const docs: any[] = seed.map(doc => ({ ...doc, _id: doc._id ?? `seed-${counter++}` }));

  const assertUniqueDocument = (document: string, ownId: string | null) => {
    if (!document) return;
    const clash = docs.find(doc => doc.document === document && doc._id !== ownId);
    if (clash) {
      throw new DuplicateKeyError(document);
    }
  };

  const model: any = {
    docs,
    find: (_query: any) => ({
      select: () => ({ exec: async () => docs.map(doc => ({ ...doc })) }),
      exec: async () => docs.map(doc => ({ ...doc })),
    }),
    findByIdAndUpdate: (id: any, data: any) => ({
      exec: async () => {
        const target = docs.find(doc => doc._id === id);
        if (!target) return null;
        assertUniqueDocument(data.document, target._id);
        Object.assign(target, data);
        return { ...target };
      },
    }),
    create: async (data: any) => {
      assertUniqueDocument(data.document, null);
      const created = { ...data, _id: `new-${counter++}` };
      docs.push(created);
      return created;
    },
    bulkWrite: async (operations: any[]) => {
      const writeErrors: any[] = [];
      operations.forEach((operation, index) => {
        try {
          if (operation.insertOne) {
            const data = operation.insertOne.document;
            assertUniqueDocument(data.document, null);
            docs.push({ ...data, _id: `new-${counter++}` });
            return;
          }
          const { filter, update } = operation.updateOne;
          const target = docs.find(doc => doc._id === filter._id);
          if (!target) return;
          assertUniqueDocument(update.$set.document, target._id);
          Object.assign(target, update.$set);
        } catch (error: any) {
          writeErrors.push({ index, code: error.code, errmsg: error.message });
        }
      });
      if (writeErrors.length > 0) {
        const error: any = new Error('bulk write error');
        error.writeErrors = writeErrors;
        throw error;
      }
      return { ok: 1 };
    },
  };

  return model;
}

function snapshot(model: any) {
  return model.docs
    .map(({ id, firstName, lastName, document, status }) => ({ id, firstName, lastName, document, status }))
    .sort((a: any, b: any) => (a.id ?? 0) - (b.id ?? 0) || String(a.document).localeCompare(String(b.document)));
}

// --------------------------------------------------------------------------
// Implementación original (escritura secuencial, una por usuario)
// --------------------------------------------------------------------------

async function originalSync(employeeModel: any, namedResponse: any) {
  const activeUsers = namedResponse.listUsers.filter(user => user.status_description === 'ACTIVO');
  if (activeUsers.length === 0) {
    return { totalProcessed: 0, newEmployees: 0, existingEmployees: 0, errors: [] };
  }

  const allEmployees = await employeeModel.find({}).exec();
  let newEmployees = 0;
  let existingEmployees = 0;
  const errors: string[] = [];

  for (const user of activeUsers) {
    try {
      const existingEmployee = allEmployees.find(employee =>
        employee.id === user.staff_id || (user.personal_id && employee.document === user.personal_id)
      );
      if (existingEmployee) {
        existingEmployees++;
        await employeeModel.findByIdAndUpdate(existingEmployee._id, {
          id: user.staff_id,
          firstName: user.first_name,
          lastName: `${user.last_name} ${user.mother_last_name}`,
          document: user.personal_id,
          status: 'active'
        }, { new: true }).exec();
        continue;
      }
      await employeeModel.create({
        id: user.staff_id,
        firstName: user.first_name,
        lastName: `${user.last_name} ${user.mother_last_name}`,
        document: user.personal_id,
        status: 'active',
      });
      newEmployees++;
    } catch (error) {
      errors.push(`Error procesando usuario ${user.staff_id}: ${error.message}`);
    }
  }

  return { totalProcessed: activeUsers.length, newEmployees, existingEmployees, errors };
}

function createService(model: any, namedResponse: any) {
  const service: any = Object.create(EmployeeService.prototype);
  service.employeeModel = model;
  service.namedService = { getAllUsers: async () => namedResponse };
  return service;
}

function user(staffId: number, personalId: string, first = 'NOMBRE', last = 'AP', mother = 'AM', status = 'ACTIVO') {
  return {
    staff_id: staffId,
    personal_id: personalId,
    first_name: first,
    last_name: last,
    mother_last_name: mother,
    status_description: status,
  };
}

// --------------------------------------------------------------------------

describe('EmployeeService · sincronización desde el servicio externo', () => {
  const scenarios: Array<{ name: string; seed: any[]; response: any }> = [
    {
      name: 'colección vacía, todos los usuarios son nuevos',
      seed: [],
      response: { listUsers: [user(4022, '41169567'), user(4023, '41169568'), user(4024, '41169569')] },
    },
    {
      name: 'todos ya existen y coinciden por staff_id',
      seed: [
        { _id: 'a', id: 4022, document: '41169567', firstName: 'VIEJO', lastName: 'VIEJO', status: 'active' },
        { _id: 'b', id: 4023, document: '41169568', firstName: 'VIEJO', lastName: 'VIEJO', status: 'active' },
      ],
      response: { listUsers: [user(4022, '41169567', 'HENRY'), user(4023, '41169568', 'MARIA')] },
    },
    {
      name: 'un empleado cambia de staff_id conservando su documento (caso E11000)',
      seed: [
        { _id: 'a', id: 4022, document: '41169567', firstName: 'HENRY', lastName: 'ESPINOZA RETO', status: 'active' },
      ],
      response: { listUsers: [user(7777, '41169567', 'HENRY')] },
    },
    {
      name: 'se ignoran los usuarios que no están activos',
      seed: [],
      response: {
        listUsers: [
          user(4022, '41169567'),
          user(4023, '41169568', 'X', 'Y', 'Z', 'CESADO'),
          user(4024, '41169569', 'X', 'Y', 'Z', 'INACTIVO'),
        ],
      },
    },
    {
      name: 'dos usuarios externos apuntan al mismo empleado local',
      seed: [
        { _id: 'a', id: 4022, document: '41169567', firstName: 'HENRY', lastName: 'ESPINOZA', status: 'active' },
      ],
      response: { listUsers: [user(4022, '41169567', 'PRIMERO'), user(9999, '41169567', 'SEGUNDO')] },
    },
    {
      name: 'dos usuarios nuevos comparten documento y uno choca con el índice único',
      seed: [],
      response: { listUsers: [user(5001, '44444444', 'UNO'), user(5002, '44444444', 'DOS')] },
    },
    {
      name: 'mezcla de altas, actualizaciones e inactivos',
      seed: [
        { _id: 'a', id: 4022, document: '41169567', firstName: 'VIEJO', lastName: 'VIEJO', status: 'active' },
        { _id: 'b', id: 5555, document: '42222222', firstName: 'OTRO', lastName: 'OTRO', status: 'active' },
      ],
      response: {
        listUsers: [
          user(4022, '41169567', 'ACTUALIZADO'),
          user(6001, '43333333', 'NUEVO'),
          user(5555, '42222222', 'TAMBIEN'),
          user(6002, '43333334', 'X', 'Y', 'Z', 'CESADO'),
        ],
      },
    },
    {
      name: 'lista de usuarios activos vacía',
      seed: [{ _id: 'a', id: 4022, document: '41169567', firstName: 'HENRY', lastName: 'ESPINOZA', status: 'active' }],
      response: { listUsers: [user(4023, '41169568', 'X', 'Y', 'Z', 'CESADO')] },
    },
  ];

  scenarios.forEach(scenario => {
    it(`produce el mismo resultado que la versión secuencial: ${scenario.name}`, async () => {
      const originalModel = createFakeEmployeeModel(scenario.seed);
      const originalResult = await originalSync(originalModel, scenario.response);

      const newModel = createFakeEmployeeModel(scenario.seed);
      const service = createService(newModel, scenario.response);
      const newResult = await service.syncEmployeesFromNamedService();

      expect(snapshot(newModel)).toEqual(snapshot(originalModel));
      expect(newResult.totalProcessed).toBe(originalResult.totalProcessed);
      expect(newResult.existingEmployees).toBe(originalResult.existingEmployees);
      expect(newResult.newEmployees).toBe(originalResult.newEmployees);
      expect(newResult.errors.length).toBe(originalResult.errors.length);
    });
  });

  it('escribe una sola vez, en lugar de una vez por empleado', async () => {
    const listUsers = Array.from({ length: 200 }, (_, i) => user(7000 + i, `${45000000 + i}`));
    const model = createFakeEmployeeModel([]);
    let bulkWrites = 0;
    const originalBulkWrite = model.bulkWrite;
    model.bulkWrite = async (operations: any[]) => {
      bulkWrites++;
      return originalBulkWrite(operations);
    };
    let individualWrites = 0;
    model.findByIdAndUpdate = () => { individualWrites++; return { exec: async () => null }; };
    model.create = async () => { individualWrites++; return {}; };

    const service = createService(model, { listUsers });
    const result = await service.syncEmployeesFromNamedService();

    expect(result.totalProcessed).toBe(200);
    expect(result.newEmployees).toBe(200);
    expect(bulkWrites).toBe(1);
    expect(individualWrites).toBe(0);
    expect(model.docs).toHaveLength(200);
  });

  it('rechaza una respuesta con forma inválida del servicio externo', async () => {
    const service = createService(createFakeEmployeeModel([]), { algo: 'raro' });
    await expect(service.syncEmployeesFromNamedService()).rejects.toThrow(/Error al sincronizar empleados/);
  });
});
