import {
  IsEmail,
  IsMongoId,
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
  PERSON_NAME_MAX,
  PERSON_NAME_MESSAGE,
  PERSON_NAME_MIN,
  PERSON_NAME_PATTERN,
} from '../../../common/validation/text-rules'

export class CreateUserDto {
  @Trim()
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio.' })
  email: string

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MinLength(PERSON_NAME_MIN, {
    message: `El nombre debe tener al menos ${PERSON_NAME_MIN} caracteres.`,
  })
  @MaxLength(PERSON_NAME_MAX, {
    message: `El nombre no puede pasar de ${PERSON_NAME_MAX} caracteres.`,
  })
  @Matches(PERSON_NAME_PATTERN, { message: PERSON_NAME_MESSAGE })
  name: string

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  @MinLength(PASSWORD_MIN, { message: PASSWORD_MESSAGE })
  @MaxLength(PASSWORD_MAX, {
    message: `La contraseña no puede pasar de ${PASSWORD_MAX} caracteres.`,
  })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  password: string

  @IsMongoId({ message: 'Selecciona un rol válido.' })
  roleId: string
}
