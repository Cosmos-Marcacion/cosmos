import { NamedStoreService } from './named-store.service';
import namedData from './mocks/nameds.mock.json';

/**
 * La copia local sólo es segura si reconstruye la respuesta del servicio
 * externo sin alterar un solo campo, y si nunca da por cubierto un rango que
 * no lo está. Eso es lo que se comprueba aquí, usando como entrada la respuesta
 * real de `ListarNombradas` guardada en `mocks/nameds.mock.json`.
 */

// --------------------------------------------------------------------------
// Modelo Mongoose en memoria, con lo justo que usa NamedStoreService
// --------------------------------------------------------------------------

function matches(doc: any, query: any): boolean {
  return Object.entries(query ?? {}).every(([field, condition]: [string, any]) => {
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      if ('$in' in condition) return condition.$in.includes(doc[field]);
      if ('$nin' in condition) return !condition.$nin.includes(doc[field]);
    }
    return doc[field] === condition;
  });
}

function createFakeModel(uniqueKey: string) {
  const docs: any[] = [];

  const chain = (result: any[]) => {
    const api: any = {
      select: () => api,
      sort: (spec: any) => {
        const [field, direction] = Object.entries(spec)[0] as [string, number];
        result.sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * direction);
        return api;
      },
      lean: () => api,
      exec: async () => result,
    };
    return api;
  };

  return {
    docs,
    find: (query: any) => chain(docs.filter(doc => matches(doc, query)).map(doc => ({ ...doc }))),
    bulkWrite: async (operations: any[]) => {
      for (const operation of operations) {
        const { filter, update } = operation.updateOne;
        const existing = docs.find(doc => matches(doc, filter));
        if (existing) {
          Object.assign(existing, update.$set);
        } else {
          docs.push({ ...update.$set });
        }
      }
      return { ok: 1 };
    },
    deleteMany: (query: any) => ({
      exec: async () => {
        for (let i = docs.length - 1; i >= 0; i--) {
          if (matches(docs[i], query)) {
            docs.splice(i, 1);
          }
        }
        return { ok: 1 };
      },
    }),
    _uniqueKey: uniqueKey,
  };
}

function createStore(overrides: Record<string, any> = {}) {
  const namedModel = createFakeModel('staffTransmissionId');
  const syncDayModel = createFakeModel('workerDateIso');
  const configStub = {
    get: (key: string, fallback?: any) => (key in overrides ? overrides[key] : fallback),
  };
  const store = new NamedStoreService(namedModel as any, syncDayModel as any, configStub as any);
  return { store, namedModel, syncDayModel };
}

const MOCK_DAYS = ['2025-09-10', '2025-09-11'];

