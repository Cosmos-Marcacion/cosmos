import { forwardRef, Module } from '@nestjs/common';
import { NamedService } from './named.service';
import { NamedController } from './named.controller';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { EmployeeModule } from '../employee/employee.module';
import { EntryModule } from '../entry/entry.module';
import { PointModule } from '../point/point.module';
import { AssistantModule } from '../assistant/assistant.module';
import { TalkModule } from '../talk/talk.module';
import { Named, NamedSchema, NamedSyncDay, NamedSyncDaySchema } from './entities/named.entity';
import { NamedRecord, NamedRecordSchema } from './entities/named-record.entity';
import { NamedRecordService } from './named-record.service';
import { NamedStoreService } from './named-store.service';
import { NamedSyncService } from './named-sync.service';
import { CounterModule } from '../../common/counter/counter.module';

@Module({
  imports: [
    // Sin timeout, una demora del servicio externo dejaba la petición colgada
    // hasta que cortara el proxy.
    HttpModule.register({
      timeout: Number(process.env.COSMOS_HTTP_TIMEOUT_MS ?? 20000),
      maxRedirects: 5,
    }),
    MongooseModule.forFeature([
      { name: Named.name, schema: NamedSchema },
      { name: NamedSyncDay.name, schema: NamedSyncDaySchema },
      { name: NamedRecord.name, schema: NamedRecordSchema },
    ]),
    forwardRef(() => EmployeeModule),
    forwardRef(() => EntryModule),
    forwardRef(() => PointModule),
    forwardRef(() => AssistantModule),
    forwardRef(() => TalkModule),
    CounterModule,
  ],
  controllers: [NamedController],
  providers: [NamedService, NamedStoreService, NamedSyncService, NamedRecordService],
  exports: [NamedService, NamedStoreService, NamedRecordService],
})
export class NamedModule { }
