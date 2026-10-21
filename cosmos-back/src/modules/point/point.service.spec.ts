import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { Types } from 'mongoose'
import { PointService } from './point.service'
import { Point } from './entities/point.entity'
import { EmployeeService } from '../employee/employee.service'
import { EntryService } from '../entry/entry.service'
import { NamedService } from '../named/named.service'
import { createModelMock, modelProvider, query, ModelMock } from '../../testing'

// Los tres servicios forman un ciclo de importacion con este modulo; en la
// aplicacion lo resuelve Nest, pero cargarlos sueltos rompe la inicializacion.
jest.mock('../employee/employee.service', () => ({
  EmployeeService: class EmployeeService {},
}))
jest.mock('../entry/entry.service', () => ({
  EntryService: class EntryService {},
}))
jest.mock('../named/named.service', () => ({
  NamedService: class NamedService {},
}))

describe('PointService', () => {
  let service: PointService
  let model: ModelMock
  let employees: { findOne: jest.Mock }
  let entries: { getEntriesByNamedId: jest.Mock }
  let nameds: { getNameds: jest.Mock }

  const portId = '6862b2dd5b6efa7634310d2f'
  const doc = (data: Record<string, unknown>) => ({
    ...data,
    toObject: () => ({ ...data }),
  })

  beforeEach(async () => {
    model = createModelMock()
    employees = { findOne: jest.fn().mockResolvedValue({ id: 77 }) }
    entries = { getEntriesByNamedId: jest.fn().mockResolvedValue([]) }
    nameds = { getNameds: jest.fn().mockResolvedValue({ listStaff: [] }) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PointService,
        modelProvider(Point.name, model),
        { provide: EmployeeService, useValue: employees },
        { provide: EntryService, useValue: entries },
        { provide: NamedService, useValue: nameds },
      ],
    }).compile()

    service = module.get(PointService)
  })

  describe('create', () => {
    it('numera el punto nuevo detras del ultimo del puerto', async () => {
      model.findOne.mockReturnValue(query({ order: 4 }))

      await service.create({ portId, name: 'Garita' } as never)

      // El orden decide la secuencia de marcaje. Repetirlo dejaria dos puntos
      // empatados y el recorrido dejaria de ser una fila.
      expect(model.create.mock.calls[0][0].order).toBe(5)
    })

    it('el primer punto de un puerto empieza en 1, no en 0', async () => {
      model.findOne.mockReturnValue(query(null))

      await service.create({ portId, name: 'Garita' } as never)

      expect(model.create.mock.calls[0][0].order).toBe(1)
    })

    it('un ultimo punto sin orden se trata como 0', async () => {
      model.findOne.mockReturnValue(query({ order: undefined }))

      await service.create({ portId, name: 'Garita' } as never)

      expect(model.create.mock.calls[0][0].order).toBe(1)
    })

    it('busca el ultimo punto del puerto, ordenado al reves', async () => {
      const cadena = query(null)
      model.findOne.mockReturnValue(cadena)

      await service.create({ portId, name: 'Garita' } as never)

      expect(cadena.sort).toHaveBeenCalledWith({ order: -1 })
    })

    it('convierte el puerto a ObjectId', async () => {
      await service.create({ portId, name: 'Garita' } as never)

      expect(model.create.mock.calls[0][0].portId).toBeInstanceOf(
        Types.ObjectId
      )
    })

    it('sin dependencia guarda null, no undefined', async () => {
      await service.create({ portId, name: 'Garita' } as never)

      // `undefined` no se persiste: el campo desapareceria del documento y
      // distinguir "sin dependencia" de "campo que falta" dejaria de ser
      // posible al leerlo.
      expect(model.create.mock.calls[0][0].dependOnId).toBeNull()
    })

    it('con dependencia la convierte a ObjectId', async () => {
      model.findById.mockReturnValue(query({ portId }))
      await service.create({
        portId,
        name: 'Garita',
        dependOnId: portId,
      } as never)

      expect(model.create.mock.calls[0][0].dependOnId).toBeInstanceOf(
        Types.ObjectId
      )
    })
  })

  describe('formatDate y getZeroMonth', () => {
    it('formatDate pasa de dia/mes/ano a ISO', () => {
      expect(service.formatDate('09/03/2026')).toBe('2026-03-09')
    })

    it('getZeroMonth rellena con cero a la izquierda', () => {
      expect(service.getZeroMonth(3)).toBe('03')
      expect(service.getZeroMonth(12)).toBe('12')
    })
  })

  describe('sortByStaffTransmissionId', () => {
    it('ordena de la nombrada mas reciente a la mas antigua', () => {
      const ordenadas = service.sortByStaffTransmissionId([
        { staff_transmission_id: 5 },
        { staff_transmission_id: 9 },
        { staff_transmission_id: 7 },
      ] as never)

      expect(ordenadas.map(n => n.staff_transmission_id)).toEqual([9, 7, 5])
    })
  })

  describe('findAllByEmployeeId', () => {
    const puntos = [
      doc({ _id: 'p1', order: 1, name: 'Garita' }),
      doc({ _id: 'p2', order: 2, name: 'Muelle' }),
    ]

    const nombrada = (id: number) => ({
      staff_transmission_id: id,
      staff_vessel_number: 'V-1',
      vessel_description: 'Nave',
      shift_description: 'Dia',
      listStaffDetail: [{ staff_id: 77 }],
    })

    beforeEach(() => {
      model.find.mockReturnValue(query(puntos))
    })

    it('falla con 404 si el empleado no existe', async () => {
      employees.findOne.mockResolvedValue(null)

      await expect(service.findAllByEmployeeId('e1')).rejects.toBeInstanceOf(
        NotFoundException
      )
    })

    it('falla con 404 si el empleado no esta nombrado', async () => {
      nameds.getNameds.mockResolvedValue({ listStaff: [] })

      await expect(service.findAllByEmployeeId('e1')).rejects.toBeInstanceOf(
        NotFoundException
      )
    })

    it('descarta las nombradas de otras personas', async () => {
      nameds.getNameds.mockResolvedValue({
        listStaff: [{ ...nombrada(9), listStaffDetail: [{ staff_id: 99 }] }],
      })

      await expect(service.findAllByEmployeeId('e1')).rejects.toBeInstanceOf(
        NotFoundException
      )
    })

    it('pide las nombradas de ayer y hoy', async () => {
      nameds.getNameds.mockResolvedValue({ listStaff: [nombrada(9)] })

      await service.findAllByEmployeeId('e1')

      // La jornada cruza la medianoche: mirar solo hoy dejaria fuera a quien
      // entro anoche y aun no ha salido.
      const { sInitialDate, sFinalDate } = nameds.getNameds.mock.calls[0][0]
      expect(sInitialDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
      expect(sFinalDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
      expect(sInitialDate).not.toBe(sFinalDate)
    })

    it('marca como checked los puntos con marcacion de la nombrada en curso', async () => {
      nameds.getNameds.mockResolvedValue({ listStaff: [nombrada(9)] })
      entries.getEntriesByNamedId.mockResolvedValue([
        { pointId: { _id: 'p1' }, namedId: 9, date: '2026-03-09T06:00:00Z' },
      ])

      const resultado = await service.findAllByEmployeeId('e1')

      expect(resultado[0]).toMatchObject({
        isChecked: true,
        dateCheck: '2026-03-09T06:00:00Z',
      })
      expect(resultado[1]).toMatchObject({ isChecked: false, dateCheck: '' })
    })

    it('una marcacion de otra nombrada no cuenta como checked', async () => {
      nameds.getNameds.mockResolvedValue({ listStaff: [nombrada(9)] })
      entries.getEntriesByNamedId.mockResolvedValue([
        { pointId: { _id: 'p1' }, namedId: 8 },
      ])

      const resultado = await service.findAllByEmployeeId('e1')

      // Sin comparar la nombrada, el recorrido de ayer aparaceria completado
      // hoy y la persona no podria volver a marcar.
      expect(resultado[0].isChecked).toBe(false)
    })

    it('elige la nombrada mas reciente cuando hay varias', async () => {
      nameds.getNameds.mockResolvedValue({
        listStaff: [nombrada(7), nombrada(9)],
      })

      const resultado = await service.findAllByEmployeeId('e1')

      expect(resultado[0].namedId).toBe(9)
      expect(entries.getEntriesByNamedId).toHaveBeenCalledWith(9, 'e1')
    })

    it('si la nombrada de hoy no tiene marcaciones, recupera la de ayer sin cerrar', async () => {
      nameds.getNameds.mockResolvedValue({
        listStaff: [nombrada(9), nombrada(7)],
      })
      entries.getEntriesByNamedId
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ pointId: { _id: 'p1' }, namedId: 7 }])

      const resultado = await service.findAllByEmployeeId('e1')

      // Es el caso del turno de noche: la jornada empezo ayer y sigue abierta.
      // Sin este rescate, la persona veria el recorrido en blanco a mitad de su
      // turno.
      expect(resultado[0].namedId).toBe(7)
      expect(resultado[0].isChecked).toBe(true)
    })

    it('no recupera la de ayer si ya paso por el ultimo punto', async () => {
      nameds.getNameds.mockResolvedValue({
        listStaff: [nombrada(9), nombrada(7)],
      })
      entries.getEntriesByNamedId
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ pointId: { _id: 'p2' }, namedId: 7 }])

      const resultado = await service.findAllByEmployeeId('e1')

      // `p2` es el ultimo del recorrido: la jornada de ayer esta cerrada y hoy
      // toca empezar de cero.
      expect(resultado[0].namedId).toBe(9)
    })

    it('describe la nombrada con id, nave y turno', async () => {
      nameds.getNameds.mockResolvedValue({ listStaff: [nombrada(9)] })

      const resultado = await service.findAllByEmployeeId('e1')

      expect(resultado[0].named).toBe('9 - V-1 - Nave')
      expect(resultado[0].turn).toBe('Dia')
    })

    it('devuelve los puntos ordenados por su secuencia', async () => {
      const cadena = query(puntos)
      model.find.mockReturnValue(cadena)
      nameds.getNameds.mockResolvedValue({ listStaff: [nombrada(9)] })

      await service.findAllByEmployeeId('e1')

      expect(cadena.sort).toHaveBeenCalledWith({ order: 1 })
    })
  })

  describe('findOne', () => {
    it('resuelve puerto y dependencia', async () => {
      const puerto = { _id: 'pt1', name: 'Callao' }
      const dependencia = { _id: 'p0', name: 'Garita' }
      model.findById.mockReturnValue(
        query(doc({ _id: 'p1', portId: puerto, dependOnId: dependencia }))
      )

      const punto = (await service.findOne('p1')) as unknown as Record<
        string,
        unknown
      >

      expect(punto.port).toEqual(puerto)
      expect(punto.dependOn).toEqual(dependencia)
      expect(punto).not.toHaveProperty('portId')
    })

    it('falla con 404 cuando el punto no existe', async () => {
      model.findById.mockReturnValue(query(null))

      await expect(service.findOne('fantasma')).rejects.toBeInstanceOf(
        NotFoundException
      )
    })
  })

  describe('findAll y findAllByPortId', () => {
    it('escapa el texto de busqueda', async () => {
      model.find.mockReturnValue(query([]))

      await service.findAll(10, 1, 'a.b')

      expect(model.find).toHaveBeenCalledWith({
        $or: [
          { name: { $regex: 'a\\.b', $options: 'i' } },
          { email: { $regex: 'a\\.b', $options: 'i' } },
        ],
      })
    })

    it('findAllByPortId filtra por el puerto convertido a ObjectId', async () => {
      model.find.mockReturnValue(query([]))

      await service.findAllByPortId(portId, 10, 1)

      const filtro = model.find.mock.calls[0][0] as { portId: Types.ObjectId }
      expect(filtro.portId).toBeInstanceOf(Types.ObjectId)
    })

    it('findAllGlobal devuelve todos los puntos en su secuencia', async () => {
      const cadena = query([doc({ _id: 'p1' })])
      model.find.mockReturnValue(cadena)

      await service.findAllGlobal()

      expect(cadena.sort).toHaveBeenCalledWith({ order: 1 })
    })
  })

  describe('update y remove', () => {
    beforeEach(() => {
      model.findById.mockReturnValue(query({ portId }))
    })

    it('convierte puerto y dependencia a ObjectId al actualizar', async () => {
      await service.update('p1', { portId, dependOnId: portId } as never)

      const cambios = model.findByIdAndUpdate.mock.calls[0][1] as Record<
        string,
        unknown
      >
      expect(cambios.portId).toBeInstanceOf(Types.ObjectId)
      expect(cambios.dependOnId).toBeInstanceOf(Types.ObjectId)
    })

    it('quitar la dependencia la deja en null', async () => {
      await service.update('p1', { portId } as never)

      expect(
        (model.findByIdAndUpdate.mock.calls[0][1] as { dependOnId: unknown })
          .dependOnId
      ).toBeNull()
    })

    it('pide el documento ya modificado', async () => {
      await service.update('p1', { portId } as never)

      expect(model.findByIdAndUpdate.mock.calls[0][2]).toEqual({ new: true })
    })

    it('remove borra por id', async () => {
      await service.remove('p1')

      expect(model.findByIdAndDelete).toHaveBeenCalledWith('p1')
    })
  })

  /** CKI07: una dependencia solo puede ser del mismo puerto y sin ciclos. */
  describe('dependencias entre puntos', () => {
    const otroPuerto = '6862b2dd5b6efa7634310aaa'
    const a = '6862b2dd5b6efa7634310a01'
    const b = '6862b2dd5b6efa7634310a02'

    it('rechaza depender de un punto de otro puerto', async () => {
      model.findById.mockReturnValue(query({ portId: otroPuerto }))

      await expect(
        service.create({ portId, name: 'Garita', dependOnId: b } as never)
      ).rejects.toThrow('mismo puerto')
      expect(model.create).not.toHaveBeenCalled()
    })

    it('rechaza que un punto dependa de si mismo', async () => {
      model.findById.mockReturnValue(query({ portId }))

      await expect(
        service.update(a, { portId, dependOnId: a } as never)
      ).rejects.toThrow('sí mismo')
    })

    it('rechaza una dependencia que cierra un ciclo', async () => {
      // a pasa a depender de b, y b ya depende de a.
      model.findById.mockImplementation((id: string) =>
        query(id === b ? { portId, dependOnId: a } : { portId })
      )

      await expect(
        service.update(a, { portId, dependOnId: b } as never)
      ).rejects.toThrow('ciclo')
      expect(model.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('una edicion sin puerto conserva el puerto guardado', async () => {
      model.findById.mockReturnValue(query({ portId }))

      await service.update(a, { name: 'Garita' } as never)

      const cambios = model.findByIdAndUpdate.mock.calls[0][1] as {
        portId: Types.ObjectId
      }
      expect(cambios.portId.toString()).toBe(portId)
    })
  })
})
