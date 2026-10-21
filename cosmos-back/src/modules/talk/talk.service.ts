import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { CreateTalkDto } from './dto/create-talk.dto'
import { UpdateTalkDto } from './dto/update-talk.dto'
import { InjectModel } from '@nestjs/mongoose'
import { FilterQuery, Model, Types } from 'mongoose'
import { Talk } from './entities/talk.entity'
import { AssistantService } from '../assistant/assistant.service'
import { SearchTalkDto } from './dto/search-talk.dto'
import { NamedService } from '../named/named.service'

@Injectable()
export class TalkService {
  private namedService: NamedService;

  constructor(@InjectModel(Talk.name) private talkModel: Model<Talk>, private assistantService: AssistantService, @Inject(forwardRef(() => NamedService)) namedService: any) {
    this.namedService = namedService;
  }

  async create(createTalkDto: CreateTalkDto) {
    const { trainerId, registerId } = createTalkDto
    const trainer = new Types.ObjectId(trainerId)
    const register = new Types.ObjectId(registerId)
    const talk = new this.talkModel({
      ...createTalkDto,
      trainerId: trainer,
      registerId: register,
      place: createTalkDto.place === 'Otros' ? createTalkDto.otherPlace : createTalkDto.place
    })
    return this.talkModel.create(talk)
  }

  async getTalkByDate(startDate: string, endDate: string, limit: string, page: string) {
    const talks = await this.talkModel.find({ workerDate: { $gte: startDate, $lte: endDate } }).populate('trainerId').populate('registerId').exec();
    const talksResponse = talks.map(talk => ({
      ...talk.toObject(),
      trainer: talk.trainerId,
      register: talk.registerId,
      trainerId: talk.trainerId?._id,
      registerId: talk.registerId?._id
    }))
    return {
      data: talksResponse,
      total: talksResponse.length,
      page: parseInt(page),
      limit: parseInt(limit)
    }
  }

  formatDate(date: string) {
    const [year, month, day] = date.split('-')
    return `${day}/${month}/${year}`
  }

  async search(searchDto: SearchTalkDto, limit: number, page: number) {
    const {
      startDate,
      endDate,
      turn,
      registerNumber,
      type,
      staffTransmissionId,
    } = searchDto
    // Tipado, no `any`: con `any` ni el listado ni la cuenta comprueban que
    // los campos del filtro existan, y una falta de ortografia en una clave
    // pasa como filtro vacio.
    const query: FilterQuery<Talk> = {
      workerDate: { $gte: startDate, $lte: endDate },
    }
    if (turn) {
      query.turn = turn
    }

    if (registerNumber) {
      query.registerNumber = Number(registerNumber)
    }

    if (staffTransmissionId) {
      query.staffTransmissionId = staffTransmissionId
    }

    if (type) {
      if (type === 'Otros') {
        query.type = {
          $nin: [
            'Inducción',
            'Charla',
            'Entrenamiento',
            'Simulacro de emergencia',
          ],
        }
      } else {
        query.type = type
      }
    }
    const nameds = await this.namedService.getNameds({
      sInitialDate: this.formatDate(startDate),
      sFinalDate: this.formatDate(endDate),
    })
    // `total` cuenta las charlas que encajan con el filtro, no las de esta
    // pagina: con el tamano de pagina el panel calculaba siempre una sola.
    const [talks, total] = await Promise.all([
      this.talkModel
        .find(query)
        .populate('trainerId')
        .populate('registerId')
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.talkModel.countDocuments(query).exec(),
    ])
    return {
      data: talks,
      total,
      page: page,
      limit: limit,
      nameds: nameds.listStaff,
    }
  }

  /** Charlas de un conjunto de nombradas, para contarlas en el listado. */
  async getByStaffTransmissionIds(ids: string[]) {
    if (ids.length === 0) {
      return []
    }
    return this.talkModel
      .find({ staffTransmissionId: { $in: ids } })
      .select('staffTransmissionId workerDate turn topic type registerNumber')
      .lean()
      .exec()
  }

  /**
   * Charlas de una nombrada, con entrenador y responsable resueltos. Lo usa la
   * vista de detalle, que las muestra completas en lugar de solo contarlas.
   */
  async getByStaffTransmissionId(staffTransmissionId: string) {
    return this.talkModel
      .find({ staffTransmissionId })
      .populate('trainerId')
      .populate('registerId')
      .sort({ startTime: 1 })
      .lean()
      .exec()
  }

  async findAll() {
    return this.talkModel.find().populate('trainerId').populate('registerId').exec();
  }

  async findOne(id: string) {
    const talk = await this.talkModel
      .findById(id)
      .populate('trainerId')
      .populate('registerId')
      .exec()
    return {
      ...talk?.toObject(),
      trainer: talk?.trainerId,
      register: talk?.registerId,
      trainerId: talk?.trainerId?._id,
      registerId: talk?.registerId?._id
    }
  }

  async update(id: string, updateTalkDto: UpdateTalkDto) {
    return this.talkModel
      .findByIdAndUpdate(id, updateTalkDto, { new: true })
      .populate('trainerId')
      .populate('registerId')
      .exec()
  }

  async remove(id: string) {
    const talk = await this.talkModel.findByIdAndDelete(id).exec()
    await this.assistantService.deleteByTalkId(id)
    return talk
  }
}
