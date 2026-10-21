import { Test, TestingModule } from '@nestjs/testing'
import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { NamedService } from './named.service'
import { NamedStoreService } from './named-store.service'
import { NamedRecordService } from './named-record.service'
import { EmployeeService } from '../employee/employee.service'
import { EntryService } from '../entry/entry.service'
import { PointService } from '../point/point.service'
import { AssistantService } from '../assistant/assistant.service'
import { TalkService } from '../talk/talk.service'

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

/**
 * CKI01: la tarjeta del tablero contaba 1/10 y el detalle de la misma nombrada
 * decia 0 con marcacion. El detalle pedia las marcaciones con la fecha de la
 * nombrada (`dd/mm/yyyy`) contra `workerDate`, que se guarda `yyyy-mm-dd`.
 */
describe('NamedService.getNamedDetail', () => {
  let service: NamedService
  let entries: { getEntriesByEmployeeIds: jest.Mock }

  const startPoint = {
    _id: { toString: () => 'p1' },
    name: 'Ingreso',
    order: 1,
  }
  const endPoint = { _id: { toString: () => 'p2' }, name: 'Salida', order: 2 }
  const oid = (id: string) => ({ toString: () => id })

  const named = {
    staff_transmission_id: 3585,
    staff_vessel_id: 3585,
    vessel_description: 'ECO MARIN',
    worker_date: '18/09/2026',
    shift_description: '07:00 - 15:00',
    listStaffDetail: [
      {
        staff_id: 10,
        order_number: 1,
        first_name: 'CARLOS ALBERTO',
        last_name: 'ALBURQUEQUE ZEVALLOS',
        mother_last_name: 'ZEVALLOS',
        personal_id: '03492123',
      },
      {
        staff_id: 11,
        order_number: 2,
        first_name: 'MARTIN',
        last_name: 'MORAN',
        mother_last_name: 'CHANG',
        personal_id: '03468562',
      },
    ],
  }

  beforeEach(async () => {
    entries = {
      getEntriesByEmployeeIds: jest.fn().mockResolvedValue([
        {
          _id: oid('e1'),
          // Marcacion hecha con una ficha antigua del mismo `staff_id`.
          employeeId: oid('emp-10-antigua'),
          pointId: startPoint,
          namedId: 3585,
          date: new Date('2026-09-18T12:05:00Z'),
          isAbsence: false,
        },
      ]),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NamedService,
        { provide: HttpService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: NamedStoreService, useValue: {} },
        {
          provide: NamedRecordService,
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: EmployeeService,
          useValue: {
            getEmployeesByIds: jest.fn().mockResolvedValue([
              { _id: oid('emp-10'), id: 10 },
              { _id: oid('emp-10-antigua'), id: 10 },
              { _id: oid('emp-11'), id: 11 },
            ]),
          },
        },
        { provide: EntryService, useValue: entries },
        {
          provide: PointService,
          useValue: {
            findAllGlobal: jest.fn().mockResolvedValue([startPoint, endPoint]),
          },
        },
        { provide: AssistantService, useValue: {} },
        {
          provide: TalkService,
          useValue: {
            getByStaffTransmissionId: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile()

    service = module.get(NamedService)
    jest
      .spyOn(service, 'getNameds')
      .mockResolvedValue({ listStaff: [named] } as never)
  })

  it('busca las marcaciones con la fecha en formato ISO', async () => {
    await service.getNamedDetail(3585, '18/09/2026')

    const [, desde, hasta] = entries.getEntriesByEmployeeIds.mock.calls[0]
    expect(desde).toBe('2026-09-18')
    expect(hasta).toBe('2026-09-18')
  })

  it('cuenta la marcacion de cualquier ficha del mismo staff_id, como la tarjeta', async () => {
    const detail = await service.getNamedDetail(3585, '18/09/2026')

    const carlos = detail.staff.find(s => s.staffId === 10)!
    expect(carlos.markCount).toBe(1)
    expect(carlos.firstMark).toEqual(new Date('2026-09-18T12:05:00Z'))
    expect(detail.summary.presentCount).toBe(1)
    expect(detail.summary.pendingCount).toBe(1)
  })

  it('no repite el apellido materno cuando last_name ya lo trae (CKI04)', async () => {
    const detail = await service.getNamedDetail(3585, '18/09/2026')

    expect(detail.staff[0].fullName).toBe('ALBURQUEQUE ZEVALLOS CARLOS ALBERTO')
    expect(detail.staff[1].fullName).toBe('MORAN CHANG MARTIN')
  })
})
