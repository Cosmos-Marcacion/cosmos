import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { spawn } from 'child_process'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { randomUUID } from 'crypto'

/**
 * Conversion del formato a PDF.
 *
 * No se dibuja nada aqui. El PDF sale del **mismo** `.xlsx` que se descarga, y
 * eso es lo que garantiza que ambos sean identicos: no hay dos maquetaciones
 * que mantener sincronizadas, hay una sola y dos formas de sacarla.
 *
 * Quien renderiza es LibreOffice en modo consola. Ninguna libreria de Node sabe
 * paginar estas plantillas: llevan 3 MB de imagenes, 1500 celdas combinadas,
 * areas de impresion y una escala de pagina distinta por hoja. Reproducir eso
 * en HTML seria mantener una segunda version de cada formato que ademas nunca
 * saldria igual.
 *
 * Dos cuidados que no son opcionales:
 *
 * - **Perfil por invocacion.** LibreOffice guarda su estado en un perfil de
 *   usuario y no admite dos procesos sobre el mismo. Sin un perfil propio, dos
 *   descargas simultaneas se pisan y una de las dos falla o se cuelga.
 * - **Limite de concurrencia.** Cada conversion arranca un proceso que ronda
 *   los 200 MB. Sin cola, cinco descargas a la vez tumban el contenedor.
 */

/** Cuantas conversiones pueden correr a la vez. */
const DEFAULT_CONCURRENCY = 2

/** Una conversion que pasa de aqui es que se ha colgado. */
const DEFAULT_TIMEOUT_MS = 120000

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name)

  /** Ruta del binario. En Debian el paquete `libreoffice-calc` deja `soffice`. */
  private readonly soffice = process.env.SOFFICE_BIN ?? 'soffice'
  private readonly timeoutMs = Number(process.env.PDF_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
  private readonly concurrency = Math.max(1, Number(process.env.PDF_MAX_CONCURRENCY ?? DEFAULT_CONCURRENCY))

  /** Turnos libres de la cola. Ver `withSlot`. */
  private running = 0
  private readonly waiting: (() => void)[] = []

  /**
   * Convierte un libro de Excel en PDF.
   *
   * `baseName` solo da nombre a los ficheros temporales; el nombre de descarga
   * lo decide quien llama.
   */
  async fromXlsx(xlsx: Buffer, baseName = 'formato'): Promise<Buffer> {
    return this.withSlot(async () => {
      const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cosmos-pdf-'))
      const safeName = baseName.replace(/[^\w.-]/g, '_').replace(/\.xlsx$/i, '')
      const input = path.join(workDir, `${safeName}.xlsx`)
      // El perfil va dentro del directorio de trabajo para que se borre con el.
      const profile = path.join(workDir, 'profile')

      try {
        await fs.writeFile(input, xlsx)
        await this.runSoffice(input, workDir, profile)

        const output = path.join(workDir, `${safeName}.pdf`)
        const pdf = await fs.readFile(output).catch(() => null)
        if (!pdf || pdf.length === 0) {
          throw new HttpException(
            'La conversion a PDF no produjo ningun fichero. Revisa el registro del convertidor.',
            HttpStatus.INTERNAL_SERVER_ERROR
          )
        }
        return pdf
      } finally {
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => { })
      }
    })
  }

  /** Comprueba que el convertidor esta instalado y responde. */
  async available(): Promise<{ ok: boolean; version: string }> {
    try {
      const version = await new Promise<string>((resolve, reject) => {
        const child = spawn(this.soffice, ['--version'], { windowsHide: true })
        let out = ''
        child.stdout.on('data', chunk => { out += String(chunk) })
        child.on('error', reject)
        child.on('close', () => resolve(out.trim()))
      })
      return { ok: Boolean(version), version }
    } catch {
      return { ok: false, version: '' }
    }
  }

  private runSoffice(input: string, outDir: string, profile: string): Promise<void> {
    const args = [
      '--headless',
      '--norestore',
      '--nolockcheck',
      '--nodefault',
      '--nofirststartwizard',
      // Sin esto, LibreOffice reutiliza el perfil del usuario del sistema y dos
      // conversiones a la vez se estorban.
      `-env:UserInstallation=file:///${profile.replace(/\\/g, '/').replace(/^\//, '')}`,
      '--convert-to',
      'pdf:calc_pdf_Export',
      '--outdir',
      outDir,
      input,
    ]

    return new Promise<void>((resolve, reject) => {
      const child = spawn(this.soffice, args, { windowsHide: true })
      let stderr = ''
      let settled = false

      const timer = setTimeout(() => {
        settled = true
        child.kill('SIGKILL')
        reject(new HttpException(
          `La conversion a PDF paso de ${this.timeoutMs} ms y se ha cortado.`,
          HttpStatus.GATEWAY_TIMEOUT
        ))
      }, this.timeoutMs)

      child.stderr.on('data', chunk => { stderr += String(chunk) })

      child.on('error', (error: NodeJS.ErrnoException) => {
        clearTimeout(timer)
        if (settled) return
        settled = true
        if (error.code === 'ENOENT') {
          this.logger.error(`No se encontro el convertidor "${this.soffice}".`)
          reject(new HttpException(
            'La descarga en PDF no esta disponible: falta LibreOffice en el servidor. ' +
            'Instala el paquete `libreoffice-calc` o apunta SOFFICE_BIN al binario.',
            HttpStatus.SERVICE_UNAVAILABLE
          ))
          return
        }
        reject(error)
      })

      child.on('close', code => {
        clearTimeout(timer)
        if (settled) return
        settled = true
        if (code === 0) {
          resolve()
          return
        }
        this.logger.error(`El convertidor termino con codigo ${code}: ${stderr.trim()}`)
        reject(new HttpException(
          'No se pudo convertir el formato a PDF.',
          HttpStatus.INTERNAL_SERVER_ERROR
        ))
      })
    })
  }

  /**
   * Cola de turnos. Deja pasar `concurrency` conversiones y encola el resto en
   * vez de rechazarlas: quien pide un PDF prefiere esperar a que le digan que
   * vuelva a intentarlo.
   */
  private async withSlot<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency) {
      await new Promise<void>(resolve => this.waiting.push(resolve))
    }
    this.running++
    try {
      return await task()
    } finally {
      this.running--
      this.waiting.shift()?.()
    }
  }
}