describe('NamedStoreService', () => {
  describe('conversión de fechas', () => {
    it('convierte dd/mm/yyyy a yyyy-mm-dd', () => {
      const { store } = createStore();
      expect(store.toIsoDate('10/09/2025')).toBe('2025-09-10');
      expect(store.toIsoDate('1/9/2025')).toBe('2025-09-01');
      expect(store.toIsoDate(' 05/12/2026 ')).toBe('2026-12-05');
    });

    it('rechaza formatos que no reconoce, para que se use el servicio externo', () => {
      const { store } = createStore();
      expect(store.toIsoDate('2025-09-10')).toBeNull();
      expect(store.toIsoDate('')).toBeNull();
      expect(store.toIsoDate('sin fecha')).toBeNull();
      expect(store.toIsoDate(undefined as any)).toBeNull();
    });

    it('enumera los días del rango, inclusive, y cruza fin de mes y de año', () => {
      const { store } = createStore();
      expect(store.enumerateDays('2025-09-10', '2025-09-12')).toEqual(['2025-09-10', '2025-09-11', '2025-09-12']);
      expect(store.enumerateDays('2025-12-31', '2026-01-01')).toEqual(['2025-12-31', '2026-01-01']);
      expect(store.enumerateDays('2025-09-10', '2025-09-10')).toEqual(['2025-09-10']);
      expect(store.enumerateDays('2025-09-12', '2025-09-10')).toBeNull();
    });

    it('descarta rangos por encima del tope configurado', () => {
      const { store } = createStore({ NAMED_STORE_MAX_RANGE_DAYS: 5 });
      expect(store.enumerateDays('2025-09-01', '2025-09-30')).toBeNull();
    });
  });

  describe('ida y vuelta', () => {
    it('reconstruye la respuesta del servicio externo campo por campo', async () => {
      const { store } = createStore();
      const listStaff = namedData.listStaff as any[];

      await store.save(listStaff, MOCK_DAYS);
      const restored = await store.getRange('10/09/2025', '11/09/2025');

      expect(restored).toEqual(listStaff);
    });

    it('conserva el orden del detalle de personal', async () => {
      const { store } = createStore();
      const listStaff = namedData.listStaff as any[];

      await store.save(listStaff, MOCK_DAYS);
      const restored = await store.getRange('10/09/2025', '11/09/2025');

      expect(restored![0].listStaffDetail.map(d => d.staff_transmission_detail_id))
        .toEqual(listStaff[0].listStaffDetail.map((d: any) => d.staff_transmission_detail_id));
    });

    it('devuelve sólo las nombradas de los días pedidos', async () => {
      const { store } = createStore();
      await store.save(namedData.listStaff as any[], MOCK_DAYS);

      const restored = await store.getRange('10/09/2025', '10/09/2025');

      expect(restored!.map(n => n.staff_transmission_id)).toEqual([2856, 2857]);
    });
  });

  describe('cobertura', () => {
    it('devuelve null cuando el rango nunca se sincronizó', async () => {
      const { store } = createStore();
      expect(await store.getRange('10/09/2025', '11/09/2025')).toBeNull();
    });

    it('devuelve null cuando falta aunque sea un día del rango', async () => {
      const { store } = createStore();
      await store.save(namedData.listStaff as any[], MOCK_DAYS);

      expect(await store.getRange('10/09/2025', '12/09/2025')).toBeNull();
    });

    it('devuelve lista vacía, y no null, para un día sincronizado sin nombradas', async () => {
      const { store } = createStore();
      await store.save([], ['2025-09-20']);

      expect(await store.getRange('20/09/2025', '20/09/2025')).toEqual([]);
    });

    it('devuelve null cuando la fecha no tiene el formato esperado', async () => {
      const { store } = createStore();
      await store.save(namedData.listStaff as any[], MOCK_DAYS);

      expect(await store.getRange('2025-09-10', '2025-09-11')).toBeNull();
    });

    it('devuelve null si está desactivada por configuración', async () => {
      const { store } = createStore({ NAMED_STORE_ENABLED: 'false' });
      await store.save(namedData.listStaff as any[], MOCK_DAYS);

      expect(store.isEnabled()).toBe(false);
      expect(await store.getRange('10/09/2025', '11/09/2025')).toBeNull();
    });

    it('devuelve null ante un fallo de base de datos, en vez de propagar el error', async () => {
      const { store, syncDayModel } = createStore();
      await store.save(namedData.listStaff as any[], MOCK_DAYS);
      syncDayModel.find = () => { throw new Error('conexión perdida'); };

      expect(await store.getRange('10/09/2025', '11/09/2025')).toBeNull();
    });
  });

  describe('vigencia', () => {
    it('vuelve a pedir los días recientes cuando su copia caducó', async () => {
      const { store, syncDayModel } = createStore({ NAMED_STORE_VOLATILE_TTL_MS: 1000 });
      const today = new Date();
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      await store.save([], [todayIso]);
      const fresh = await store.getRange(
        `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`,
        `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
      );
      expect(fresh).toEqual([]);

      syncDayModel.docs[0].syncedAt = new Date(Date.now() - 60_000);
      const stale = await store.getRange(
        `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`,
        `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
      );
      expect(stale).toBeNull();
    });

    it('no caduca los días cerrados mientras no se configure un TTL para ellos', async () => {
      const { store, syncDayModel } = createStore();
      await store.save(namedData.listStaff as any[], MOCK_DAYS);
      syncDayModel.docs.forEach(doc => { doc.syncedAt = new Date(Date.now() - 400 * 86400000); });

      expect(await store.getRange('10/09/2025', '11/09/2025')).not.toBeNull();
    });
  });

  describe('actualización', () => {
    it('sustituye la nombrada cuando el servicio externo la corrige', async () => {
      const { store } = createStore();
      const listStaff = namedData.listStaff as any[];
      await store.save(listStaff, MOCK_DAYS);

      const corrected = listStaff.map(n =>
        n.staff_transmission_id === 2856 ? { ...n, vessel_description: 'NAVE CORREGIDA' } : n
      );
      await store.save(corrected, MOCK_DAYS);

      const restored = await store.getRange('10/09/2025', '11/09/2025');
      expect(restored!.find(n => n.staff_transmission_id === 2856)!.vessel_description).toBe('NAVE CORREGIDA');
      expect(restored).toHaveLength(listStaff.length);
    });

    it('elimina las nombradas que el servicio externo dejó de reportar', async () => {
      const { store } = createStore();
      const listStaff = namedData.listStaff as any[];
      await store.save(listStaff, MOCK_DAYS);

      await store.save(listStaff.filter(n => n.staff_transmission_id !== 2857), MOCK_DAYS);

      const restored = await store.getRange('10/09/2025', '11/09/2025');
      expect(restored!.map(n => n.staff_transmission_id)).toEqual([2856, 2880]);
    });

    it('no borra nada si el servicio externo responde vacío', async () => {
      const { store } = createStore();
      const listStaff = namedData.listStaff as any[];
      await store.save(listStaff, MOCK_DAYS);

      await store.save([], MOCK_DAYS);

      const restored = await store.getRange('10/09/2025', '11/09/2025');
      expect(restored).toHaveLength(listStaff.length);
    });

    it('invalidateDays fuerza a volver al servicio externo', async () => {
      const { store } = createStore();
      await store.save(namedData.listStaff as any[], MOCK_DAYS);

      await store.invalidateDays(['2025-09-10']);

      expect(await store.getRange('10/09/2025', '11/09/2025')).toBeNull();
    });
  });
});
