import { Test, TestingModule } from '@nestjs/testing'
import {
  BadRequestException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Types } from 'mongoose'
import * as bcrypt from 'bcryptjs'
import { AuthService } from './auth.service'
import { UserService } from '../user/user.service'
import { MailService } from '../mail/mail.service'
import { PasswordReset } from './entities/password-reset.entity'
import { createModelMock, modelProvider, query, ModelMock } from '../../testing'

/**
 * Es el modulo con mas consecuencias del backend: decide quien entra y con que
 * permisos. Los casos de aqui no miran el camino feliz sino los bordes donde un
 * fallo se convierte en un acceso indebido o en una cuenta secuestrada.
 */
describe('AuthService', () => {
  let service: AuthService
  let users: jest.Mocked<UserService>
  let jwt: jest.Mocked<JwtService>
  let mail: jest.Mocked<MailService>
  let resets: ModelMock

  const userId = new Types.ObjectId('6862b2dd5b6efa7634310d2f')

  /** Usuario tal y como lo devuelve `UserService.findOne` (objeto plano). */
  const usuarioGuardado = (password: string) => ({
    _id: userId,
    email: 'ana@cosmos.com.pe',
    name: 'Ana',
    password,
    role: { name: 'Admin', permissions: ['puertos', 'nombradas'] },
  })

  beforeEach(async () => {
    resets = createModelMock()
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserService,
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ _id: userId }),
            updatePassword: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('token.firmado') },
        },
        {
          provide: MailService,
          useValue: {
            sendPasswordResetCode: jest.fn().mockResolvedValue(undefined),
          },
        },
        modelProvider(PasswordReset.name, resets),
      ],
    }).compile()

    service = module.get(AuthService)
    users = module.get(UserService)
    jwt = module.get(JwtService)
    mail = module.get(MailService)
  })

  describe('register', () => {
    const dto = {
      email: 'ana@cosmos.com.pe',
      password: 'Secreta123',
      name: 'Ana',
      roleId: '6862b2dd5b6efa7634310d30',
    }

    it('nunca guarda la contrasena en claro', async () => {
      await service.register(dto as never)

      const guardado = users.create.mock.calls[0][0] as { password: string }
      expect(guardado.password).not.toBe(dto.password)
      expect(await bcrypt.compare(dto.password, guardado.password)).toBe(true)
    })

    it('convierte el rol a ObjectId antes de guardarlo', async () => {
      await service.register(dto as never)

      const guardado = users.create.mock.calls[0][0] as { roleId: unknown }
      expect(guardado.roleId).toBeInstanceOf(Types.ObjectId)
    })

    it('rechaza un correo ya registrado', async () => {
      users.findOne.mockResolvedValue(usuarioGuardado('hash') as never)

      await expect(service.register(dto as never)).rejects.toBeInstanceOf(
        BadRequestException
      )
      expect(users.create).not.toHaveBeenCalled()
    })
  })

  describe('validateUser', () => {
    it('devuelve el usuario sin la contrasena cuando las credenciales son correctas', async () => {
      const hash = await bcrypt.hash('Secreta123', 10)
      users.findOne.mockResolvedValue(usuarioGuardado(hash) as never)

      const resultado = await service.validateUser(
        'ana@cosmos.com.pe',
        'Secreta123'
      )

      expect(resultado).toMatchObject({ email: 'ana@cosmos.com.pe' })
      // Que el hash salga del servicio es una fuga: acaba en la respuesta del
      // login y de ahi en el almacenamiento del navegador.
      expect(resultado).not.toHaveProperty('password')
    })

    it('devuelve null con la contrasena equivocada', async () => {
      const hash = await bcrypt.hash('Secreta123', 10)
      users.findOne.mockResolvedValue(usuarioGuardado(hash) as never)

      await expect(
        service.validateUser('ana@cosmos.com.pe', 'otra')
      ).resolves.toBeNull()
    })

    it('devuelve null cuando el usuario no existe', async () => {
      await expect(
        service.validateUser('nadie@cosmos.com.pe', 'x')
      ).resolves.toBeNull()
    })

    it('devuelve null si el usuario no tiene contrasena guardada', async () => {
      users.findOne.mockResolvedValue(
        usuarioGuardado(undefined as never) as never
      )

      // Un usuario sin hash —creado por importacion, por ejemplo— no puede
      // convertirse en una cuenta que entra con cualquier clave.
      await expect(
        service.validateUser('ana@cosmos.com.pe', 'loquesea')
      ).resolves.toBeNull()
    })
  })

  describe('login', () => {
    beforeEach(async () => {
      const hash = await bcrypt.hash('Secreta123', 10)
      users.findOne.mockResolvedValue(usuarioGuardado(hash) as never)
    })

    it('firma un token con correo, id, roles y permisos', async () => {
      await service.login({
        email: 'ana@cosmos.com.pe',
        password: 'Secreta123',
      } as never)

      expect(jwt.sign).toHaveBeenCalledWith({
        email: 'ana@cosmos.com.pe',
        userId: userId.toString(),
        roles: ['Admin'],
        permissions: ['puertos', 'nombradas'],
      })
    })

    it('devuelve el token junto al perfil', async () => {
      const respuesta = await service.login({
        email: 'ana@cosmos.com.pe',
        password: 'Secreta123',
      } as never)

      expect(respuesta.access_token).toBe('token.firmado')
      expect(respuesta.permissions).toEqual(['puertos', 'nombradas'])
    })

    it('la respuesta del login no lleva la contrasena', async () => {
      const respuesta = await service.login({
        email: 'ana@cosmos.com.pe',
        password: 'Secreta123',
      } as never)

      expect(respuesta).not.toHaveProperty('password')
    })

    it('un perfil sin permisos declarados entra con la lista vacia, no con todos', async () => {
      const hash = await bcrypt.hash('Secreta123', 10)
      users.findOne.mockResolvedValue({
        ...usuarioGuardado(hash),
        role: { name: 'User' },
      } as never)

      const respuesta = await service.login({
        email: 'ana@cosmos.com.pe',
        password: 'Secreta123',
      } as never)

      expect(respuesta.permissions).toEqual([])
    })

    it('rechaza credenciales incorrectas', async () => {
      await expect(
        service.login({
          email: 'ana@cosmos.com.pe',
          password: 'incorrecta',
        } as never)
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(jwt.sign).not.toHaveBeenCalled()
    })

    it('rechaza una peticion sin correo o sin contrasena antes de tocar la base', async () => {
      await expect(
        service.login({ email: 'ana@cosmos.com.pe' } as never)
      ).rejects.toBeInstanceOf(BadRequestException)
      await expect(
        service.login({ password: 'x' } as never)
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(users.findOne).not.toHaveBeenCalled()
    })
  })

  describe('sendPasswordResetCode', () => {
    it('un correo no registrado se informa y detiene el flujo (CKI19)', async () => {
      users.findOne.mockResolvedValue(null as never)

      // Regla acordada: la plataforma es interna y el usuario tiene que saber
      // que el correo no existe. El limite por IP del controlador frena la
      // enumeracion de cuentas.
      await expect(
        service.sendPasswordResetCode({ email: 'nadie@x.pe' } as never)
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(mail.sendPasswordResetCode).not.toHaveBeenCalled()
      expect(resets.create).not.toHaveBeenCalled()
    })

    it('si el correo no sale, borra el codigo y responde 503 accionable (CKI18)', async () => {
      users.findOne.mockResolvedValue(usuarioGuardado('hash') as never)
      resets.create.mockResolvedValue({ _id: 'r1' })
      mail.sendPasswordResetCode.mockRejectedValue(
        Object.assign(new Error('Invalid login'), {
          code: 'EAUTH',
          responseCode: 535,
        })
      )

      const promesa = service.sendPasswordResetCode({
        email: 'ana@cosmos.com.pe',
      } as never)

      await expect(promesa).rejects.toBeInstanceOf(ServiceUnavailableException)
      await expect(promesa).rejects.toThrow('Inténtalo de nuevo')
      expect(resets.deleteOne).toHaveBeenCalledWith({ _id: 'r1' })
    })

    it('no reenvia antes de un minuto', async () => {
      users.findOne.mockResolvedValue(usuarioGuardado('hash') as never)
      resets.findOne.mockReturnValue(
        query({ createdAt: new Date(Date.now() - 10_000) })
      )

      await expect(
        service.sendPasswordResetCode({ email: 'ana@cosmos.com.pe' } as never)
      ).rejects.toBeInstanceOf(HttpException)
      expect(mail.sendPasswordResetCode).not.toHaveBeenCalled()
    })

    it('genera un codigo de seis digitos', async () => {
      users.findOne.mockResolvedValue(usuarioGuardado('hash') as never)

      await service.sendPasswordResetCode({
        email: 'ana@cosmos.com.pe',
      } as never)

      const { code } = resets.create.mock.calls[0][0]
      expect(code).toMatch(/^\d{6}$/)
    })

    it('borra los codigos anteriores antes de emitir uno nuevo', async () => {
      users.findOne.mockResolvedValue(usuarioGuardado('hash') as never)

      await service.sendPasswordResetCode({
        email: 'ana@cosmos.com.pe',
      } as never)

      // Dejar vivos los codigos viejos multiplica las ventanas abiertas para
      // tomar la cuenta.
      expect(resets.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'ana@cosmos.com.pe' })
      )
      expect(resets.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
        resets.create.mock.invocationCallOrder[0]
      )
    })

    it('envia al correo pedido el mismo codigo que guardo', async () => {
      users.findOne.mockResolvedValue(usuarioGuardado('hash') as never)

      await service.sendPasswordResetCode({
        email: 'ana@cosmos.com.pe',
      } as never)

      const { code } = resets.create.mock.calls[0][0]
      expect(mail.sendPasswordResetCode).toHaveBeenCalledWith({
        toEmail: 'ana@cosmos.com.pe',
        code,
      })
    })

    it('con el correo tecleado en otras mayusculas usa el de la cuenta', async () => {
      users.findOne.mockResolvedValue(usuarioGuardado('hash') as never)

      await service.sendPasswordResetCode({
        email: 'Ana@Cosmos.com.pe',
      } as never)

      expect(resets.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'ana@cosmos.com.pe' })
      )
      expect(mail.sendPasswordResetCode).toHaveBeenCalledWith(
        expect.objectContaining({ toEmail: 'ana@cosmos.com.pe' })
      )
    })
  })

  describe('resetPassword', () => {
    const dto = {
      email: 'ana@cosmos.com.pe',
      code: '123456',
      newPassword: 'NuevaClave1',
    }
    const vigente = (extra: Record<string, unknown> = {}) => ({
      _id: 'r1',
      userId,
      email: dto.email,
      code: '123456',
      attempts: 0,
      ...extra,
    })

    it('cambia la contrasena del usuario dueno del codigo', async () => {
      resets.findOne.mockReturnValue(query(vigente()))

      await service.resetPassword(dto as never)

      // El id sale del registro del codigo, no del cuerpo de la peticion: si
      // saliera del DTO, quien tuviera un codigo propio podria cambiar la clave
      // de otra cuenta.
      expect(users.updatePassword).toHaveBeenCalledWith(
        userId.toString(),
        'NuevaClave1'
      )
    })

    it('rechaza un codigo que no existe', async () => {
      resets.findOne.mockReturnValue(query(null))

      await expect(service.resetPassword(dto as never)).rejects.toBeInstanceOf(
        BadRequestException
      )
      expect(users.updatePassword).not.toHaveBeenCalled()
    })

    it('busca el codigo vigente atado al correo', async () => {
      resets.findOne.mockReturnValue(query(vigente()))

      await service.resetPassword(dto as never)

      // La vigencia se comprueba en la consulta: el TTL de Mongo borra tarde.
      const filtro = resets.findOne.mock.calls[0][0]
      expect(filtro.email).toBe(dto.email)
      expect(filtro.expireAt.$gt).toBeInstanceOf(Date)
    })

    it('un codigo equivocado cuenta el intento y no cambia la clave', async () => {
      resets.findOne.mockReturnValue(query(vigente({ code: '999999' })))

      await expect(service.resetPassword(dto as never)).rejects.toThrow(
        'Te quedan 4 intentos'
      )
      expect(resets.updateOne).toHaveBeenCalledWith(
        { _id: 'r1' },
        { $set: { attempts: 1 } }
      )
      expect(users.updatePassword).not.toHaveBeenCalled()
    })

    it('al quinto intento invalida el codigo', async () => {
      resets.findOne.mockReturnValue(
        query(vigente({ code: '999999', attempts: 4 }))
      )

      await expect(service.resetPassword(dto as never)).rejects.toThrow(
        'Demasiados intentos'
      )
      expect(resets.deleteMany).toHaveBeenCalledWith({
        email: dto.email,
        userId,
      })
    })

    it('invalida los codigos pendientes despues de usar uno', async () => {
      resets.findOne.mockReturnValue(query(vigente()))

      await service.resetPassword(dto as never)

      expect(resets.deleteMany).toHaveBeenCalledWith({
        email: dto.email,
        userId,
      })
    })
  })
})
