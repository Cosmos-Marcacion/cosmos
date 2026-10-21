import { ApiProperty } from '@nestjs/swagger'
import { IsMongoId } from 'class-validator'

// Sin validadores, `whitelist` + `forbidNonWhitelisted` rechazaban los dos
// campos: el alta solo "funcionaba" con el cuerpo vacio, y entonces
// `new Types.ObjectId(undefined)` guardaba ids inventados.
export class CreatePermissionDto {
  @ApiProperty({
    description: 'The id of the user',
    example: '666666666666666666666666',
  })
  @IsMongoId()
  userId: string

  @ApiProperty({
    description: 'The id of the port',
    example: '666666666666666666666666',
  })
  @IsMongoId()
  portId: string
}
