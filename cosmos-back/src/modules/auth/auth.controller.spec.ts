import { Test, TestingModule } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { ROLES } from './enums/roles.enum'

describe('AuthController', () => {
  let controller: AuthController
  let service: jest.Mocked<AuthService>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest
              .fn()
              .mockResolvedValue({ message: 'Usuario creado correctamente' }),
            login: jest
              .fn()
              .mockResolvedValue({ access_token: 'token.firmado' }),
            sendPasswordResetCode: jest
              .fn()
              .mockResolvedValue({ message: 'ok' }),
            resetPassword: jest.fn().mockResolvedValue({ message: 'ok' }),
          },
        },
      ],
    }).compile()

    controller = module.get(AuthController)
    service = module.get(AuthService)
  })

  it('POST /register delega el DTO', async () => {
    const dto = {
      email: 'ana@cosmos.com.pe',
      password: 'x',
      name: 'Ana',
      roleId: 'r1',
    } as never

    await controller.register(dto)

    expect(service.register).toHaveBeenCalledWith(dto)
  })

  it('solo un super administrador puede registrar usuarios', () => {
    // Es el endpoint que crea cuentas. Que se relaje el rol seria una via para
    // que un administrador normal se fabrique acceso.
    const roles = new Reflector().get<string[]>(
      'roles',
      AuthController.prototype.register
    )

    expect(roles).toEqual([ROLES.SUPER_ADMIN])
  })

  it('POST /login pasa el cuerpo al servicio', async () => {
    const credenciales = { email: 'ana@cosmos.com.pe', password: 'Secreta123' }

    await expect(controller.login(credenciales)).resolves.toEqual({
      access_token: 'token.firmado',
    })
    expect(service.login).toHaveBeenCalledWith(credenciales)
  })

  it('GET /profile devuelve el usuario que puso el guard, sin consultar la base', () => {
    const usuario = { email: 'ana@cosmos.com.pe', roles: ['Admin'] }

    expect(controller.getProfile({ user: usuario })).toEqual(usuario)
  })

  it('POST /password/send-code y /password/reset delegan su DTO', async () => {
    await controller.sendPasswordCode(
      { email: 'ana@cosmos.com.pe' } as never,
      '10.0.0.1'
    )
    await controller.resetPassword(
      {
        email: 'ana@cosmos.com.pe',
        code: '123456',
        newPassword: 'NuevaClave1',
      } as never,
      '10.0.0.1'
    )

    expect(service.sendPasswordResetCode).toHaveBeenCalledWith({
      email: 'ana@cosmos.com.pe',
    })
    expect(service.resetPassword).toHaveBeenCalledWith({
      email: 'ana@cosmos.com.pe',
      code: '123456',
      newPassword: 'NuevaClave1',
    })
  })

  it('propaga el rechazo del login sin convertirlo en una respuesta vacia', async () => {
    service.login.mockRejectedValue(new Error('Credenciales inválidas'))

    await expect(controller.login({})).rejects.toThrow('Credenciales inválidas')
  })

  it('limita las solicitudes de codigo por IP', async () => {
    for (let i = 0; i < 10; i++) {
      await controller.sendPasswordCode(
        { email: 'ana@cosmos.com.pe' } as never,
        '10.0.0.9'
      )
    }

    // Ahora que un correo no registrado se informa, sin este freno el endpoint
    // serviria para averiguar que correos existen.
    await expect(
      controller.sendPasswordCode(
        { email: 'x@cosmos.com.pe' } as never,
        '10.0.0.9'
      )
    ).rejects.toMatchObject({ status: 429 })
  })
})
