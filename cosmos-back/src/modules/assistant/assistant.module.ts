import { Module } from '@nestjs/common';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Assistant, AssistantSchema } from './entities/assistant.entity';

@Module({
  imports: [MongooseModule.forFeature([{ name: Assistant.name, schema: AssistantSchema }])],
  controllers: [AssistantController],
  providers: [AssistantService],
  exports: [AssistantService]
})
export class AssistantModule { }
