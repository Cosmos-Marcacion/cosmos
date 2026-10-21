import { Injectable } from '@nestjs/common';
import { CreatePortDto } from './dto/create-port.dto';
import { UpdatePortDto } from './dto/update-port.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Port, PortDocument } from './entities/port.entity';
import { IResponse } from 'src/interfaces/response.interface';
import { buildSearchFilter } from 'src/common/mongo/search';
import { ORDEN_ALFABETICO } from 'src/common/mongo/collation'

@Injectable()
export class PortService {
  constructor(@InjectModel(Port.name) private portModel: Model<PortDocument>) { }
  create(createPortDto: CreatePortDto) {
    return this.portModel.create(createPortDto);
  }

  async findAll(limit: number, page: number, search: string = ''): Promise<IResponse<Port[]>> {
    const query = buildSearchFilter(search, ['name', 'email'])
    // `total` es el numero de coincidencias, no el tamano de la pagina: el
    // panel lo divide entre el limite para saber cuantas paginas pintar.
    const [ports, total] = await Promise.all([
      this.portModel
        .find(query)
        .sort({ name: 1 })
        .collation(ORDEN_ALFABETICO)
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.portModel.countDocuments(query).collation(ORDEN_ALFABETICO).exec(),
    ])
    return {
      data: ports,
      total,
      page,
      limit,
    }
  }

  findOne(id: string) {
    return this.portModel.findById(id).exec();
  }

  update(id: string, updatePortDto: UpdatePortDto) {
    return this.portModel.findByIdAndUpdate(id, updatePortDto, { new: true }).exec();
  }

  remove(id: string) {
    return this.portModel.findByIdAndDelete(id).exec();
  }
}
