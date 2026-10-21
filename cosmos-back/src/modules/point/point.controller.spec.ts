import { Test, TestingModule } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
import { PointController } from './point.controller'
import { PointService } from './point.service'

jest.mock('../employee/employee.service', () => ({
  EmployeeService: class EmployeeService {},
}))
jest.mock('../entry/entry.service', () => ({
  EntryService: class EntryService {},
}))
jest.mock('../named/named.service', () => ({
  NamedService: class NamedService {},
}))

describe('PointController', () => {
  let controller: PointController
  let service: jest.Mocked<PointService>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PointController],
      providers: [
        {
          provide: PointService,
          useValue: {
            create: jest.fn().mockResolvedValue({ _id: 'p1' }),
            findAllByEmployeeId: jest.fn().mockResolvedValue([]),
            findAll: jest.fn().mockResolvedValue({ data: [] }),
            findAllByPortId: jest.fn().mockResolvedValue({ data: [] }),
            findOne: jest.fn().mockResolvedValue({ _id: 'p1' }),
            update: jest.fn().mockResolvedValue({ _id: 'p1' }),
            remove: jest.fn().mockResolvedValue({ _id: 'p1' }),
          },
        },
      ],
    }).compile()

    controller = module.get(PointController)
    service = module.get(PointService)
  })

  it('POST delega el DTO', async () => {
    const dto = { portId: 'pt1', name: 'Garita' } as never

    await controller.create(dto)

    expect(service.create).toHaveBeenCalledWith(dto)
  })

  it('GET /by-employee/:id delega el empleado', async () => {
    await controller.findAllByEmployeeId('e1')

    expect(service.findAllByEmployeeId).toHaveBeenCalledWith('e1')
  })

  it('GET /:limit/:page pasa limite, pagina y busqueda', async () => {
    await controller.findAll(20, 2, 'garita')

    expect(service.findAll).toHaveBeenCalledWith(20, 2, 'garita')
  })

  it('GET /by-port pasa puerto, limite, pagina y busqueda en orden', async () => {
    await controller.findAllByPortId('pt1', 20, 2, 'garita')

    expect(service.findAllByPortId).toHaveBeenCalledWith('pt1', 20, 2, 'garita')
  })

  it('/by-employee/:id se declara antes que /:limit/:page', () => {
    const metodos = Object.getOwnPropertyNames(PointController.prototype)

    // Las dos rutas son de dos segmentos, asi que `/point/by-employee/e1` casa
    // con ambas y gana la declarada primero. Al reves, pedir los puntos de un
    // empleado devolveria la pagina "e1" de un listado con limite
    // "by-employee".
    expect(metodos.indexOf('findAllByEmployeeId')).toBeLessThan(
      metodos.indexOf('findAll')
    )
  })

  it('GET por id, PATCH y DELETE delegan el id', async () => {
    await controller.findOne('p1')
    await controller.update('p1', { name: 'Otro' } as never)
    await controller.remove('p1')

    expect(service.findOne).toHaveBeenCalledWith('p1')
    expect(service.update).toHaveBeenCalledWith('p1', { name: 'Otro' })
    expect(service.remove).toHaveBeenCalledWith('p1')
  })

  it('exige el modulo de puntos', () => {
    const reflector = new Reflector()

    // Este test afirmaba `@Roles(Super, Admin)` sobre la clase. `RolesGuard`
    // solo lee el metodo, asi que nunca se aplico; y aplicarlo dejaria sin
    // marcar a la app movil, que entra con el perfil `User`.
    expect(reflector.get<string>('requireModule', PointController)).toBe(
      'puntos'
    )
    expect(reflector.get<string[]>('roles', PointController)).toBeUndefined()
  })

  it('las lecturas que usan marcaciones y la app aceptan tambien marcaciones', () => {
    const reflector = new Reflector()
    const modulos = (metodo: keyof PointController) =>
      reflector.get<string | string[]>(
        'requireModule',
        PointController.prototype[metodo]
      )

    expect(modulos('findAll')).toEqual(['puntos', 'marcaciones'])
    expect(modulos('findAllByEmployeeId')).toEqual(['puntos', 'marcaciones'])
    // Lo que modifica sigue siendo solo de `puntos`: hereda el de la clase.
    expect(modulos('create')).toBeUndefined()
    expect(modulos('update')).toBeUndefined()
    expect(modulos('remove')).toBeUndefined()
  })

  it('propaga el 404 del servicio cuando el empleado no esta nombrado', async () => {
    service.findAllByEmployeeId.mockRejectedValue(
      new Error('El empleado no está nombrado para hoy')
    )

    await expect(controller.findAllByEmployeeId('e1')).rejects.toThrow(
      'no está nombrado'
    )
  })
})
