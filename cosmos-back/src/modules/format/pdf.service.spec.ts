import { HttpStatus } from '@nestjs/common'
import { PdfService } from './pdf.service'

/**
 * La conversion de verdad necesita LibreOffice instalado, asi que aqui se
 * comprueba lo que se puede comprobar en cualquier maquina: que la ausencia del
 * convertidor se explica en vez de reventar, y que la cola no deja pasar mas
 * conversiones de las permitidas.
 */

/** Construye el servicio con la configuracion dada por entorno. */
function buildService(env: Record<string, string>): PdfService {
  const previous = { ...process.env }
  Object.assign(process.env, env)
  try {
    return new PdfService()
  } finally {
    process.env = previous
  }
}

describe('PdfService', () => {
  it('explica que falta LibreOffice en vez de fallar en seco', async () => {
    const service = buildService({ SOFFICE_BIN: 'no-existe-este-binario-cosmos' })

    await expect(service.fromXlsx(Buffer.from('x'), 'formato')).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    })

    // El mensaje tiene que decir que instalar: lo va a leer quien despliega.
    await service.fromXlsx(Buffer.from('x'), 'formato').catch(error => {
      expect(String(error.message)).toMatch(/libreoffice-calc/)
      expect(String(error.message)).toMatch(/SOFFICE_BIN/)
    })
  })

  it('informa de que no esta disponible sin lanzar', async () => {
    const service = buildService({ SOFFICE_BIN: 'no-existe-este-binario-cosmos' })
    await expect(service.available()).resolves.toEqual({ ok: false, version: '' })
  })

  it('no deja correr mas conversiones a la vez de las permitidas', async () => {
    // Cada conversion arranca un proceso de unos 200 MB. Sin cola, cinco
    // descargas simultaneas tumban el contenedor.
    const service = buildService({ PDF_MAX_CONCURRENCY: '2' })
    const slot = (task: () => Promise<unknown>) => (service as any).withSlot(task)

    let running = 0
    let peak = 0
    const release: (() => void)[] = []

    const started = [1, 2, 3, 4, 5].map(() => slot(() => {
      running++
      peak = Math.max(peak, running)
      return new Promise<void>(resolve => release.push(() => { running--; resolve() }))
    }))

    // Se sueltan de una en una, dejando que la cola avance entre medias.
    while (release.length > 0 || running > 0) {
      await new Promise(resolve => setImmediate(resolve))
      release.shift()?.()
      await new Promise(resolve => setImmediate(resolve))
    }
    await Promise.all(started)

    expect(peak).toBe(2)
  })

  it('libera el turno aunque la conversion falle', async () => {
    // Un fallo que no devolviera el turno iria dejando la cola sin huecos hasta
    // que ninguna descarga en PDF volviera a arrancar.
    const service = buildService({ PDF_MAX_CONCURRENCY: '1' })
    const slot = (task: () => Promise<unknown>) => (service as any).withSlot(task)

    await expect(slot(() => Promise.reject(new Error('revento')))).rejects.toThrow('revento')
    await expect(slot(() => Promise.resolve('el turno seguia libre'))).resolves.toBe('el turno seguia libre')
  })
})
