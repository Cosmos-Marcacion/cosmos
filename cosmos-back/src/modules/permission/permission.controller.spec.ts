import { Test, TestingModule } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
import { PermissionController } from './permission.controller'
import { PermissionService } from './permission.service'
import { ROLES } from '../auth/enums/roles.enum'

describe('PermissionController', () => {
  let controller: PermissionController
  let service: jest.Mocked<PermissionService>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionController],
      providers: [
        {
          provide: PermissionService,
          useValue: {
            create: jest.fn().mockResolvedValue({ _id: 'perm1' }),
            findAll: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({ _id: 'perm1' }),
            update: jest.fn().mockResolvedValue({ _id: 'perm1' }),
            remove: jest.fn().mockResolvedValue({ _id: 'perm1' }),
          },
        },
      ],
    }).compile()

    controller = module.get(PermissionController)
    service = module.get(PermissionService)
  })

  it('POST delega el DTO', async () => {
    const dto = { userId: 'u1', portId: 'p1' } as never

    await controller.create(dto)

    expect(service.create).toHaveBeenCalledWith(dto)
  })

  it('GET lista sin argumentos', async () => {
    await controller.findAll()

    expect(service.findAll).toHaveBeenCalledWith()
  })

  it('GET por id, PATCH y DELETE pasan el id', async () => {
    await controller.findOne('perm1')
    await controller.update('perm1', { portId: 'p2' } as never)
    await controller.remove('perm1')

    expect(service.findOne).toHaveBeenCalledWith('perm1')
    expect(service.update).toHaveBeenCalledWith('perm1', { portId: 'p2' })
    expect(service.remove).toHaveBeenCalledWith('perm1')
  })

  it('el modulo entero queda restringido a administradores', () => {
    // Los permisos son quien puede entrar a que puerto. Que este endpoint deje
    // de exigir rol de administrador seria una escalada de privilegios, no un
    // detalle de configuracion: se afirma sobre los metadatos del decorador
    // para que el cambio no pueda pasar inadvertido en una revision.
    //
    // Se lee de cada metodo, que es donde mira `RolesGuard`. Antes se afirmaba
    // sobre la clase, donde el guardia no mira: el test pasaba y el endpoint
    // estaba abierto a cualquier sesion.
    const reflector = new Reflector()
    const metodos = [
      'create',
      'findAll',
      'findOne',
      'update',
      'remove',
    ] as const

    for (const metodo of metodos) {
      expect({
        metodo,
        roles: reflector.get<string[]>(
          'roles',
          PermissionController.prototype[metodo]
        ),
      }).toEqual({ metodo, roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN] })
    }
  })
})
