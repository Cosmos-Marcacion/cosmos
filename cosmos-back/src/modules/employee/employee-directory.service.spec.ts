import { EmployeeDirectoryService } from './employee-directory.service'
import { EmployeeService } from './employee.service'
import { VismaService } from '../visma/visma.service'

/** Ficha local, con la proyeccion que devuelve `findAllLean`. */
function local(overrides: Record<string, any> = {}) {
  return {
    _id: { toString: () => 'e1' },
    id: 77,
    firstName: 'DARWIN JAVIER',
    lastName: 'HIDALGO CASTILLO',
    document: '74355639',
    signature: '',
    status: 'active',
    issetFinger: false,
    ...overrides,
  }
}

/** Persona del maestro de Visma. */
function visma(overrides: Record<string, any> = {}) {
  return {
    id: '1177106',
    fullName: 'LEANDRO ROYER MALDONADO GARCIA',
    document: '41591769',
    position: '',
    active: true,
    ...overrides,
  }
}

function build(locals: any[], vismaPeople: any[], minLength = 3) {
  const findAllLean = jest.fn().mockResolvedValue(locals)
  const vismaSearch = jest.fn().mockResolvedValue(vismaPeople)
  const employeeService = { findAllLean } as unknown as EmployeeService
  const vismaService = {
    minSearchLength: () => minLength,
    search: vismaSearch,
  } as unknown as VismaService
  return {
    service: new EmployeeDirectoryService(employeeService, vismaService),
    findAllLean,
    vismaSearch,
  }
}

describe('EmployeeDirectoryService', () => {
  it('sin termino devuelve solo el maestro local y no llama a Visma', async () => {
    const { service, vismaSearch } = build([local()], [visma()])

    const result = await service.search('')

    expect(result.data).toHaveLength(1)
    expect(result.data[0].sources).toEqual(['cosmos'])
    expect(vismaSearch).not.toHaveBeenCalled()
  })

  it('con menos de la longitud minima tampoco consulta a Visma', async () => {
    const { service, vismaSearch } = build([local()], [visma()])

    await service.search('hi')

    expect(vismaSearch).not.toHaveBeenCalled()
  })

  it('suma a quien solo esta en Visma, que antes no se podia registrar', async () => {
    const { service } = build([local()], [visma()])

    const result = await service.search('maldonado')
    const encontrado = result.data.find(p => p.vismaId === '1177106')

    expect(encontrado).toBeDefined()
    expect(encontrado?.sources).toEqual(['visma'])
    expect(encontrado?.employeeId).toBeUndefined()
    expect(encontrado?.id).toBeUndefined()
  })

  it('parte el nombre completo de Visma en apellidos y nombres para poder ordenarlo', async () => {
    const { service } = build([], [visma()])

    const [person] = (await service.search('maldonado')).data

    expect(person.firstName).toBe('LEANDRO ROYER')
    expect(person.lastName).toBe('MALDONADO GARCIA')
  })

  it('no duplica a quien esta en los dos maestros: cruza por documento', async () => {
    const { service } = build(
      [local()],
      [
        visma({
          id: 'V-1',
          document: '74355639',
          fullName: 'DARWIN JAVIER HIDALGO CASTILLO',
        }),
      ]
    )

    const result = await service.search('hidalgo')

    expect(result.data).toHaveLength(1)
    expect(result.data[0].sources).toEqual(['cosmos', 'visma'])
    expect(result.data[0].employeeId).toBe('e1')
    expect(result.data[0].vismaId).toBe('V-1')
    // El nombre que se imprime es el de la ficha local, no el de Visma.
    expect(result.data[0].lastName).toBe('HIDALGO CASTILLO')
  })

  it('cruza aunque los ceros a la izquierda del documento no coincidan', async () => {
    const { service } = build(
      [
        local({
          document: '03501122',
          lastName: 'CRUZ ANTON',
          firstName: 'MANUEL',
        }),
      ],
      [visma({ id: 'V-2', document: '3501122', fullName: 'MANUEL CRUZ ANTON' })]
    )

    const result = await service.search('cruz')

    expect(result.data).toHaveLength(1)
    expect(result.data[0].sources).toEqual(['cosmos', 'visma'])
  })

  it('completa el legajo de Visma en la ficha local que no lo tenia', async () => {
    const { service } = build(
      [local()],
      [
        visma({
          document: '74355639',
          fileNumber: '1001',
          position: 'JEFE DE CUBIERTA',
        }),
      ]
    )

    const [person] = (await service.search('hidalgo')).data

    expect(person.fileNumber).toBe('1001')
    expect(person.position).toBe('JEFE DE CUBIERTA')
  })

  it('si Visma falla se sigue pudiendo registrar a quien esta en Cosmos', async () => {
    const { service, vismaSearch } = build([local()], [])
    vismaSearch.mockRejectedValue(new Error('503'))

    const result = await service.search('hidalgo')

    expect(result.vismaAvailable).toBe(false)
    expect(result.data).toHaveLength(1)
  })

  it('pone el documento exacto el primero', async () => {
    const { service } = build(
      [
        local({ document: '74355639' }),
        local({
          _id: { toString: () => 'e2' },
          id: 78,
          document: '743556391',
          firstName: 'OTRO',
        }),
      ],
      []
    )

    const result = await service.search('74355639')

    expect(result.data[0].document).toBe('74355639')
  })

  it('funde las fichas locales duplicadas y conserva los registros biometricos', async () => {
    const { service } = build(
      [
        local({
          _id: { toString: () => 'e1' },
          id: 77,
          issetFinger: false,
          signature: '',
        }),
        local({
          _id: { toString: () => 'e2' },
          id: 78,
          issetFinger: true,
          signature: 'f.png',
        }),
      ],
      []
    )

    const result = await service.search('')

    expect(result.data).toHaveLength(1)
    expect(result.data[0].issetFinger).toBe(true)
    expect(result.data[0].signature).toBe('f.png')
  })
})
