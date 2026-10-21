import { BadRequestException, ConflictException } from '@nestjs/common'
import { RoleService } from './role.service'
import { MODULE_KEYS } from '../../common/access/modules'

/**
 * Los perfiles de usuario y su migracion.
 *
 * Lo delicado del cambio no es crear perfiles nuevos: es que los que ya existen
 * sigan funcionando. La plataforma tenia tres roles sin permisos dentro, y el
 * acceso lo decidia su nombre. Si al arrancar con el modelo nuevo un perfil se
 * queda sin `permissions`, todo el mundo se queda fuera a la vez.
 */

interface Fila {
  _id: string
  name: string
  permissions?: string[]
}

/** Un modelo de Mongoose con lo justo que usa el servicio. */
function modelo(filas: Fila[]) {
  const escrituras: { id: string; permissions: string[] }[] = []
  return {
    filas,
    escrituras,
    find: (query: any) => ({
      exec: async () => {
        // Se imita `{ permissions: { $exists: false } }`.
        if (query?.permissions?.$exists === false) {
          return filas.filter(fila => fila.permissions === undefined)
        }
        return filas
      },
    }),
    updateOne: (filtro: any, cambio: any) => ({
      exec: async () => {
        const fila = filas.find(f => f._id === filtro._id)
        if (fila) {
          fila.permissions = cambio.$set.permissions
        }
        escrituras.push({ id: filtro._id, permissions: cambio.$set.permissions })
      },
    }),
    create: async (doc: any) => doc,
    findById: () => ({ exec: async () => null }),
    findOne: () => ({ exec: async () => null }),
    findByIdAndUpdate: (id: string, cambio: any) => ({ exec: async () => ({ _id: id, ...cambio }) }),
    findByIdAndDelete: () => ({ exec: async () => null }),
  }
}

describe('RoleService', () => {
  describe('migracion de los perfiles que ya existian', () => {
    it('da a cada perfil de siempre lo que ya podia hacer', async () => {
      const model = modelo([
        { _id: '1', name: 'Super' },
        { _id: '2', name: 'Admin' },
        { _id: '3', name: 'User' },
      ])
      const service = new RoleService(model as never)

      await service.onModuleInit()

      expect(model.filas[0].permissions).toEqual(MODULE_KEYS)
      expect(model.filas[1].permissions).toEqual(MODULE_KEYS)
      expect(model.filas[2].permissions).toEqual(['panel', 'marcaciones'])
    })

    it('un perfil desconocido recibe lo minimo, no todo', async () => {
      // Equivocarse por defecto tiene que dejar a alguien fuera de una
      // pantalla, no darle la administracion entera.
      const model = modelo([{ _id: '9', name: 'Perfil raro' }])
      const service = new RoleService(model as never)

      await service.onModuleInit()

      expect(model.filas[0].permissions).toEqual(['panel', 'marcaciones'])
    })

    it('no toca un perfil que ya tiene permisos configurados', async () => {
      const model = modelo([{ _id: '1', name: 'Admin', permissions: ['panel'] }])
      const service = new RoleService(model as never)

      await service.onModuleInit()

      expect(model.filas[0].permissions).toEqual(['panel'])
      expect(model.escrituras).toEqual([])
    })

    it('tampoco toca uno al que se le quitaron todos a proposito', async () => {
      // Se distingue por que el campo exista, no por que tenga contenido: un
      // perfil suspendido volveria solo a la vida en cada arranque.
      const model = modelo([{ _id: '1', name: 'Admin', permissions: [] }])
      const service = new RoleService(model as never)

      await service.onModuleInit()

      expect(model.escrituras).toEqual([])
    })

    it('arrancar dos veces no cambia nada la segunda', async () => {
      const model = modelo([{ _id: '3', name: 'User' }])
      const service = new RoleService(model as never)

      await service.onModuleInit()
      const primera = model.escrituras.length
      await service.onModuleInit()

      expect(model.escrituras.length).toBe(primera)
    })
  })

  describe('validacion de permisos', () => {
    it('rechaza un modulo que no existe al crear', () => {
      // Valida antes de tocar la base de datos, asi que rechaza en el acto y no
      // como promesa: no llega a escribirse nada a medias.
      const service = new RoleService(modelo([]) as never)
      expect(() => service.create({ name: 'Nuevo', permissions: ['panel', 'inventado'] } as never))
        .toThrow(BadRequestException)
    })

    it('rechaza un modulo que no existe al actualizar', async () => {
      // Guardado no da error en ningun sitio: el perfil simplemente nunca abre
      // esa pantalla, y averiguar por que se convierte en mirar la base de
      // datos a mano.
      const service = new RoleService(modelo([]) as never)
      expect(() => service.update('1', { permissions: ['no-existe'] } as never))
        .toThrow(BadRequestException)
    })

    it('un perfil nuevo sin permisos nace sin acceso a nada', async () => {
      const service = new RoleService(modelo([]) as never)
      const creado = await service.create({ name: 'Nuevo' } as never)
      expect((creado as any).permissions).toEqual([])
    })

    it('acepta los modulos del catalogo', async () => {
      const service = new RoleService(modelo([]) as never)
      const creado = await service.create(
        { name: 'Supervisor de turno', permissions: ['panel', 'marcaciones'] } as never
      )
      expect((creado as any).permissions).toEqual(['panel', 'marcaciones'])
    })
  })

  describe('borrado', () => {
    const ID = '64b7f0c2a1b2c3d4e5f60718'
    const usuarios = (n: number) => ({ countDocuments: () => ({ exec: () => Promise.resolve(n) }) })

    it('no borra un perfil que tienen usuarios asignado', async () => {
      const roles = modelo([])
      const borrar = jest.spyOn(roles, 'findByIdAndDelete')
      const service = new RoleService(roles as never, usuarios(2) as never)
      await expect(service.remove(ID)).rejects.toThrow(ConflictException)
      expect(borrar).not.toHaveBeenCalled()
    })

    it('borra un perfil sin usuarios', async () => {
      const roles = modelo([])
      const borrar = jest.spyOn(roles, 'findByIdAndDelete')
      const service = new RoleService(roles as never, usuarios(0) as never)
      await service.remove(ID)
      expect(borrar).toHaveBeenCalledWith(ID)
    })
  })

  it('publica el catalogo con el que se construye la pantalla', () => {
    const service = new RoleService(modelo([]) as never)
    expect(service.modules().map(module => module.key)).toEqual(MODULE_KEYS)
  })
})
