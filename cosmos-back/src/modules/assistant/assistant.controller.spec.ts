import { Test, TestingModule } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
import { BadRequestException } from '@nestjs/common'
import { ParseObjectIdPipe } from '../../common/mongo/params'
import { AssistantController } from './assistant.controller'
import { AssistantService } from './assistant.service'

describe('AssistantController', () => {
  let controller: AssistantController
  let service: jest.Mocked<AssistantService>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssistantController],
      providers: [
        {
          provide: AssistantService,
          useValue: {
            create: jest.fn().mockResolvedValue({ _id: 'a1' }),
            saveByEmployeeIds: jest.fn().mockResolvedValue([]),
            findAll: jest.fn().mockResolvedValue([]),
            getByTalkId: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({ _id: 'a1' }),
            update: jest.fn().mockResolvedValue({ _id: 'a1' }),
            deleteByEmployeeId: jest.fn().mockResolvedValue({ _id: 'a1' }),
            deleteByTalkId: jest.fn().mockResolvedValue({ deletedCount: 3 }),
            remove: jest.fn().mockResolvedValue({ _id: 'a1' }),
          },
        },
      ],
    }).compile()

    controller = module.get(AssistantController)
    service = module.get(AssistantService)
  })

  it('POST delega el DTO', async () => {
    const dto = { employeeId: 'e1', talkId: 't1' } as never

    await controller.create(dto)

    expect(service.create).toHaveBeenCalledWith(dto)
  })

  it('POST /save-by-employee-ids desmonta el DTO en lista e id de charla', async () => {
    await controller.saveByEmployeeIds({
      employeeIds: ['e1', 'e2'],
      talkId: 't1',
    } as never)

    // El servicio recibe dos argumentos sueltos, no el DTO: pasarlo entero
    // dejaria la charla sin asistentes y sin error.
    expect(service.saveByEmployeeIds).toHaveBeenCalledWith(['e1', 'e2'], 't1')
  })

  it('GET /talk/:talkId busca por charla', async () => {
    await controller.getByTalkId('t1')

    expect(service.getByTalkId).toHaveBeenCalledWith('t1')
  })

  it('las rutas de borrado por relacion son distintas de la de borrado por id', async () => {
    await controller.deleteByEmployeeId('e1', 't1')
    await controller.deleteByTalkId('t1')
    await controller.remove('a1')

    // Tres borrados con la misma forma de llamada y efectos muy distintos:
    // uno quita una asistencia, otro todas las de una charla. Cruzarlos
    // vaciaria la asistencia de una charla al querer quitar a una persona.
    expect(service.deleteByEmployeeId).toHaveBeenCalledWith('e1', 't1')
    expect(service.deleteByTalkId).toHaveBeenCalledWith('t1')
    expect(service.remove).toHaveBeenCalledWith('a1')
  })

  it('DELETE por charla devuelve el resultado del borrado masivo', async () => {
    await expect(controller.deleteByTalkId('t1')).resolves.toEqual({
      deletedCount: 3,
    })
  })

  it('GET lista, GET por id, PATCH y DELETE delegan', async () => {
    await controller.findAll()
    await controller.findOne('a1')
    await controller.update('a1', { talkId: 't2' } as never)
    await controller.remove('a1')

    expect(service.findAll).toHaveBeenCalledWith()
    expect(service.findOne).toHaveBeenCalledWith('a1')
    expect(service.update).toHaveBeenCalledWith('a1', { talkId: 't2' })
    expect(service.remove).toHaveBeenCalledWith('a1')
  })

  it('exige el modulo de marcaciones, el mismo que las charlas', () => {
    // Pedia `panel`: un perfil con marcaciones y sin panel creaba la charla y
    // no podia anadirle asistentes.
    expect(
      new Reflector().get<string>('requireModule', AssistantController)
    ).toBe('marcaciones')
  })

  it('borrar por empleado exige la charla', () => {
    // Sin `talkId` el pipe responde 400 antes de llegar al servicio.
    expect(() => new ParseObjectIdPipe().transform(undefined)).toThrow(
      BadRequestException
    )
  })
})
