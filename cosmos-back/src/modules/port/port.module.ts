import { Module } from '@nestjs/common';
import { PortService } from './port.service';
import { PortController } from './port.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Port, PortSchema } from './entities/port.entity';

@Module({
  imports: [MongooseModule.forFeature([{ name: Port.name, schema: PortSchema }])],
  controllers: [PortController],
  providers: [PortService],
})
export class PortModule { }
