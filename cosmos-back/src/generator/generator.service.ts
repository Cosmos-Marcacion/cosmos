import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateGeneratorDto } from './dto/create-generator.dto';
import { UploadService } from 'src/modules/upload/upload.service';
import { EmployeeService } from 'src/modules/employee/employee.service';
import * as bwip from 'bwip-js';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GeneratorService {
  constructor(private uploadService: UploadService, private employeeService: EmployeeService) {

  }

  async generateAndUpload(createGeneratorDto: CreateGeneratorDto): Promise<{ url: string }> {
    const { employeeId, type } = createGeneratorDto;
    const employee = await this.employeeService.findOne(employeeId);
    if (!employee) {
      throw new NotFoundException('El empleado no se encuentra registrado');
    }

    const text = employee._id.toString();
    const pngBuffer = await bwip.toBuffer({
      bcid: type,
      text: text,
      scale: 3,
      height: type === 'qrcode' ? 17 : 10,
      includetext: true,
      textxalign: 'center',
    });

    const filename = `${type}-${uuidv4()}.png`;

    const url = await this.uploadService.uploadImageBuffer(pngBuffer, filename);
    return { url };
  }
}
