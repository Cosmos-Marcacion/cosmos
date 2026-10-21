import { HttpException } from '@nestjs/common'
import { RateLimiter } from './rate-limiter'

describe('RateLimiter', () => {
  it('deja pasar hasta el maximo y luego responde 429', () => {
    const now = 0
    const limiter = new RateLimiter(2, 1000, () => now)

    limiter.hit('ip:1')
    limiter.hit('ip:1')
    expect(() => limiter.hit('ip:1')).toThrow(HttpException)
    // Otra clave tiene su propio cupo.
    expect(() => limiter.hit('ip:2')).not.toThrow()
  })

  it('libera el cupo cuando pasa la ventana', () => {
    let now = 0
    const limiter = new RateLimiter(1, 1000, () => now)

    limiter.hit('ip:1')
    now = 1000
    expect(() => limiter.hit('ip:1')).not.toThrow()
  })
})
