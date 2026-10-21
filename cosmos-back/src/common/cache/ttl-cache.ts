/**
 * Caché en memoria con expiración por tiempo y coalescing de peticiones.
 *
 * Dos llamadas concurrentes con la misma clave comparten una única ejecución de
 * `factory`, de modo que una ráfaga de peticiones al mismo rango de fechas
 * produce una sola llamada al servicio externo.
 */
export interface TtlCacheOptions {
  /** Tiempo de vida por defecto de cada entrada, en milisegundos. */
  ttlMs: number
  /** Número máximo de entradas antes de descartar la más antigua. */
  maxEntries?: number
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class TtlCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>()
  private readonly inFlight = new Map<string, Promise<T>>()
  private readonly ttlMs: number
  private readonly maxEntries: number

  constructor(options: TtlCacheOptions) {
    this.ttlMs = options.ttlMs
    this.maxEntries = options.maxEntries ?? 200
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) {
      return undefined
    }
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T, ttlMs: number = this.ttlMs): void {
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next()
      if (!oldest.done) {
        this.store.delete(oldest.value)
      }
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
    this.inFlight.clear()
  }

  /**
   * Devuelve el valor cacheado o ejecuta `factory` y cachea su resultado.
   * Si `factory` falla no se cachea nada: el siguiente intento vuelve a ejecutarla.
   */
  async wrap(key: string, factory: () => Promise<T>, ttlMs: number = this.ttlMs): Promise<T> {
    const cached = this.get(key)
    if (cached !== undefined) {
      return cached
    }

    const pending = this.inFlight.get(key)
    if (pending) {
      return pending
    }

    const promise = factory()
      .then(value => {
        this.set(key, value, ttlMs)
        return value
      })
      .finally(() => {
        this.inFlight.delete(key)
      })

    this.inFlight.set(key, promise)
    return promise
  }
}
