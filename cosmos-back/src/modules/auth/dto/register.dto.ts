import { ApiProperty } from '@nestjs/swagger';
import {
    IsEmail,
    IsMongoId,
    IsNotEmpty,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from 'class-validator';
import { Trim } from '../../../common/validation/trim';
import {
    PASSWORD_MAX,
    PASSWORD_MESSAGE,
    PASSWORD_MIN,
    PASSWORD_PATTERN,
    PERSON_NAME_MAX,
    PERSON_NAME_MESSAGE,
    PERSON_NAME_MIN,
    PERSON_NAME_PATTERN,
} from '../../../common/validation/text-rules';

/**
 * Mismas reglas que `CreateUserDto`. Este DTO solo pedia `@IsString()` en el
 * nombre, y era la otra via para guardar un usuario con codigo en el nombre.
 */
export class RegisterDto {
    @ApiProperty({ description: 'The email of the user', example: 'test@test.com' })
    @Trim()
    @IsEmail({}, { message: 'El correo electrónico no es válido.' })
    @IsNotEmpty({ message: 'El correo electrónico es obligatorio.' })
    email: string;

    @ApiProperty({ description: 'The password of the user', example: 'clave2026' })
    @IsString()
    @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
    @MinLength(PASSWORD_MIN, { message: PASSWORD_MESSAGE })
    @MaxLength(PASSWORD_MAX, {
        message: `La contraseña no puede pasar de ${PASSWORD_MAX} caracteres.`,
    })
    @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
    password: string;

    @ApiProperty({ description: 'The name of the user', example: 'John Doe' })
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
    name: string;

    @ApiProperty({ description: 'The role id of the user', example: '6862b2c2a64f8b0d488d9197' })
    @IsMongoId({ message: 'Selecciona un rol válido.' })
    roleId: string;
}
