import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Types } from 'mongoose'
import { EntryService } from './entry.service'
import { Entry } from './entities/entry.entity'
import { NamedService } from '../named/named.service'
import { NamedRecordService } from '../named/named-record.service'
import { EmployeeService } from '../employee/employee.service'
import { PointService } from '../point/point.service'
import { TalkService } from '../talk/talk.service'
import { createModelMock, modelProvider, query, ModelMock } from '../../testing'

// Cinco de los seis colaboradores estan en un ciclo de importacion con este
// modulo; cargarlos de verdad rompe el orden de inicializacion.
jest.mock('../named/named.service', () => ({
  NamedService: class NamedService {},
}))
jest.mock('../named/named-record.service', () => ({
  NamedRecordService: class NamedRecordService {},
}))
jest.mock('../employee/employee.service', () => ({
  EmployeeService: class EmployeeService {},
}))
jest.mock('../point/point.service', () => ({
  PointService: class PointService {},
}))
jest.mock('../talk/talk.service', () => ({ TalkService: class TalkService {} }))

describe('EntryService', () => {
  let service: EntryService
  let model: ModelMock
  let employees: { findOne: jest.Mock; findByDocument: jest.Mock }
  let points: { findOne: jest.Mock; findAll: jest.Mock }
  let nameds: { getNameds: jest.Mock }

  const employeeId = '6862b2dd5b6efa7634310d2f'
  const pointId = '6862b2dd5b6efa7634310d30'

  beforeEach(async () => {
    model = createModelMock()
    employees = {
      findOne: jest.fn().mockResolvedValue({ _id: employeeId, id: 77 }),
      findByDocument: jest.fn().mockResolvedValue({ _id: employeeId }),
    }
    points = {
      findOne: jest.fn().mockResolvedValue({ _id: pointId, dependOnId: null }),
      findAll: jest.fn().mockResolvedValue({ data: [] }),
    }
    nameds = { getNameds: jest.fn().mockResolvedValue({ listStaff: [] }) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntryService,
        modelProvider(Entry.name, model),
        { provide: NamedService, useValue: nameds },
        { provide: NamedRecordService, useValue: {} },
        { provide: EmployeeService, useValue: employees },
        { provide: ConfigService, useValue: { get: jest.fn((_k, d) => d) } },
        { provide: PointService, useValue: points },
        { provide: TalkService, useValue: {} },
      ],
    }).compile()

    service = module.get(EntryService)
  })

  describe('create', () => {
    const dto = {
      pointId,
      employeeId,
      workerDate: '09/03/2026',
      namedId: 9,
      isAbsence: false,
      isRemate: false,
      observation: 'sin novedad',
    }

    it('convierte punto y empleado a ObjectId', async () => {
      await service.create(dto as never)

      const guardado = model.create.mock.calls[0][0]
      expect(guardado.pointId).toBeInstanceOf(Types.ObjectId)
      expect(guardado.employeeId).toBeInstanceOf(Types.ObjectId)
    })

    it('guarda solo los campos declarados, no el DTO entero', async () => {
      await service.create({ ...dto, isAdmin: true } as never)

      // La marcacion es el registro con valor legal del sistema: cualquier
      // campo que se cuele acaba en un documento que despues se audita.
      expect(Object.keys(model.create.mock.calls[0][0]).sort()).toEqual([
        'employeeId',
        'isAbsence',
        'isRemate',
        'namedId',
        'observation',
        'pointId',
        'workerDate',
      ])
    })
  })

  describe('createManual', () => {
    const dto = {
      employeeId: '12345678',
      pointId,
      namedId: 9,
      date: '2026-03-09',
      time: '06:30',
      observation: 'marcaje manual',
    }

    it('busca al empleado por documento, no por id', async () => {
      await service.createManual(dto as never)

      // Quien registra a mano teclea el DNI; tratarlo como ObjectId lanzaria un
      // CastError en vez de un mensaje util.
      expect(employees.findByDocument).toHaveBeenCalledWith('12345678')
    })

    it('falla con 404 si el documento no esta registrado', async () => {
      employees.findByDocument.mockResolvedValue(null)

      await expect(service.createManual(dto as never)).rejects.toBeInstanceOf(
        NotFoundException
      )
      expect(model.create).not.toHaveBeenCalled()
    })

    it('combina fecha y hora en el instante marcado', async () => {
      await service.createManual(dto as never)

      const { date } = model.create.mock.calls[0][0]
      expect(date).toBeInstanceOf(Date)
      expect(date.getHours()).toBe(6)
      expect(date.getMinutes()).toBe(30)
      // La hora tecleada es de Lima: 06:30 de Lima son las 11:30Z, en cualquier zona.
      expect(date.toISOString()).toBe('2026-03-09T11:30:00.000Z')
    })

    it('guarda la fecha de jornada tal y como se pidio', async () => {
      await service.createManual(dto as never)

      expect(model.create.mock.calls[0][0].workerDate).toBe('2026-03-09')
    })
  })

  describe('getDateRange', () => {
    it('abre el rango a las 00:00 y lo cierra a las 23:59:59', () => {
      const { startDate, endDate } = service.getDateRange(
        '2026-03-01',
        '2026-03-31'
      )

      // Cerrar a las 00:00 del ultimo dia dejaria fuera la jornada entera de
      // ese dia, que es justo la que se suele consultar.
      expect(startDate.getHours()).toBe(0)
      expect(endDate.getHours()).toBe(23)
      expect(endDate.getMinutes()).toBe(59)
      expect(endDate.getSeconds()).toBe(59)
    })

    it('ignora la parte horaria de una fecha ISO completa', () => {
      const { startDate } = service.getDateRange(
        '2026-03-01T14:23:00Z',
        '2026-03-31T00:00:00Z'
      )

      expect(startDate.getDate()).toBe(1)
      expect(startDate.getHours()).toBe(0)
    })
  })

  describe('getZeroMonth', () => {
    it('rellena con cero por debajo de 10', () => {
      expect(service.getZeroMonth(3)).toBe('03')
    })

    it('a partir de 10 lo deja igual', () => {
      expect(String(service.getZeroMonth(12))).toBe('12')
    })
  })

  describe('formatToStringDate', () => {
    it('pasa de dia/mes/ano a ISO', () => {
      expect(service.formatToStringDate('09/03/2026')).toBe('2026-03-09')
    })
  })

  describe('fechas de nombrada', () => {
    it('hoy sale con dia y mes de dos cifras', () => {
      expect(service.getTodayDateToNamed(new Date(2026, 2, 9))).toBe(
        '09/03/2026'
      )
    })

    it('ayer retrocede un dia', () => {
      expect(service.getYesterdayDateToNamed(new Date(2026, 2, 9))).toBe(
        '08/03/2026'
      )
    })

    it('ayer cruza el cambio de mes', () => {
      expect(service.getYesterdayDateToNamed(new Date(2026, 2, 1))).toBe(
        '28/02/2026'
      )
    })

    it('ayer cruza el cambio de ano', () => {
      expect(service.getYesterdayDateToNamed(new Date(2026, 0, 1))).toBe(
        '31/12/2025'
      )
    })
  })

  /**
   * `verifyRange` decide si una marcacion llega a tiempo. Es la regla con mas
   * consecuencias del modulo: de mas, deja pasar tardanzas; de menos, deja a
   * alguien fuera de su propio turno.
   */
  describe('verifyRange', () => {
    const enElMomento = (fecha: Date) => {
      jest.useFakeTimers().setSystemTime(fecha)
    }

    afterEach(() => {
      jest.useRealTimers()
    })

    it('interpreta el turno en hora de Lima, sea cual sea la zona del proceso', () => {
      // 13:00Z son las 08:00 de Lima: dentro. 11:00Z son las 06:00: fuera. Con
      // el turno armado en la zona del proceso (UTC en el contenedor) salia al reves.
      expect(
        service.verifyRange(
          '07:00 - 15:00',
          0,
          0,
          '09/03/2026',
          new Date('2026-03-09T13:00:00Z')
        )
      ).toBe(true)
      expect(
        service.verifyRange(
          '07:00 - 15:00',
          0,
          0,
          '09/03/2026',
          new Date('2026-03-09T11:00:00Z')
        )
      ).toBe(false)
      expect(
        service.verifyRange(
          '07:00 - 15:00',
          0,
          0,
          '09/03/2026',
          new Date('2026-03-09T19:30:00Z')
        )
      ).toBe(true)
    })

    it('acepta una marcacion dentro del rango', () => {
      enElMomento(new Date(2026, 2, 9, 8, 0))

      expect(service.verifyRange('07:00 - 15:00', 0, 0, '09/03/2026')).toBe(
        true
      )
    })

    it('rechaza una marcacion antes del rango', () => {
      enElMomento(new Date(2026, 2, 9, 6, 0))

      expect(service.verifyRange('07:00 - 15:00', 0, 0, '09/03/2026')).toBe(
        false
      )
    })

    it('rechaza una marcacion despues del rango', () => {
      enElMomento(new Date(2026, 2, 9, 16, 0))

      expect(service.verifyRange('07:00 - 15:00', 0, 0, '09/03/2026')).toBe(
        false
      )
    })

    it('la tolerancia previa adelanta la apertura', () => {
      enElMomento(new Date(2026, 2, 9, 6, 45))

      expect(service.verifyRange('07:00 - 15:00', 30, 0, '09/03/2026')).toBe(
        true
      )
    })

    it('la tolerancia posterior retrasa el cierre', () => {
      enElMomento(new Date(2026, 2, 9, 15, 20))

      expect(service.verifyRange('07:00 - 15:00', 0, 30, '09/03/2026')).toBe(
        true
      )
    })

    it('las tolerancias no se aplican al lado contrario', () => {
      enElMomento(new Date(2026, 2, 9, 15, 20))

      // Una tolerancia previa generosa no puede convertirse en margen de salida.
      expect(service.verifyRange('07:00 - 15:00', 60, 0, '09/03/2026')).toBe(
        false
      )
    })

    it('el turno de noche cierra al dia siguiente', () => {
      enElMomento(new Date(2026, 2, 10, 3, 0))

      // Sin sumar el dia, `23:00 - 07:00` seria un intervalo que termina antes
      // de empezar y ninguna marcacion de madrugada valdria.
      expect(service.verifyRange('23:00 - 07:00', 0, 0, '09/03/2026')).toBe(
        true
      )
    })

    it('el turno de noche sigue abierto justo antes de su cierre', () => {
      enElMomento(new Date(2026, 2, 10, 6, 59))

      expect(service.verifyRange('23:00 - 07:00', 0, 0, '09/03/2026')).toBe(
        true
      )
    })

    it('el turno de noche ya esta cerrado despues de su hora', () => {
      enElMomento(new Date(2026, 2, 10, 7, 30))

      expect(service.verifyRange('23:00 - 07:00', 0, 0, '09/03/2026')).toBe(
        false
      )
    })

    it('tolera un rango escrito sin espacios', () => {
      enElMomento(new Date(2026, 2, 9, 8, 0))

      expect(service.verifyRange('07:00-15:00', 0, 0, '09/03/2026')).toBe(true)
    })

    it('el limite exacto de apertura cuenta como dentro', () => {
      enElMomento(new Date(2026, 2, 9, 7, 0, 0))

      expect(service.verifyRange('07:00 - 15:00', 0, 0, '09/03/2026')).toBe(
        true
      )
    })
  })

  describe('verifyLastEntry', () => {
    it('busca la marcacion por empleado, punto, jornada y nombrada', async () => {
      await service.verifyLastEntry(employeeId, pointId, '09/03/2026', 9)

      const filtro = model.findOne.mock.calls[0][0] as Record<string, unknown>
      expect(filtro.workerDate).toBe('09/03/2026')
      expect(filtro.namedId).toBe(9)
      expect(filtro.employeeId).toBeInstanceOf(Types.ObjectId)
      expect(filtro.pointId).toBeInstanceOf(Types.ObjectId)
    })

    it('devuelve true cuando ya marco ahi', async () => {
      model.findOne.mockReturnValue(query({ _id: 'x' }))

      await expect(
        service.verifyLastEntry(employeeId, pointId, '09/03/2026', 9)
      ).resolves.toBe(true)
    })

    it('devuelve false cuando no hay marcacion', async () => {
      model.findOne.mockReturnValue(query(null))

      await expect(
        service.verifyLastEntry(employeeId, pointId, '09/03/2026', 9)
      ).resolves.toBe(false)
    })
  })

  describe('verifyDependence', () => {
    it('deja pasar un punto sin dependencia', async () => {
      points.findOne.mockResolvedValue({ _id: pointId, dependOnId: null })

      await expect(
        service.verifyDependence(employeeId, pointId, '09/03/2026', 9)
      ).resolves.toBeUndefined()
    })

    it('rechaza si no marco antes el punto del que depende', async () => {
      points.findOne.mockResolvedValue({
        _id: pointId,
        dependOnId: { _id: new Types.ObjectId(), name: 'Garita' },
      })
      model.findOne.mockReturnValue(query(null))

      // Es lo que impide que alguien aparezca en el muelle sin haber pasado por
      // la garita: sin la comprobacion, el recorrido deja de ser una secuencia.
      await expect(
        service.verifyDependence(employeeId, pointId, '09/03/2026', 9)
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('el mensaje de rechazo nombra el punto que falta', async () => {
      points.findOne.mockResolvedValue({
        _id: pointId,
        dependOnId: { _id: new Types.ObjectId(), name: 'Garita' },
      })
      model.findOne.mockReturnValue(query(null))

      await expect(
        service.verifyDependence(employeeId, pointId, '09/03/2026', 9)
      ).rejects.toThrow('Garita')
    })

    it('deja pasar si ya marco el punto del que depende', async () => {
      points.findOne.mockResolvedValue({
        _id: pointId,
        dependOnId: { _id: new Types.ObjectId(), name: 'Garita' },
      })
      model.findOne.mockReturnValue(query({ _id: 'ya-marcado' }))

      await expect(
        service.verifyDependence(employeeId, pointId, '09/03/2026', 9)
      ).resolves.toBeUndefined()
    })
  })

  describe('consultas', () => {
    it('getEntriesByNamedId filtra por nombrada y empleado', async () => {
      await service.getEntriesByNamedId(9, employeeId)

      const filtro = model.find.mock.calls[0][0] as Record<string, unknown>
      expect(filtro.namedId).toBe(9)
      expect(filtro.employeeId).toBeInstanceOf(Types.ObjectId)
    })

    it('getEntriesByNamedId resuelve el punto de cada marcacion', async () => {
      const cadena = query([])
      model.find.mockReturnValue(cadena)

      await service.getEntriesByNamedId(9, employeeId)

      expect(cadena.populate).toHaveBeenCalledWith('pointId')
    })

    it('getEntries filtra por empleado y jornada', async () => {
      await service.getEntries(employeeId, '09/03/2026')

      const filtro = model.find.mock.calls[0][0] as Record<string, unknown>
      expect(filtro.workerDate).toBe('09/03/2026')
    })
  })

  describe('update, remove y createMany', () => {
    it('update convierte el id a ObjectId y devuelve la version guardada', async () => {
      model.findByIdAndUpdate.mockReturnValueOnce(query({ _id: employeeId }))

      await service.update(employeeId, { observation: 'corregido' } as never)

      expect(model.findByIdAndUpdate.mock.calls[0][0]).toBeInstanceOf(
        Types.ObjectId
      )
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        { observation: 'corregido' },
        { new: true }
      )
    })

    it('update de una marcacion que no existe responde 404', async () => {
      await expect(
        service.update(employeeId, { observation: 'x' } as never)
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('createMany inserta el lote de una sola vez', async () => {
      const lote = [{ namedId: 9 }, { namedId: 9 }] as never

      await service.createMany(lote)

      expect(model.insertMany).toHaveBeenCalledWith(lote)
    })

    it('remove borra por id', async () => {
      await service.remove('x1')

      expect(model.findByIdAndDelete).toHaveBeenCalled()
    })
  })

  describe('search', () => {
    /**
     * Una marcacion por punto de cada trabajador. El listado agrupa por
     * trabajador, asi que seis marcaciones son dos filas.
     */
    const marcacion = (employeeId: string, pointId: string) => ({
      employeeId: {
        _id: employeeId,
        id: Number(employeeId.slice(-1)),
        document: employeeId,
      },
      pointId: { _id: pointId, name: pointId },
      workerDate: '2026-09-16',
      namedId: 9,
    })

    it('total cuenta los trabajadores listados, no las marcaciones sueltas', async () => {
      // El fallo que este test fija: se contaban las marcaciones, que son
      // varias por persona. El total salia inflado y el panel ofrecia paginas
      // que al abrirlas estaban vacias.
      const entries = [
        marcacion('e1', 'p1'),
        marcacion('e1', 'p2'),
        marcacion('e1', 'p3'),
        marcacion('e2', 'p1'),
        marcacion('e2', 'p2'),
      ]
      model.find.mockReturnValue(query(entries))
      jest
        .spyOn(service, 'groupByEmployee')
        .mockReturnValue([
          { employee: { _id: 'e1' } },
          { employee: { _id: 'e2' } },
        ] as never)

      const respuesta = await service.search({
        workerDate: '2026-09-16',
        page: 1,
        limit: 10,
      } as never)

      expect(respuesta.total).toBe(2)
      expect(respuesta.data).toHaveLength(2)
    })

    it('filtra por nombre, nave y cargo antes de paginar', async () => {
      // En el panel el filtro se aplicaba a la pagina visible: con 30
      // trabajadores, buscar a uno que estaba en la pagina 2 no lo encontraba.
      model.find.mockReturnValue(query([]))
      const fila = (nombre: string, nave: string, cargo: string) => ({
        employee: { firstName: nombre, lastName: 'PEÑA' },
        named: { vessel_description: nave, shift_description: 'A' },
        listStaffDetail: { staff_role_type_description: cargo },
      })
      jest
        .spyOn(service, 'groupByEmployee')
        .mockReturnValue([
          fila('ANA', 'NAVE 1', 'ESTIBADOR'),
          fila('LUIS', 'NAVE 2', 'WINCHERO'),
          fila('ANABEL', 'NAVE 2', 'ESTIBADOR'),
        ] as never)

      const respuesta = await service.search({
        workerDate: '2026-09-16',
        page: 1,
        limit: 1,
        search: 'anabel pena',
        ship: 'NAVE 2',
      } as never)

      expect(respuesta.total).toBe(1)
      const [primera] = respuesta.data as unknown as { employee: { firstName: string } }[]
      expect(primera.employee.firstName).toBe('ANABEL')
      // Las opciones salen de la jornada entera, no de lo filtrado.
      expect(respuesta.ships).toEqual(['NAVE 1', 'NAVE 2'])
      expect(respuesta.positions).toEqual(['ESTIBADOR', 'WINCHERO'])
    })
  })
})
