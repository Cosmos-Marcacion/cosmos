import { Module } from '@nestjs/common';
import { GeneratorService } from './generator.service';
import { GeneratorController } from './generator.controller';
import { EmployeeModule } from 'src/modules/employee/employee.module';
import { UploadModule } from 'src/modules/upload/upload.module';

@Module({
  imports: [EmployeeModule, UploadModule],
  controllers: [GeneratorController],
  providers: [GeneratorService],
})
export class GeneratorModule { }
