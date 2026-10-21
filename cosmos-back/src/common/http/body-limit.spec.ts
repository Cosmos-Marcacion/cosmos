import * as fs from 'fs'
import * as path from 'path'
import { JSON_BODY_LIMIT, JSON_BODY_LIMIT_BYTES } from './body-limit'
import { SEED_DEFINITIONS } from '../../modules/format/v2/definitions/seed'

/**
 * El limite del cuerpo de una peticion, atado al tamano real de los datos.
 *
 * El maestro de formatos envia la definicion entera al guardar un borrador. Con
 * el limite por defecto de Express, 100 KB, guardar fallaba con
 * `PayloadTooLargeError` en cuanto el permiso de trabajo y el ATS entraron en
 * la definicion: un tipo de formato completo pasa de 110 KB.
 *
 * Comparar el limite con lo que ocupan de verdad las definiciones, y no con una
 * cifra escrita a mano, es lo que hace que esto avise cuando las plantillas
 * crezcan. La alternativa es que se entere el usuario a mitad de una edicion.
 */

const ROOT = path.join(__dirname, '..', '..', '..')

/** Bytes que ocupa la definicion mas grande, tal como viaja por la red. */
function largestDefinitionBytes(): { formatType: string; bytes: number } {
  let largest = { formatType: '', bytes: 0 }
  for (const [formatType, definition] of Object.entries(SEED_DEFINITIONS)) {
    const bytes = Buffer.byteLength(JSON.stringify(definition), 'utf8')
    if (bytes > largest.bytes) {
      largest = { formatType, bytes }
    }
  }
  return largest
}

describe('limite del cuerpo de las peticiones', () => {
  it('las dos formas del limite dicen lo mismo', () => {
    const match = /^(\d+)(kb|mb)$/.exec(JSON_BODY_LIMIT)
    expect(match).not.toBeNull()
    const factor = match?.[2] === 'mb' ? 1024 * 1024 : 1024
    expect(Number(match?.[1]) * factor).toBe(JSON_BODY_LIMIT_BYTES)
  })

  it('supera el limite por defecto de Express', () => {
    // 100 KB. Es el que rechazaba guardar un borrador.
    expect(JSON_BODY_LIMIT_BYTES).toBeGreaterThan(100 * 1024)
  })

  it('cabe la definicion de formato mas grande', () => {
    const largest = largestDefinitionBytes()
    expect({
      formato: largest.formatType,
      cabe: largest.bytes < JSON_BODY_LIMIT_BYTES,
    }).toEqual({ formato: largest.formatType, cabe: true })
  })

  it('deja margen de sobra para que crezcan las plantillas', () => {
    const largest = largestDefinitionBytes()
    // Cuatro veces la definicion actual: editar anade casillas, y quedarse
    // justo al borde volveria a romper guardar sin previo aviso.
    expect(JSON_BODY_LIMIT_BYTES).toBeGreaterThan(largest.bytes * 4)
  })

  it('el arranque lo aplica al analizador de JSON', () => {
    // Sin esto, la constante existiria y no la usaria nadie.
    const main = fs.readFileSync(path.join(ROOT, 'src', 'main.ts'), 'utf8')
    expect(main).toContain('JSON_BODY_LIMIT')
    expect(main).toMatch(/useBodyParser\(\s*'json'/)
  })
})
