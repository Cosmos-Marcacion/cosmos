import { Test, TestingModule } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
import { RoleController } from './role.controller'
import { RoleService } from './role.service'
import { PLATFORM_MODULES } from '../../common/access/modules'

describe('RoleController', () => {
  let controller: RoleController
  let service: jest.Mocked<RoleService>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoleController],
      providers: [
        {
          provide: RoleService,
          useValue: {
            create: jest.fn().mockResolvedValue({ _id: 'r1' }),
            modules: jest.fn().mockReturnValue(PLATFORM_MODULES),
            findAll: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({ _id: 'r1' }),
            update: jest.fn().mockResolvedValue({ _id: 'r1' }),
            remove: jest.fn().mockResolvedValue({ _id: 'r1' }),
          },
        },
      ],
    }).compile()

    controller = module.get(RoleController)
    service = module.get(RoleService)
  })

  it('POST delega el DTO', async () => {
    const dto = { name: 'Operador', permissions: ['puertos'] } as never

    await controller.create(dto)

    expect(service.create).toHaveBeenCalledWith(dto)
  })

  it('GET /modules devuelve el catalogo de modulos', () => {
    expect(controller.modules()).toBe(PLATFORM_MODULES)
  })

  it('GET /modules se resuelve antes que GET /:id', () => {
    // Las dos rutas casan con `/role/modules`. Si `:id` estuviera declarada
    // primero, la pantalla de perfiles pediria el rol con id "modules" y
    // recibiria null: un menu vacio sin ningun error visible.
    const rutas = Reflector.prototype.constructor
      ? Object.getOwnPropertyNames(RoleController.prototype)
      : []

    expect(rutas.indexOf('modules')).toBeLessThan(rutas.indexOf('findOne'))
  })

  it('GET lista, GET por id, PATCH y DELETE delegan al servicio', async () => {
    await controller.findAll()
    await controller.findOne('r1')
    await controller.update('r1', { name: 'Otro' } as never)
    await controller.remove('r1')

    expect(service.findAll).toHaveBeenCalledWith()
    expect(service.findOne).toHaveBeenCalledWith('r1')
    expect(service.update).toHaveBeenCalledWith('r1', { name: 'Otro' })
    expect(service.remove).toHaveBeenCalledWith('r1')
  })

  it('el modulo entero exige el modulo de perfiles', () => {
    const reflector = new Reflector()

    // Quien edita perfiles se edita a si mismo los permisos. Es la puerta de
    // atras mas directa que tiene la plataforma, y la cierra el modulo.
    //
    // Este test afirmaba ademas `@Roles(Super)` sobre la clase. `RolesGuard`
    // solo lee el metodo, asi que ese rol nunca se aplico: el test daba por
    // protegido algo que no lo estaba. Se comprueba que no quede un rol de
    // clase que aparente una restriccion que no existe.
    expect(reflector.get<string>('requireModule', RoleController)).toBe(
      'perfiles'
    )
    expect(reflector.get<string[]>('roles', RoleController)).toBeUndefined()
  })
})
