import { TtlCache } from './ttl-cache';

describe('TtlCache', () => {
  it('devuelve el valor cacheado sin volver a ejecutar la función', async () => {
    const cache = new TtlCache<number>({ ttlMs: 1000 });
    let calls = 0;
    const factory = async () => { calls++; return 42; };

    expect(await cache.wrap('k', factory)).toBe(42);
    expect(await cache.wrap('k', factory)).toBe(42);
    expect(calls).toBe(1);
  });

  it('vuelve a ejecutar la función cuando la entrada caducó', async () => {
    const cache = new TtlCache<number>({ ttlMs: 5 });
    let calls = 0;
    const factory = async () => { calls++; return calls; };

    expect(await cache.wrap('k', factory)).toBe(1);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(await cache.wrap('k', factory)).toBe(2);
  });

  it('comparte una única ejecución entre llamadas concurrentes', async () => {
    const cache = new TtlCache<number>({ ttlMs: 1000 });
    let calls = 0;
    const factory = async () => {
      calls++;
      await new Promise(resolve => setTimeout(resolve, 20));
      return 7;
    };

    const results = await Promise.all([
      cache.wrap('k', factory),
      cache.wrap('k', factory),
      cache.wrap('k', factory),
      cache.wrap('k', factory),
    ]);

    expect(results).toEqual([7, 7, 7, 7]);
    expect(calls).toBe(1);
  });

  it('mantiene separadas las claves distintas', async () => {
    const cache = new TtlCache<string>({ ttlMs: 1000 });
    await cache.wrap('a', async () => 'A');
    await cache.wrap('b', async () => 'B');

    expect(cache.get('a')).toBe('A');
    expect(cache.get('b')).toBe('B');
  });

  it('no cachea el resultado cuando la función falla', async () => {
    const cache = new TtlCache<number>({ ttlMs: 1000 });
    let calls = 0;
    const failing = async () => { calls++; throw new Error('boom'); };

    await expect(cache.wrap('k', failing)).rejects.toThrow('boom');
    await expect(cache.wrap('k', failing)).rejects.toThrow('boom');
    expect(calls).toBe(2);
  });

  it('propaga el fallo a todas las llamadas que comparten la ejecución', async () => {
    const cache = new TtlCache<number>({ ttlMs: 1000 });
    let calls = 0;
    const failing = async () => {
      calls++;
      await new Promise(resolve => setTimeout(resolve, 10));
      throw new Error('boom');
    };

    const results = await Promise.allSettled([cache.wrap('k', failing), cache.wrap('k', failing)]);

    expect(results.every(result => result.status === 'rejected')).toBe(true);
    expect(calls).toBe(1);
  });

  it('descarta la entrada más antigua al superar el máximo', async () => {
    const cache = new TtlCache<number>({ ttlMs: 1000, maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('delete y clear vacían lo cacheado', async () => {
    const cache = new TtlCache<number>({ ttlMs: 1000 });
    cache.set('a', 1);
    cache.set('b', 2);

    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);

    cache.clear();
    expect(cache.get('b')).toBeUndefined();
  });
});
