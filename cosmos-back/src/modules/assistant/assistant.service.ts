import { Injectable } from '@nestjs/common'
import { CreateAssistantDto } from './dto/create-assistant.dto'
import { UpdateAssistantDto } from './dto/update-assistant.dto'
import { InjectModel } from '@nestjs/mongoose'
import { Assistant } from './entities/assistant.entity'
import { DeleteResult, Model, Types } from 'mongoose'

@Injectable()
export class AssistantService {
  constructor(
    @InjectModel(Assistant.name) private assistantModel: Model<Assistant>
  ) {}

  /**
   * Registra como asistentes de una charla a los empleados que aun no lo son.
   *
   * Creaba un registro por cada id sin mirar lo guardado: volver a marcar a
   * alguien, o repetirlo en la lista, lo dejaba dos veces en la charla y en el
   * formato. Devuelve solo los registros nuevos.
   */
  async saveByEmployeeIds(employeeIds: string[], talkId: string) {
    const talkIdObj = new Types.ObjectId(talkId)
    const unicos = [
      ...new Set(employeeIds.map(id => new Types.ObjectId(id).toString())),
    ]
    if (unicos.length === 0) {
      return []
    }

    const existentes = await this.assistantModel
      .find({
        talkId: talkIdObj,
        employeeId: { $in: unicos.map(id => new Types.ObjectId(id)) },
      })
      .select('employeeId')
      .lean()
      .exec()
    const yaRegistrados = new Set(
      existentes.map(assistant => assistant.employeeId.toString())
    )

    const assistantPromises = unicos
      .filter(employeeId => !yaRegistrados.has(employeeId))
      .map(employeeId =>
        this.assistantModel.create({
          employeeId: new Types.ObjectId(employeeId),
          talkId: talkIdObj,
        })
      )
    return Promise.all(assistantPromises)
  }

  create(createAssistantDto: CreateAssistantDto) {
    const employeeId = new Types.ObjectId(createAssistantDto.employeeId)
    const talkId = new Types.ObjectId(createAssistantDto.talkId)
    return this.assistantModel.create({ employeeId, talkId })
  }

  async getByTalkId(talkId: string) {
    const assistants = await this.assistantModel
      .find({ talkId: new Types.ObjectId(talkId) })
      .populate('employeeId')
      .populate('talkId')
      .exec()
    return assistants.map(assistant => ({
      _id: assistant._id,
      employee: assistant.employeeId,
      talk: assistant.talkId,
    }))
  }

  findAll() {
    return this.assistantModel
      .find()
      .populate('employeeId')
      .populate('talkId')
      .exec()
  }

  findOne(id: string) {
    return this.assistantModel
      .findById(id)
      .populate('employeeId')
      .populate('talkId')
      .exec()
  }

  update(id: string, updateAssistantDto: UpdateAssistantDto) {
    return this.assistantModel
      .findByIdAndUpdate(id, updateAssistantDto, { new: true })
      .populate('employeeId')
      .populate('talkId')
      .exec()
  }

  deleteByTalkId(talkId: string): Promise<DeleteResult> {
    return this.assistantModel
      .deleteMany({ talkId: new Types.ObjectId(talkId) })
      .exec()
  }

  /**
   * Quita a un empleado de una charla.
   *
   * Filtraba solo por empleado, asi que borraba su primera asistencia en
   * cualquier charla, no en la que se estaba editando.
   */
  deleteByEmployeeId(employeeId: string, talkId: string) {
    return this.assistantModel
      .findOneAndDelete({
        employeeId: new Types.ObjectId(employeeId),
        talkId: new Types.ObjectId(talkId),
      })
      .exec()
  }

  remove(id: string) {
    return this.assistantModel.findByIdAndDelete(id).exec()
  }
}
