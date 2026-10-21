import { Module } from '@nestjs/common';
import { PresitionService } from './presition.service';
import { PresitionController } from './presition.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Presition, PresitionSchema } from './entities/presition.entity';

@Module({
  imports: [MongooseModule.forFeature([{ name: Presition.name, schema: PresitionSchema }])],
  controllers: [PresitionController],
  providers: [PresitionService],
})
export class PresitionModule { }
