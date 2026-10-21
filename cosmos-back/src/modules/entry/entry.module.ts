import { Module } from '@nestjs/common';
import { EntryService } from './entry.service';
import { EntryController } from './entry.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Entry, EntrySchema } from './entities/entry.entity';
import { NamedModule } from '../named/named.module';
import { EmployeeModule } from '../employee/employee.module';
import { PointModule } from '../point/point.module';
import { forwardRef } from '@nestjs/common';
import { TalkModule } from '../talk/talk.module';
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Entry.name, schema: EntrySchema }]),
    forwardRef(() => NamedModule),
    forwardRef(() => EmployeeModule),
    forwardRef(() => PointModule),
    forwardRef(() => TalkModule)
  ],
  controllers: [EntryController],
  providers: [EntryService],
  exports: [EntryService],
})
export class EntryModule { }
