import { Test, TestingModule } from '@nestjs/testing'
import { Types } from 'mongoose'
import { AssistantService } from './assistant.service'
import { Assistant } from './entities/assistant.entity'
import { createModelMock, modelProvider, query, ModelMock } from '../../testing'

/** Primer argumento de una llamada al mock, con el tipo que se espera. */
const argumento = <T>(mock: jest.Mock, llamada = 0): T =>
  (mock.mock.calls as unknown[][])[llamada][0] as T

describe('AssistantService', () => {
  let service: AssistantService
  let model: ModelMock

  const employeeId = '6862b2dd5b6efa7634310d2f'
  const talkId = '6862b2dd5b6efa7634310d30'
  const otroEmpleado = '6862b2dd5b6efa7634310d31'

  beforeEach(async () => {
    model = createModelMock()
    const module: TestingModule = await Test.createTestingModule({
      providers: [AssistantService, modelProvider(Assistant.name, model)],
    }).compile()

    service = module.get(AssistantService)
  })

  describe('saveByEmployeeIds', () => {
    it('crea una asistencia por empleado', async () => {
      await service.saveByEmployeeIds([employeeId, talkId], talkId)

      expect(model.create).toHaveBeenCalledTimes(2)
    })

    it('convierte empleado y charla a ObjectId', async () => {
      await service.saveByEmployeeIds([employeeId], talkId)

      const guardado = model.create.mock.calls[0][0]
      // Guardados como cadena, el `find({ talkId: ObjectId })` posterior no los
      // encuentra: la charla aparece sin asistentes.
      expect(guardado.employeeId).toBeInstanceOf(Types.ObjectId)
      expect(guardado.talkId).toBeInstanceOf(Types.ObjectId)
    })

    it('con la lista vacia no escribe nada', async () => {
      await expect(service.saveByEmployeeIds([], talkId)).resolves.toEqual([])

      expect(model.create).not.toHaveBeenCalled()
    })

    it('si una insercion falla, la operacion entera falla', async () => {
      model.create
        .mockResolvedValueOnce({ _id: 'a1' })
        .mockRejectedValueOnce(new Error('fallo de escritura'))

      // Documenta el comportamiento: `Promise.all` no revierte lo ya escrito,
      // asi que un fallo a mitad deja asistencias parciales. Reintentar es
      // seguro: los que ya quedaron guardados no se vuelven a crear.
      await expect(
        service.saveByEmployeeIds([employeeId, otroEmpleado], talkId)
      ).rejects.toThrow('fallo de escritura')
    })

    it('no vuelve a crear a quien ya es asistente de la charla', async () => {
      // Antes creaba uno por id sin mirar lo guardado: la persona salia dos
      // veces en la charla y en el formato.
      model.find.mockReturnValue(
        query([{ employeeId: new Types.ObjectId(employeeId) }])
      )

      await service.saveByEmployeeIds([employeeId, otroEmpleado], talkId)

      expect(model.create).toHaveBeenCalledTimes(1)
      const guardado = argumento<{ employeeId: Types.ObjectId }>(model.create)
      expect(guardado.employeeId.toString()).toBe(otroEmpleado)
    })

    it('busca los existentes solo en esa charla', async () => {
      await service.saveByEmployeeIds([employeeId], talkId)

      const filtro = argumento<{ talkId: Types.ObjectId }>(model.find)
      expect(filtro.talkId.toString()).toBe(talkId)
    })

    it('un id repetido en la lista se guarda una vez', async () => {
      await service.saveByEmployeeIds([employeeId, employeeId], talkId)

      expect(model.create).toHaveBeenCalledTimes(1)
    })
  })

  describe('create', () => {
    it('guarda solo empleado y charla, convertidos a ObjectId', async () => {
      await service.create({ employeeId, talkId, extra: 'x' } as never)

      const guardado = model.create.mock.calls[0][0]
      expect(Object.keys(guardado).sort()).toEqual(['employeeId', 'talkId'])
      expect(guardado.employeeId).toBeInstanceOf(Types.ObjectId)
    })
  })

  describe('getByTalkId', () => {
    it('busca por la charla convertida a ObjectId', async () => {
      await service.getByTalkId(talkId)

      const filtro = model.find.mock.calls[0][0] as { talkId: Types.ObjectId }
      expect(filtro.talkId).toBeInstanceOf(Types.ObjectId)
      expect(filtro.talkId.toString()).toBe(talkId)
    })

    it('devuelve empleado y charla resueltos, no sus ids', async () => {
      const empleado = { _id: 'e1', name: 'Ana' }
      const charla = { _id: 't1', topic: 'Seguridad' }
      model.find.mockReturnValue(
        query([{ _id: 'a1', employeeId: empleado, talkId: charla }])
      )

      await expect(service.getByTalkId(talkId)).resolves.toEqual([
        { _id: 'a1', employee: empleado, talk: charla },
      ])
    })

    it('pide poblados los dos lados de la relacion', async () => {
      const cadena = query([])
      model.find.mockReturnValue(cadena)

      await service.getByTalkId(talkId)

      expect(cadena.populate).toHaveBeenCalledWith('employeeId')
      expect(cadena.populate).toHaveBeenCalledWith('talkId')
    })
  })

  describe('borrados', () => {
    it('deleteByTalkId borra todas las asistencias de la charla', async () => {
      await service.deleteByTalkId(talkId)

      const filtro = model.deleteMany.mock.calls[0][0] as {
        talkId: Types.ObjectId
      }
      expect(filtro.talkId.toString()).toBe(talkId)
    })

    it('deleteByEmployeeId borra una sola, no todas las del empleado', async () => {
      await service.deleteByEmployeeId(employeeId, talkId)

      expect(model.findOneAndDelete).toHaveBeenCalled()
      expect(model.deleteMany).not.toHaveBeenCalled()
    })

    it('deleteByEmployeeId borra la asistencia de esa charla, no la de otra', async () => {
      // Filtraba solo por empleado y quitaba su primera asistencia en
      // cualquier charla.
      await service.deleteByEmployeeId(employeeId, talkId)

      const filtro = argumento<{
        employeeId: Types.ObjectId
        talkId: Types.ObjectId
      }>(model.findOneAndDelete)
      expect(filtro.employeeId.toString()).toBe(employeeId)
      expect(filtro.talkId.toString()).toBe(talkId)
    })

    it('remove borra por id', async () => {
      await service.remove('a1')

      expect(model.findByIdAndDelete).toHaveBeenCalledWith('a1')
    })
  })

  describe('update', () => {
    it('pide el documento ya modificado y con las relaciones resueltas', async () => {
      const cadena = query({ _id: 'a1' })
      model.findByIdAndUpdate.mockReturnValue(cadena)

      await service.update('a1', { talkId } as never)

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'a1',
        { talkId },
        { new: true }
      )
      expect(cadena.populate).toHaveBeenCalledWith('employeeId')
    })
  })
})
