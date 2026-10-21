import { PartialType } from '@nestjs/swagger'
import { IsMongoId, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import { STORED_URL_PATTERN } from '../../../common/validation/text-rules'
import { CreateEmployeeDto } from './create-employee.dto'

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {
  /** La app la manda vacia para borrar la firma. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(STORED_URL_PATTERN, { message: 'La firma no es válida.' })
  signature?: string
}

export class SaveSignatureDto {
  @IsMongoId({ message: 'El empleado no es válido.' })
  employeeId: string
}
