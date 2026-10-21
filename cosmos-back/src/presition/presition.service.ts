import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Presition, PresitionDocument } from './entities/presition.entity';
import { Model } from 'mongoose';
import { CreatePresitionDto } from './dto/create-presition.dto';

@Injectable()
export class PresitionService {

  constructor(@InjectModel(Presition.name) private presitionModel: Model<PresitionDocument>) { }
  findOne() {
    return this.presitionModel.findOne().exec();
  }

  create(createPresitionDto: CreatePresitionDto) {
    return this.presitionModel.create(createPresitionDto);
  }


}
