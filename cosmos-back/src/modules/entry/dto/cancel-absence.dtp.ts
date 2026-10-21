import { IsMongoId, IsNotEmpty, IsString } from 'class-validator'

// Los dos ids van a `new Types.ObjectId(...)`: con uno mal formado la
// peticion acababa en 500 en vez de en 400.
export class CancelAbsenceDto {
  @IsNotEmpty()
  @IsMongoId()
  employeeId: string

  @IsNotEmpty()
  @IsString()
  workerDate: string

  @IsNotEmpty()
  @IsString()
  namedId: string

  @IsNotEmpty()
  @IsMongoId()
  pointId: string
}
