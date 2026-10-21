import { Module } from '@nestjs/common';
import { TalkService } from './talk.service';
import { TalkController } from './talk.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Talk, TalkSchema } from './entities/talk.entity';
import { AssistantModule } from '../assistant/assistant.module';
import { NamedModule } from '../named/named.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [MongooseModule.forFeature([{ name: Talk.name, schema: TalkSchema }]), AssistantModule,
  forwardRef(() => NamedModule)],
  controllers: [TalkController],
  providers: [TalkService],
  exports: [TalkService]

})
export class TalkModule { }
