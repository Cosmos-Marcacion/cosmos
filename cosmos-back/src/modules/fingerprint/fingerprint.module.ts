import { Module } from '@nestjs/common';
import { FingerprintService } from './fingerprint.service';
import { FingerprintController } from './fingerprint.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { FingerprintSchema } from './entities/fingerprint.entity';
import { EmployeeModule } from '../employee/employee.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Fingerprint', schema: FingerprintSchema }]), EmployeeModule],
  controllers: [FingerprintController],
  providers: [FingerprintService],
})
export class FingerprintModule { }
