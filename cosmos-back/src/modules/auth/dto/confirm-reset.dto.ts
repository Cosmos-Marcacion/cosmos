import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'
import { Trim } from '../../../common/validation/trim'
import {
  PASSWORD_MAX,
  PASSWORD_MESSAGE,
  PASSWORD_MIN,
  PASSWORD_PATTERN,
} from '../../../common/validation/text-rules'

export class ConfirmResetDto {
  @Trim()
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty()
  email: string

  @Trim()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código son 6 dígitos.' })
  code: string

  // Misma politica que el alta de usuarios: antes aqui bastaban 8 caracteres
  // cualesquiera y en el alta no se pedia nada.
  @IsString()
  @MinLength(PASSWORD_MIN, { message: PASSWORD_MESSAGE })
  @MaxLength(PASSWORD_MAX, {
    message: `La contraseña no puede pasar de ${PASSWORD_MAX} caracteres.`,
  })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  newPassword: string
}
