import 'reflect-metadata'
import { BadRequestException } from '@nestjs/common'
import { PATH_METADATA } from '@nestjs/common/constants'
import { FormatController } from './format.controller'
import { FormatDefinitionController } from './definitions/format-definition.controller'
import { FormatModule } from './format.module'

/**
 * Enrutado del modulo de formatos.
 *
 * `FormatController` declara `@Get(':staffTransmissionId')`, que casa con
 * **cualquier** segmento bajo `/format`, incluido `/format/definitions`. Si se
 * registra antes que el controlador del maestro, se queda con sus peticiones e
 * intenta emitir el formato de una nombrada llamada "definitions": la pantalla
 * respondia `404 No se encontro la nombrada NaN en la fecha undefined`.
 *
 * Express 5 ya no admite restringir un parametro con una expresion regular, asi
 * que lo unico que desambigua es el orden de registro. Y el orden en un arreglo
 * es justo el tipo de cosa que alguien reordena sin saber que importa, de ahi
 * esta prueba.
 */
describe('enrutado del modulo de formatos', () => {
  const controllers: any[] = Reflect.getMetadata('controllers', FormatModule) ?? []

  it('el modulo registra los dos controladores', () => {
    expect(controllers).toContain(FormatController)
    expect(controllers).toContain(FormatDefinitionController)
  })

  it('el maestro se registra antes que la ruta comodin de nombrada', () => {
    expect(controllers.indexOf(FormatDefinitionController))
      .toBeLessThan(controllers.indexOf(FormatController))
  })

  it('sus prefijos se solapan, que es el motivo de la regla anterior', () => {
    const definitions = Reflect.getMetadata(PATH_METADATA, FormatDefinitionController)
    const format = Reflect.getMetadata(PATH_METADATA, FormatController)
    expect(definitions.startsWith(format)).toBe(true)
  })
})

describe('FormatController.parseNamedId', () => {
  // El controlador no se instancia: el metodo es privado y puro, y montar el
  // modulo entero para probar una comprobacion de tres lineas no aporta nada.
  const parse = (value: string) =>
    (FormatController.prototype as any).parseNamedId.call({}, value)

  it('acepta el identificador de una nombrada', () => {
    expect(parse('2856')).toBe(2856)
  })

  it('rechaza un segmento de ruta que no es un numero', () => {
    // Es el caso que se veia en pantalla: `/format/definitions` cayendo aqui.
    expect(() => parse('definitions')).toThrow(BadRequestException)
    expect(() => parse('definitions')).toThrow(/no es el identificador de una nombrada/)
  })

  it('rechaza el vacio, el cero y los negativos', () => {
    for (const value of ['', '0', '-1']) {
      expect(() => parse(value)).toThrow(BadRequestException)
    }
  })

  it('rechaza un decimal', () => {
    expect(() => parse('28.56')).toThrow(BadRequestException)
  })
})
