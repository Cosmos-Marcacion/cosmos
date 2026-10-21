import { Test, TestingModule } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
import { EntryController } from './entry.controller'
import { EntryService } from './entry.service'
import { BadRequestException, ParseIntPipe } from '@nestjs/common'
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants'
import { ParseObjectIdPipe, parseNamedIdParam } from '../../common/mongo/params'

// `EntryService` esta en un ciclo de importacion con casi todo el dominio; se
// carga por su identidad como token de inyeccion, no por su implementacion, asi
// que los extremos del ciclo se sustituyen por clases vacias.
jest.mock('../named/named.service', () => ({
  NamedService: class NamedService {},
}))
jest.mock('../named/named-record.service', () => ({
  NamedRecordService: class NamedRecordService {},
}))
jest.mock('../employee/employee.service', () => ({
  EmployeeService: class EmployeeService {},
}))
jest.mock('../point/point.service', () => ({
  PointService: class PointService {},
}))
jest.mock('../talk/talk.service', () => ({ TalkService: class TalkService {} }))

describe('EntryController', () => {
  let controller: EntryController
  let service: jest.Mocked<EntryService>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EntryController],
      providers: [
        {
          provide: EntryService,
          useValue: {
            create: jest.fn().mockResolvedValue({ _id: 'x1' }),
            createManual: jest.fn().mockResolvedValue({ _id: 'x1' }),
            checkin: jest.fn().mockResolvedValue({ _id: 'x1' }),
            findAll: jest.fn().mockResolvedValue([]),
            search: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({ _id: 'x1' }),
            update: jest.fn().mockResolvedValue({ _id: 'x1' }),
            remove: jest.fn().mockResolvedValue({ _id: 'x1' }),
            getEntriesByEmployeeId: jest.fn().mockResolvedValue([]),
            getEntriesByEmployeeIdAndNamedId: jest.fn().mockResolvedValue([]),
            remate: jest.fn().mockResolvedValue({}),
            dashboard: jest.fn().mockResolvedValue({}),
            getAssistancesDashboard: jest.fn().mockResolvedValue({}),
            getNamedsDashboard: jest.fn().mockResolvedValue({}),
            getDashboardFilters: jest.fn().mockResolvedValue({}),
            cancelAbsence: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile()

    controller = module.get(EntryController)
    service = module.get(EntryService)
  })

  it('POST, /manual y /checkin delegan su DTO al metodo correspondiente', async () => {
    const dto = { pointId: 'p1', employeeId: 'e1' } as never

    await controller.create(dto)
    await controller.createManual(dto)
    await controller.checkin(dto)

    // Los tres reciben la misma forma de cuerpo pero hacen cosas distintas:
    // `checkin` valida turno y dependencias, `create` escribe sin preguntar.
    expect(service.create).toHaveBeenCalledWith(dto)
    expect(service.createManual).toHaveBeenCalledWith(dto)
    expect(service.checkin).toHaveBeenCalledWith(dto)
  })

  it('convierte el id de nombrada de la ruta a numero', async () => {
    // Llega como cadena de `@Param`. Buscado como texto, el filtro
    // `{ namedId: '9' }` no casa con el numero guardado y la jornada sale vacia.
    // La conversion la hace el pipe de la ruta; el metodo ya recibe el numero.
    const nueve = await parseNamedIdParam().transform('9', { type: 'param' })
    await controller.getEntriesByEmployeeId('e1', nueve, '09/03/2026')

    expect(service.getEntriesByEmployeeId).toHaveBeenCalledWith(
      'e1',
      9,
      '09/03/2026'
    )
  })

  it('lo mismo en la variante por empleado y nombrada', async () => {
    await controller.getEntriesByEmployeeIdAndNamedId('e1', 9, '09/03/2026')

    expect(service.getEntriesByEmployeeIdAndNamedId).toHaveBeenCalledWith(
      'e1',
      9,
      '09/03/2026'
    )
  })

  it('un id de nombrada no numerico se rechaza con 400', async () => {
    // Antes llegaba como NaN: en la variante por nombrada Mongo no sabe
    // convertir NaN a numero y la peticion acababa en 500.
    await expect(
      parseNamedIdParam().transform('abc', { type: 'param' })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('las rutas de la nombrada declaran el pipe que valida el id', () => {
    // Sin el pipe en la ruta, la conversion de arriba no ocurre nunca.
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      EntryController,
      'getEntriesByEmployeeIdAndNamedId'
    ) as Record<string, { pipes: unknown[] }>
    const pipes = Object.values(args).flatMap(arg => arg.pipes)

    expect(pipes.some(pipe => pipe instanceof ParseIntPipe)).toBe(true)
    expect(pipes).toContain(ParseObjectIdPipe)
  })

  it('cada endpoint del dashboard llama a su propio metodo', async () => {
    const dto = { startDate: '2026-03-01', endDate: '2026-03-31' } as never

    await controller.dashboard(dto)
    await controller.dashboardAssistances(dto)
    await controller.dashboardNameds(dto)
    await controller.getDashboardFilters()

    expect(service.dashboard).toHaveBeenCalledWith(dto)
    expect(service.getAssistancesDashboard).toHaveBeenCalledWith(dto)
    expect(service.getNamedsDashboard).toHaveBeenCalledWith(dto)
    expect(service.getDashboardFilters).toHaveBeenCalledWith()
  })

  it('POST /search y /cancel-absence delegan su cuerpo', async () => {
    const busqueda = { startDate: '2026-03-01' } as never
    const cancelacion = { entryId: 'x1' } as never

    await controller.search(busqueda)
    await controller.cancelAbsence(cancelacion)

    expect(service.search).toHaveBeenCalledWith(busqueda)
    expect(service.cancelAbsence).toHaveBeenCalledWith(cancelacion)
  })

  it('GET lista, GET por id, PATCH y DELETE delegan', async () => {
    await controller.findAll()
    await controller.findOne('x1')
    await controller.update('x1', { observation: 'ok' } as never)
    await controller.remove('x1')

    expect(service.findAll).toHaveBeenCalledWith()
    expect(service.findOne).toHaveBeenCalledWith('x1')
    expect(service.update).toHaveBeenCalledWith('x1', { observation: 'ok' })
    expect(service.remove).toHaveBeenCalledWith('x1')
  })

  it('exige el modulo de marcaciones', () => {
    expect(new Reflector().get<string>('requireModule', EntryController)).toBe(
      'marcaciones'
    )
  })
})
