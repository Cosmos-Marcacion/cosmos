import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { Types } from 'mongoose'
import * as bcrypt from 'bcryptjs'
import { UserService } from './user.service'
import { User } from './schemas/user.schema'
import { Role } from '../role/entities/role.entity'
import { UploadService } from '../upload/upload.service'
import { getModelToken } from '@nestjs/mongoose'
import { query } from '../../testing'

/**
 * El servicio de usuarios toca dos cosas delicadas a la vez: hashes de
 * contrasena y el perfil que decide los permisos. Los casos se concentran en
 * que la contrasena no salga nunca de aqui y en que el rol se resuelva.
 */
describe('UserService', () => {
  let service: UserService
  let model: jest.Mock & Record<string, jest.Mock>
  let upload: jest.Mocked<UploadService>
  let roleModel: { find: jest.Mock }

  const roleId = new Types.ObjectId('6862b2dd5b6efa7634310d30')
  const superRoleId = new Types.ObjectId('6862b2dd5b6efa7634310d2f')

  /** Documento de Mongoose: lo que importa es `toObject()`. */
  const doc = (data: Record<string, unknown>) => ({
    ...data,
    toObject: () => ({ ...data }),
  })

  const guardado = jest.fn()

  beforeEach(async () => {
    // `create` no se usa: el servicio hace `new this.userModel(...)`, asi que el
    // doble tiene que ser invocable como constructor.
    const constructor = jest.fn().mockImplementation(() => ({ save: guardado }))
    model = Object.assign(constructor, {
      findById: jest.fn(() => query(null)),
      findOne: jest.fn(() => query(null)),
      find: jest.fn(() => query([])),
      // Los listados paginados cuentan aparte las coincidencias: `total` es lo
      // que el panel divide entre el limite para saber cuantas paginas hay.
      countDocuments: jest.fn(() => query(0)),
      findByIdAndUpdate: jest.fn(() => query(null)),
      findByIdAndDelete: jest.fn(() => query(null)),
    }) as never

    guardado.mockResolvedValue({ _id: new Types.ObjectId() })
    roleModel = { find: jest.fn(() => query([])) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getModelToken(User.name), useValue: model },
        { provide: getModelToken(Role.name), useValue: roleModel },
        {
          provide: UploadService,
          useValue: {
            uploadImage: jest.fn().mockResolvedValue('https://cdn/foto.jpg'),
          },
        },
      ],
    }).compile()

    service = module.get(UserService)
    upload = module.get(UploadService)
  })

  describe('findOne y findById', () => {
    it('resuelve el perfil en `role` y quita `roleId`', async () => {
      model.findOne.mockReturnValue(
        query(
          doc({
            email: 'ana@cosmos.com.pe',
            roleId: { name: 'Admin', permissions: ['puertos'] },
          })
        )
      )

      const usuario = await service.findOne('ana@cosmos.com.pe')

      // El login lee `user.role.permissions`. Si el perfil no se resolviera,
      // todo el mundo entraria sin permisos y sin ningun error.
      expect(usuario?.role).toEqual({ name: 'Admin', permissions: ['puertos'] })
      expect(usuario).not.toHaveProperty('roleId')
    })

    it('pide el perfil poblado, no solo su id', async () => {
      const cadena = query(doc({ email: 'ana@cosmos.com.pe', roleId: {} }))
      model.findOne.mockReturnValue(cadena)

      await service.findOne('ana@cosmos.com.pe')

      expect(cadena.populate).toHaveBeenCalledWith('roleId')
    })

    it('devuelve null cuando el correo no esta registrado', async () => {
      await expect(service.findOne('nadie@cosmos.com.pe')).resolves.toBeNull()
    })

    it('busca el correo sin distinguir mayusculas', async () => {
      const cadena = query(doc({ email: 'ana@cosmos.com.pe', roleId: {} }))
      model.findOne.mockReturnValue(cadena)

      await service.findOne(' Ana@Cosmos.com.pe ')

      expect(model.findOne).toHaveBeenCalledWith({ email: 'Ana@Cosmos.com.pe' })
      expect(cadena.collation).toHaveBeenCalledWith({ locale: 'es', strength: 2 })
    })

    it('un correo que no es texto no llega al filtro', async () => {
      await expect(service.findOne({ $ne: null } as never)).resolves.toBeNull()
      expect(model.findOne).not.toHaveBeenCalled()
    })

    it('findById devuelve null cuando el id no existe', async () => {
      await expect(service.findById('inexistente')).resolves.toBeNull()
    })
  })

  describe('create', () => {
    const datos = {
      email: 'ana@cosmos.com.pe',
      name: 'Ana',
      password: 'Secreta123',
      roleId,
    }

    beforeEach(() => {
      model.findById.mockReturnValue(
        query(
          doc({
            _id: 'u1',
            email: datos.email,
            password: 'hash',
            roleId: { name: 'Admin' },
          })
        )
      )
    })

    it('hashea la contrasena antes de construir el documento', async () => {
      await service.create({ ...datos } as never)

      const construido = model.mock.calls[0][0] as { password: string }
      expect(construido.password).not.toBe('Secreta123')
      expect(await bcrypt.compare('Secreta123', construido.password)).toBe(true)
    })

    it('no devuelve la contrasena en la respuesta', async () => {
      const creado = await service.create({ ...datos } as never)

      expect(creado).not.toHaveProperty('password')
    })

    it('sube la imagen y guarda su url cuando viene una', async () => {
      const imagen = {
        buffer: Buffer.from('x'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File

      await service.create({ ...datos } as never, imagen, 'ana.jpg')

      expect(upload.uploadImage).toHaveBeenCalledWith(imagen, 'ana.jpg')
      expect((model.mock.calls[0][0] as { image: string }).image).toBe(
        'https://cdn/foto.jpg'
      )
    })

    it('sin imagen no llama al almacenamiento', async () => {
      await service.create({ ...datos } as never)

      expect(upload.uploadImage).not.toHaveBeenCalled()
      expect((model.mock.calls[0][0] as { image: string }).image).toBe('')
    })

    it('traduce el choque de clave unica a un 400 legible', async () => {
      guardado.mockRejectedValue(
        Object.assign(new Error('E11000'), { code: 11000 })
      )

      // Sin la traduccion sale un 500 y el formulario no puede decirle a quien
      // registra que el correo ya esta tomado.
      await expect(
        service.create({ ...datos } as never)
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('propaga cualquier otro fallo tal cual', async () => {
      guardado.mockRejectedValue(new Error('conexion perdida'))

      await expect(service.create({ ...datos } as never)).rejects.toThrow(
        'conexion perdida'
      )
    })
  })

  describe('findByPagination', () => {
    it('pagina desde 1 y aplana el nombre del perfil', async () => {
      const cadena = query([
        doc({
          email: 'ana@cosmos.com.pe',
          password: 'hash',
          roleId: { name: 'Admin' },
        }),
      ])
      model.find.mockReturnValue(cadena)

      const respuesta = await service.findByPagination(10, 2)

      expect(cadena.skip).toHaveBeenCalledWith(10)
      expect(cadena.limit).toHaveBeenCalledWith(10)
      expect(respuesta.data[0].role).toBe('Admin')
      expect(respuesta.data[0]).not.toHaveProperty('password')
    })

    it('escapa el texto de busqueda', async () => {
      await service.findByPagination(10, 1, 'a.b')

      expect(model.find).toHaveBeenCalledWith({
        $or: [
          { name: { $regex: 'a\\.b', $options: 'i' } },
          { email: { $regex: 'a\\.b', $options: 'i' } },
        ],
      })
    })

    it('total cuenta las coincidencias, no la pagina', async () => {
      // El fallo que este test fija: `total` devolvia cuantos usuarios traia la
      // pagina, asi que el panel calculaba `ceil(10 / 10) = 1` y la paginacion
      // se quedaba clavada en la pagina uno.
      model.find.mockReturnValue(
        query([doc({ email: 'ana@cosmos.com.pe', roleId: { name: 'Admin' } })])
      )
      model.countDocuments.mockReturnValue(query(57))

      const respuesta = await service.findByPagination(10, 1)

      expect(respuesta.total).toBe(57)
    })

    it('cuenta con el mismo filtro con el que lista', async () => {
      await service.findByPagination(10, 1, 'ana')

      // Contar con otro filtro da paginas que existen segun el contador y
      // salen vacias al abrirlas.
      expect(model.countDocuments).toHaveBeenCalledWith(
        model.find.mock.calls[0][0]
      )
    })

    it('ordena por nombre con collation en espanol', async () => {
      const cadena = query([])
      model.find.mockReturnValue(cadena)

      await service.findByPagination(10, 1)

      // Sin collation, "Avila" cae detras de "Zamora" y la ene detras de la
      // zeta: en un maestro de personal peruano eso es media lista descolocada.
      expect(cadena.sort).toHaveBeenCalledWith({ name: 1 })
      expect(cadena.collation).toHaveBeenCalledWith({
        locale: 'es',
        strength: 1,
      })
    })
  })

  describe('findAllExceptSuper', () => {
    it('excluye el perfil de super administrador de la lista', async () => {
      await service.findAllExceptSuper(10, 1)

      const filtro = model.find.mock.calls[0][0] as {
        roleId: { $ne: Types.ObjectId }
      }
      // La pantalla de usuarios no debe mostrar la cuenta raiz: verla es el
      // primer paso para intentar tomarla.
      expect(filtro.roleId.$ne.toString()).toBe(superRoleId.toString())
    })

    it('combina la exclusion con la busqueda en vez de reemplazarla', async () => {
      await service.findAllExceptSuper(10, 1, 'ana')

      const filtro = model.find.mock.calls[0][0] as Record<string, unknown>
      expect(filtro).toHaveProperty('roleId')
      expect(filtro).toHaveProperty('$or')
    })

    it('no devuelve contrasenas', async () => {
      model.find.mockReturnValue(
        query([doc({ email: 'a@b.pe', password: 'hash' })])
      )

      const respuesta = await service.findAllExceptSuper(10, 1)

      expect(respuesta.data[0]).not.toHaveProperty('password')
    })
  })

  describe('findAll', () => {
    it('no devuelve contrasenas', async () => {
      model.find.mockReturnValue(
        query([
          doc({ email: 'a@b.pe', password: 'hash' }),
          doc({ email: 'c@d.pe', password: 'h2' }),
        ])
      )

      const usuarios = await service.findAll()

      expect(usuarios.every(u => !('password' in u))).toBe(true)
    })
  })

  describe('update', () => {
    beforeEach(() => {
      model.findByIdAndUpdate.mockReturnValue(
        query(doc({ _id: 'u1', password: 'hash' }))
      )
    })

    it('hashea la contrasena nueva antes de guardarla', async () => {
      await service.update('u1', { password: 'NuevaClave1' } as never)

      const cambios = model.findByIdAndUpdate.mock.calls[0][1] as {
        password: string
      }
      expect(await bcrypt.compare('NuevaClave1', cambios.password)).toBe(true)
    })

    it('no toca la contrasena cuando el DTO no la trae', async () => {
      await service.update('u1', { name: 'Ana Maria' } as never)

      expect(model.findByIdAndUpdate.mock.calls[0][1]).not.toHaveProperty(
        'password'
      )
    })

    it('pide el documento ya modificado', async () => {
      await service.update('u1', { name: 'Ana' } as never)

      expect(model.findByIdAndUpdate.mock.calls[0][2]).toEqual({ new: true })
    })

    it('no devuelve la contrasena', async () => {
      const actualizado = await service.update('u1', { name: 'Ana' } as never)

      expect(actualizado).not.toHaveProperty('password')
    })

    it('traduce el choque de correo repetido a un 400', async () => {
      model.findByIdAndUpdate.mockReturnValue({
        populate: () => ({
          exec: () =>
            Promise.reject(Object.assign(new Error(), { code: 11000 })),
        }),
      })

      await expect(
        service.update('u1', { email: 'ya@existe.pe' } as never)
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('updatePassword', () => {
    it('guarda la contrasena hasheada, nunca en claro', async () => {
      await service.updatePassword('u1', 'NuevaClave1')

      const cambios = model.findByIdAndUpdate.mock.calls[0][1] as {
        password: string
      }
      expect(cambios.password).not.toBe('NuevaClave1')
      expect(await bcrypt.compare('NuevaClave1', cambios.password)).toBe(true)
    })

    it('actualiza solo el campo de contrasena', async () => {
      await service.updatePassword('u1', 'NuevaClave1')

      expect(
        Object.keys(model.findByIdAndUpdate.mock.calls[0][1] as object)
      ).toEqual(['password'])
    })
  })

  describe('remove', () => {
    it('borra por id', async () => {
      model.findByIdAndDelete.mockReturnValue(query(doc({ _id: 'u1' })))

      await service.remove('u1')

      expect(model.findByIdAndDelete).toHaveBeenCalledWith('u1')
    })
  })

  /** CKI02: el alta de usuarios no puede depender de la pantalla de Perfiles. */
  describe('findAssignableRoles', () => {
    it('a un Admin no le ofrece el perfil Super', async () => {
      await service.findAssignableRoles(['Admin'])

      expect(roleModel.find.mock.calls[0][0]).toEqual({
        name: { $ne: 'Super' },
      })
    })

    it('a un Super le ofrece todos', async () => {
      await service.findAssignableRoles(['Super'])

      expect(roleModel.find.mock.calls[0][0]).toEqual({})
    })
  })
})
