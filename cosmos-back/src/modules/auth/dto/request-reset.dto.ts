import { IsEmail, IsNotEmpty } from 'class-validator'
import { Trim } from '../../../common/validation/trim'

export class RequestResetDto {
  @Trim()
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty({ message: 'Ingresa tu correo electrónico.' })
  email: string
}
