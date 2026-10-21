import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { CreatePointDto } from './dto/create-point.dto'
import { UpdatePointDto } from './dto/update-point.dto'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Point, PointDocument, PointResponse } from './entities/point.entity'
import { IResponse } from 'src/interfaces/response.interface'
import { EntryService } from '../entry/entry.service'
import { EmployeeService } from '../employee/employee.service'
import { EntryDocument } from '../entry/entities/entry.entity'
import { IListStaff, NamedService } from '../named/named.service'
import { buildSearchFilter } from 'src/common/mongo/search'
import { routeEnds } from './point-route'

@Injectable()
export class PointService {
  constructor(
    @InjectModel(Point.name)
    private pointModel: Model<PointDocument>,
    private readonly employeeService: EmployeeService,
    private readonly entryService: EntryService,
    private readonly namedService: NamedService
  ) {}
  /**
   * Una dependencia solo puede ser otro punto del mismo puerto, y no puede
   * cerrar un ciclo (A depende de B que depende de A): con un ciclo nadie
   * podria marcar ninguno de los dos. Regla acordada en CKI07.
   */
  private async assertValidDependency(
    pointId: string | null,
    portId: string,
    dependOnId?: string | null
  ) {
    if (!dependOnId) {
      return
    }
    if (pointId && dependOnId === pointId) {
      throw new BadRequestException('Un punto no puede depender de sí mismo.')
    }
    const visited = new Set<string>()
    let currentId: string | null = dependOnId
    let first = true
    while (currentId) {
      if (visited.has(currentId)) {
        break
      }
      visited.add(currentId)
      const current = await this.pointModel
        .findById(currentId, { portId: 1, dependOnId: 1 })
        .lean()
        .exec()
      if (!current) {
        if (first) {
          throw new BadRequestException('El punto del que depende no existe.')
        }
        break
      }
      if (first && current.portId?.toString() !== portId) {
        throw new BadRequestException(
          'El punto del que depende debe ser del mismo puerto.'
        )
      }
      first = false
      const next = current.dependOnId?.toString() ?? null
      if (pointId && next === pointId) {
        throw new BadRequestException(
          'Esa dependencia cierra un ciclo entre puntos.'
        )
      }
      currentId = next
    }
  }

  async create(createPointDto: CreatePointDto) {
    await this.assertValidDependency(
      null,
      createPointDto.portId,
      createPointDto.dependOnId
    )
    const portId = new Types.ObjectId(createPointDto.portId)
    const dependOnId = createPointDto.dependOnId
      ? new Types.ObjectId(createPointDto.dependOnId)
      : null
    const lastPoint = await this.pointModel
      .findOne({ portId })
      .sort({ order: -1 })
      .exec()
    const order = lastPoint ? (lastPoint.order || 0) + 1 : 1
    return this.pointModel.create({
      ...createPointDto,
      portId,
      order,
      dependOnId,
    })
  }

  async findAllGlobal() {
    const points = await this.pointModel.find().sort({ order: 1 }).exec()
    return points
  }

