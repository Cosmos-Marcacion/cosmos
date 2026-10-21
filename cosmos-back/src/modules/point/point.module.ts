import { forwardRef, Module } from '@nestjs/common';
import { PointService } from './point.service';
import { PointController } from './point.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Point, PointSchema } from './entities/point.entity';
import { EntryModule } from '../entry/entry.module';
import { NamedModule } from '../named/named.module';
import { EmployeeModule } from '../employee/employee.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: Point.name, schema: PointSchema }]),
  forwardRef(() => EntryModule),
  forwardRef(() => NamedModule),
  forwardRef(() => EmployeeModule),
  ],
  controllers: [PointController],
  providers: [PointService],
  exports: [PointService],
})
export class PointModule { }
