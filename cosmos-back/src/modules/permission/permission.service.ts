import { Injectable } from '@nestjs/common';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Permission, PermissionDocument } from './entities/permission.entity';

@Injectable()
export class PermissionService {
  constructor(@InjectModel(Permission.name) private permissionModel: Model<PermissionDocument>) { }
  create(createPermissionDto: CreatePermissionDto) {
    const userId = new Types.ObjectId(createPermissionDto.userId);
    const portId = new Types.ObjectId(createPermissionDto.portId);
    return this.permissionModel.create({ userId, portId });
  }

  findAll() {
    return this.permissionModel.find().exec();
  }

  findOne(id: string) {
    return this.permissionModel.findById(id).exec();
  }

  update(id: string, updatePermissionDto: UpdatePermissionDto) {
    return this.permissionModel.findByIdAndUpdate(id, updatePermissionDto, { new: true }).exec();
  }

  remove(id: string) {
    return this.permissionModel.findByIdAndDelete(id).exec();
  }
}