  async findAll(
    limit: number,
    page: number,
    search: string = ''
  ): Promise<IResponse<PointResponse[]>> {
    const query = buildSearchFilter(search, ['name', 'email'])
    // El orden se queda como esta: `order` es la secuencia del recorrido de
    // marcacion, no un orden de presentacion. Alfabetizarlo romperia la lectura
    // de por donde pasa el personal.
    const [points, total] = await Promise.all([
      this.pointModel
        .find(query)
        .sort({ order: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.pointModel.countDocuments(query).exec(),
    ])
    return {
      data: points.map(point => {
        const { portId, ...pointWithoutPortId } = point.toObject()
        const port: any = point.portId
        return {
          ...pointWithoutPortId,
          port: port.name,
        } as unknown as PointResponse
      }),
      total,
      page,
      limit,
    }
  }

  async findAllByPortId(
    portId: string,
    limit: number,
    page: number,
    search: string = ''
  ): Promise<IResponse<Point[]>> {
    const query = buildSearchFilter(search, ['name', 'email'])
    const filtro = { portId: new Types.ObjectId(portId), ...query }
    const [points, total] = await Promise.all([
      this.pointModel
        .find(filtro)
        .sort({ order: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('dependOnId')
        .exec(),
      this.pointModel.countDocuments(filtro).exec(),
    ])
    return {
      data: points.map(point => {
        const { portId, ...pointWithoutPortId } = point.toObject()
        const port: any = point.portId
        const dependOn: any = point.dependOnId
        return {
          ...pointWithoutPortId,
          port: port.name,
          dependOn: dependOn,
        } as unknown as PointResponse
      }),
      total,
      page,
      limit,
    }
  }

  getDate(time: string) {
    return new Date(
      `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()} ${time}`
    )
  }

  getZeroMonth(month: number) {
    return month.toString().padStart(2, '0')
  }

  formatDate(date: string) {
    const [day, month, year] = date.split('/')
    return `${year}-${month}-${day}`
  }

  sortByStaffTransmissionId(listStaff: IListStaff[]) {
    return listStaff.sort(
      (a, b) => b.staff_transmission_id - a.staff_transmission_id
    )
  }

  async findAllByEmployeeId(employeeId: string) {
    const allPoints = await this.pointModel.find().sort({ order: 1 }).exec()
    const { end: endPoint } = routeEnds(allPoints)
    const employee = await this.employeeService.findOne(employeeId)
    if (!employee) {
      throw new NotFoundException('Empleado no encontrado')
    }
    const now = new Date()

    const yesterdayDate = new Date(now)
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    const day = String(yesterdayDate.getDate()).padStart(2, '0')
    const month = String(yesterdayDate.getMonth() + 1).padStart(2, '0')
    const year = yesterdayDate.getFullYear()
    const yesterday = `${day}/${month}/${year}`
    const todayN = `${this.getZeroMonth(now.getDate())}/${this.getZeroMonth(now.getMonth() + 1)}/${now.getFullYear()}`

    const named = await this.namedService.getNameds({
      sInitialDate: yesterday,
      sFinalDate: todayN,
    })
    const namedsEmployee = named.listStaff.filter(named =>
      named.listStaffDetail.some(detail => detail.staff_id === employee.id)
    )

    if (namedsEmployee.length === 0) {
      throw new NotFoundException('El empleado no está nombrado para hoy')
    }

    const namedsEmployeeSorted = this.sortByStaffTransmissionId(namedsEmployee)

    let currentNamedsEmployee = namedsEmployeeSorted[0]
    const lastNamedEmployee = namedsEmployeeSorted[1]

    let lastEntries: any = await this.entryService.getEntriesByNamedId(
      currentNamedsEmployee.staff_transmission_id,
      employeeId
    )

    //si no tiene marcación de entrada
    if (lastEntries.length === 0 && lastNamedEmployee) {
      const lastEntriesYesterday: any =
        await this.entryService.getEntriesByNamedId(
          lastNamedEmployee.staff_transmission_id,
          employeeId
        )
      if (
        lastEntriesYesterday.length > 0 &&
        !lastEntriesYesterday.some(
          entry => entry.pointId?._id.toString() === endPoint?._id.toString()
        )
      ) {
        lastEntries = lastEntriesYesterday
        currentNamedsEmployee = lastNamedEmployee
      }
    }

    return allPoints.map(point => {
      const isChecked = lastEntries.some(
        entry =>
          entry.pointId?._id.toString() === point._id.toString() &&
          entry.namedId === currentNamedsEmployee.staff_transmission_id
      )
      const entry: EntryDocument = lastEntries.find(
        entry => entry.pointId?._id.toString() === point._id.toString()
      ) as EntryDocument
      return {
        ...point.toObject(),
        isChecked,
        dateCheck: entry?.date || '',
        isAbsence: entry?.isAbsence,
        named: `${currentNamedsEmployee?.staff_transmission_id} - ${currentNamedsEmployee?.staff_vessel_number} - ${currentNamedsEmployee?.vessel_description}`,
        turn: currentNamedsEmployee?.shift_description,
        namedId: currentNamedsEmployee.staff_transmission_id,
      }
    })
  }

  async findOne(id: string): Promise<Point> {
    const point = await this.pointModel
      .findById(id)
      .populate('portId')
      .populate('dependOnId')
      .exec()
    if (!point) {
      throw new NotFoundException('Point not found')
    }
    const { portId, ...pointWithoutPortId } = point.toObject()
    const port: any = point.portId
    const dependOn: any = point.dependOnId
    return { ...pointWithoutPortId, port, dependOn } as unknown as PointResponse
  }

  async update(id: string, updatePointDto: UpdatePointDto) {
    const existing = await this.pointModel
      .findById(id, { portId: 1 })
      .lean()
      .exec()
    if (!existing) {
      throw new NotFoundException('Point not found')
    }
    // `new Types.ObjectId(undefined)` genera un id nuevo al azar: una edicion
    // parcial sin `portId` dejaba el punto colgando de un puerto inexistente.
    const portIdStr = updatePointDto.portId ?? existing.portId?.toString()
    // Sin `dependOnId` se quita la dependencia, como hasta ahora: el panel la
    // envia siempre, vacia cuando no hay.
    await this.assertValidDependency(id, portIdStr, updatePointDto.dependOnId)
    const dependOnId = updatePointDto.dependOnId
      ? new Types.ObjectId(updatePointDto.dependOnId)
      : null
    const update = {
      ...updatePointDto,
      portId: new Types.ObjectId(portIdStr),
      dependOnId,
    }
    return this.pointModel.findByIdAndUpdate(id, update, { new: true }).exec()
  }

  remove(id: string) {
    return this.pointModel.findByIdAndDelete(id).exec()
  }
}
