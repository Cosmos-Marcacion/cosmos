import { Module } from '@nestjs/common';
import { TrainerService } from './trainer.service';
import { TrainerController } from './trainer.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Trainer, TrainerSchema } from './entities/trainer.entity';

@Module({
  imports: [MongooseModule.forFeature([{ name: Trainer.name, schema: TrainerSchema }])],
  controllers: [TrainerController],
  providers: [TrainerService],
})
export class TrainerModule { }
