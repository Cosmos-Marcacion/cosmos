import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsNumber,
  IsMongoId,
  IsOptional,
} from 'class-validator'

export class CreateTalkDto {
  @IsString()
  @IsNotEmpty()
  type: string

  @IsString()
  @IsNotEmpty()
  topic: string

  @IsString()
  @IsNotEmpty()
  summary: string

  @IsBoolean()
  isAnnual: boolean

  @IsString()
  @IsNotEmpty()
  area: string

  @IsString()
  @IsNotEmpty()
  place: string

  @IsString()
  @IsNotEmpty()
  branch: string

  @IsString()
  workerDate: string

  @IsString()
  @IsNotEmpty()
  turn: string

  @IsString()
  @IsOptional()
  otherPlace: string

  @IsString()
  @IsNotEmpty()
  startTime: string

  @IsString()
  @IsNotEmpty()
  endTime: string

  @IsNumber()
  hours: number

  @IsString()
  registerNumber: string

  @IsMongoId()
  @IsNotEmpty()
  trainerId: string

  @IsMongoId()
  @IsNotEmpty()
  registerId: string

  @IsString()
  @IsNotEmpty()
  staffTransmissionId: string
}
