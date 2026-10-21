import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * Limite de peticiones por clave en una ventana de tiempo, en memoria.
 *
 * Es para las rutas publicas de recuperacion de cuenta, que no tienen sesion
 * que frenar: sin limite se puede probar correo tras correo para saber cuales
 * existen, o codigo tras codigo hasta acertar. No se anade `@nestjs/throttler`
 * por dos rutas; el contador vive en el proceso, asi que con varias replicas
 * el limite efectivo se multiplica por el numero de replicas, que sigue siendo
 * un freno suficiente para esto.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {}

  /** Registra un intento; lanza 429 si la clave ya agoto su cupo. */
  hit(
    key: string,
    message = 'Demasiados intentos. Espera unos minutos y vuelve a probar.'
  ): void {
    const now = this.now()
    const recent = (this.hits.get(key) ?? []).filter(
      t => now - t < this.windowMs
    )
    if (recent.length >= this.max) {
      this.hits.set(key, recent)
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS)
    }
    recent.push(now)
    this.hits.set(key, recent)
    if (this.hits.size > 10_000) {
      this.prune(now)
    }
  }

  private prune(now: number) {
    for (const [key, times] of this.hits) {
      if (times.every(t => now - t >= this.windowMs)) {
        this.hits.delete(key)
      }
    }
  }
}
