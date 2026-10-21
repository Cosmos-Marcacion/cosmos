import { Test, TestingModule } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
import { NamedController } from './named.controller'
import { NamedService } from './named.service'
import { NamedRecordService } from './named-record.service'
import { BadRequestException } from '@nestjs/common'
import { ROLES } from '../auth/enums/roles.enum'
import { parseNamedIdParam } from '../../common/mongo/params'

jest.mock('../employee/employee.service', () => ({
  EmployeeService: class EmployeeService {},
}))
jest.mock('../entry/entry.service', () => ({
  EntryService: class EntryService {},
}))
jest.mock('../point/point.service', () => ({
  PointService: class PointService {},
}))
jest.mock('../assistant/assistant.service', () => ({
  AssistantService: class AssistantService {},
}))
jest.mock('../talk/talk.service', () => ({ TalkService: class TalkService {} }))

// El id llega como cadena de `@Param`; lo convierte el pipe de la ruta, que es
// lo que se aplica aqui antes de llamar al metodo, como hace Nest.
const nombrada = (valor: string) =>
  parseNamedIdParam().transform(valor, { type: 'param' })

describe('NamedController', () => {
  let controller: NamedController
  let nameds: jest.Mocked<NamedService>
  let records: jest.Mocked<NamedRecordService>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NamedController],
      providers: [
        {
          provide: NamedService,
          useValue: {
            getNamedBoard: jest.fn().mockResolvedValue({ data: [] }),
            getNamedDetail: jest.fn().mockResolvedValue({}),
            getToken: jest.fn().mockResolvedValue({ token: 't' }),
            getUsers: jest.fn().mockResolvedValue([]),
            getUserByDoc: jest.fn().mockResolvedValue({}),
            getNameds: jest.fn().mockResolvedValue({ listStaff: [] }),
            getNamesGrouped: jest.fn().mockResolvedValue([]),
            getNamesByDateAndTurn: jest.fn().mockResolvedValue([]),
            generateRandomEntries: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: NamedRecordService,
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            upsert: jest.fn().mockResolvedValue({ _id: 'r1' }),
          },
        },
      ],
    }).compile()

    controller = module.get(NamedController)
    nameds = module.get(NamedService)
    records = module.get(NamedRecordService)
  })

  describe('detalle de una nombrada', () => {
    it('convierte el id de la ruta a numero', async () => {
      await controller.getDetail(await nombrada('9'), '09/03/2026')

      // Llega como cadena de `@Param`. El servicio lo compara con el
      // `staff_transmission_id` numerico del sistema externo: como texto, no
      // casa con nada y el detalle sale vacio.
      expect(nameds.getNamedDetail).toHaveBeenCalledWith(9, '09/03/2026')
    })

    it('la fecha de jornada viaja en la query, no en la ruta', async () => {
      await controller.getDetail(await nombrada('9'), '09/03/2026')

      expect(nameds.getNamedDetail).toHaveBeenCalledWith(
        expect.any(Number),
        '09/03/2026'
      )
    })
  })

  describe('ficha de la nombrada', () => {
    it('GET devuelve null explicito cuando aun no hay ficha', async () => {
      records.findOne.mockResolvedValue(null as never)

      // `undefined` no se serializa: la respuesta saldria con cuerpo vacio y el
      // frontend no podria distinguirla de un error de red.
      await expect(
        controller.getRecord(await nombrada('9'))
      ).resolves.toBeNull()
    })

    it('GET convierte el id a numero', async () => {
      await controller.getRecord(await nombrada('9'))

      expect(records.findOne).toHaveBeenCalledWith(9)
    })

    it('PUT pasa la fecha de jornada a formato ISO', async () => {
      await controller.upsertRecord(await nombrada('9'), {
        workerDate: '09/03/2026',
        formatType: 'GRANEL',
      } as never)

      // La ficha se indexa por fecha ISO; guardarla en dia/mes/ano crearia una
      // segunda ficha para la misma jornada.
      expect(records.upsert).toHaveBeenCalledWith(9, '2026-03-09', {
        formatType: 'GRANEL',
      })
    })

    it('PUT no arrastra workerDate dentro de los cambios', async () => {
      await controller.upsertRecord(await nombrada('9'), {
        workerDate: '09/03/2026',
        formatType: 'GRANEL',
      } as never)

      expect(records.upsert.mock.calls[0][2]).not.toHaveProperty('workerDate')
    })

    it('PUT conserva el resto de campos de la ficha', async () => {
      await controller.upsertRecord(await nombrada('9'), {
        workerDate: '09/03/2026',
        formatType: 'GRANEL',
        deckChief: 'Ana Torres',
        supervisors: ['Luis Paz'],
      } as never)

      expect(records.upsert.mock.calls[0][2]).toEqual({
        formatType: 'GRANEL',
        deckChief: 'Ana Torres',
        supervisors: ['Luis Paz'],
      })
    })
  })

  describe('consultas al sistema externo', () => {
    it('POST /board delega el DTO', async () => {
      const dto = { startDate: '2026-03-01', endDate: '2026-03-31' } as never

      await controller.getNamedBoard(dto)

      expect(nameds.getNamedBoard).toHaveBeenCalledWith(dto)
    })

    it('POST /nameds y /nameds/grouped usan metodos distintos', async () => {
      const dto = {
        sInitialDate: '01/03/2026',
        sFinalDate: '31/03/2026',
      } as never

      await controller.getNameds(dto)
      await controller.getNamedsGrouped(dto)

      // Uno devuelve la lista cruda del externo y el otro la cruza con
      // empleados, marcaciones y puntos: intercambiarlos deja la pantalla de
      // marcaciones sin los datos locales.
      expect(nameds.getNameds).toHaveBeenCalledWith(dto)
      expect(nameds.getNamesGrouped).toHaveBeenCalledWith(dto)
    })

    it('POST /date-turn delega su DTO', async () => {
      const dto = { workerDate: '2026-03-09', talkId: 't1' } as never

      await controller.getNamesByDateAndTurn(dto)

      expect(nameds.getNamesByDateAndTurn).toHaveBeenCalledWith(dto)
    })

    it('POST /users y /users/doc delegan', async () => {
      await controller.getAllUsers()
      // El cuerpo es `{ prDocumentNumber }`; al servicio va solo el documento.
      await controller.getUserByDoc({ prDocumentNumber: '12345678' })

      expect(nameds.getUsers).toHaveBeenCalledWith()
      expect(nameds.getUserByDoc).toHaveBeenCalledWith('12345678')
    })
  })

  it('exige el modulo de marcaciones', () => {
    expect(new Reflector().get<string>('requireModule', NamedController)).toBe(
      'marcaciones'
    )
  })

  it('un id de nombrada que no es numero se rechaza con 400', async () => {
    // Con `Number('abc')` la ficha se buscaba con NaN y Mongo respondia 500.
    await expect(nombrada('abc')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('el token del sistema externo es solo del super usuario', () => {
    // `RolesGuard` lee el metodo, asi que el rol tiene que estar ahi.
    const handler = (
      NamedController.prototype as unknown as Record<string, () => unknown>
    ).getToken
    expect(new Reflector().get<string[]>('roles', handler)).toEqual([
      ROLES.SUPER_ADMIN,
    ])
  })

  it('ya no expone el generador de marcaciones aleatorias', () => {
    expect(Object.getOwnPropertyNames(NamedController.prototype)).not.toContain(
      'generateRandomEntries'
    )
  })
})
