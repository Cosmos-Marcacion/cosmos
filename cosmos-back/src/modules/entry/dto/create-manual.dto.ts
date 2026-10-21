import {
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator'

export class CreateManualDto {
  // Pese al nombre, es el documento del trabajador: el servicio lo busca con
  // `findByDocument`. Por eso no se valida como ObjectId.
  @IsNotEmpty()
  @IsString()
  employeeId: string

  // Va a `new Types.ObjectId(...)`: mal formado daba 500 en vez de 400.
  @IsNotEmpty()
  @IsMongoId()
  pointId: string

  @IsNotEmpty()
  @IsString()
  date: string

  @IsNotEmpty()
  @IsString()
  time: string

  @IsNotEmpty()
  @IsNumber()
  namedId: number

  @IsString()
  @IsOptional()
  observation: string

  // Dia real de la marcacion (`yyyy-mm-dd`) si no es el de la jornada: la
  // salida del turno de noche cae al dia siguiente.
  @IsOptional()
  @IsDateString({ strict: true })
  markDate?: string
}
