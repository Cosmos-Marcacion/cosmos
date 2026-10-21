import { BadRequestException } from '@nestjs/common'
import { ParseObjectIdPipe, parseIntParam, parseNamedIdParam } from './params'

/**
 * Los pipes que cortan en la ruta lo que Mongo no sabe convertir.
 *
 * Sin ellos, un `:id` mal formado o un numero que no es numero llegaban a
 * `findById` o a `skip()` y la API respondia 500 a un error de quien pide.
 */
describe('ParseObjectIdPipe', () => {
  const pipe = new ParseObjectIdPipe()

  it('deja pasar un ObjectId', () => {
    expect(pipe.transform('6862b2dd5b6efa7634310d2f')).toBe(
      '6862b2dd5b6efa7634310d2f'
    )
  })

  it.each([
    ['texto cualquiera', 'no-es-un-id'],
    ['vacio', ''],
    ['ausente', undefined],
    ['un objeto con operador', { $ne: null }],
  ])('rechaza con 400 un id %s', (_caso, valor) => {
    expect(() => pipe.transform(valor)).toThrow(BadRequestException)
  })
})

describe('parseIntParam y parseNamedIdParam', () => {
  it('convierten el texto de la ruta a numero', async () => {
    await expect(
      parseIntParam('El límite').transform('20', { type: 'param' })
    ).resolves.toBe(20)
    await expect(
      parseNamedIdParam().transform('4521', { type: 'param' })
    ).resolves.toBe(4521)
  })

  it('rechazan con 400 y un mensaje en castellano lo que no es entero', async () => {
    await expect(
      parseIntParam('El límite').transform('diez', { type: 'param' })
    ).rejects.toThrow('El límite debe ser un número entero.')
    await expect(
      parseNamedIdParam().transform('abc', { type: 'param' })
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
