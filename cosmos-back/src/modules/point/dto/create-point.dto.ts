import {
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator'
import { Trim } from '../../../common/validation/trim'
import {
  CATALOG_NAME_MAX,
  CATALOG_NAME_MESSAGE,
  CATALOG_NAME_PATTERN,
} from '../../../common/validation/text-rules'

/** Rango acordado para las tolerancias, en minutos (CKI15). */
export const TOLERANCE_MIN = 0
export const TOLERANCE_MAX = 240
const TOLERANCE_MESSAGE = `La tolerancia debe ser un número entero de ${TOLERANCE_MIN} a ${TOLERANCE_MAX} minutos.`

export class CreatePointDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(CATALOG_NAME_MAX, {
    message: `El nombre no puede pasar de ${CATALOG_NAME_MAX} caracteres.`,
  })
  @Matches(CATALOG_NAME_PATTERN, { message: CATALOG_NAME_MESSAGE })
  name: string

  @IsMongoId({ message: 'Selecciona un puerto válido.' })
  portId: string

  // Vacio significa "sin dependencia".
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsMongoId({ message: 'Selecciona un punto válido en "Depende de".' })
  dependOnId: string

  // `IsOptional` dejaba pasar `null`: el panel mandaba `null` cuando el campo
  // tenia "-102e" y la tolerancia se borraba al guardar. Ahora `null` no es
  // "sin valor" sino un error; si no se envia el campo, el esquema pone 0.
  @ValidateIf((_, value) => value !== undefined)
  @IsInt({ message: TOLERANCE_MESSAGE })
  @Min(TOLERANCE_MIN, { message: TOLERANCE_MESSAGE })
  @Max(TOLERANCE_MAX, { message: TOLERANCE_MESSAGE })
  previousTolerance: number

  @ValidateIf((_, value) => value !== undefined)
  @IsInt({ message: TOLERANCE_MESSAGE })
  @Min(TOLERANCE_MIN, { message: TOLERANCE_MESSAGE })
  @Max(TOLERANCE_MAX, { message: TOLERANCE_MESSAGE })
  nextTolerance: number
}
