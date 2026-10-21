import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CounterModule } from '../counter/counter.module'
import { DocumentNumber, DocumentNumberSchema } from './document-number.entity'
import { DocumentNumberService } from './document-number.service'

@Module({
  imports: [
    CounterModule,
    MongooseModule.forFeature([{ name: DocumentNumber.name, schema: DocumentNumberSchema }]),
  ],
  providers: [DocumentNumberService],
  exports: [DocumentNumberService],
})
export class NumberingModule { }
