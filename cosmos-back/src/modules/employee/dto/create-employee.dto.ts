import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator'
import { Trim } from '../../../common/validation/trim'
import {
  DOCUMENT_MESSAGE,
  DOCUMENT_PATTERN,
  EMPLOYEE_NAME_MAX,
  EMPLOYEE_NAME_MESSAGE,
  EMPLOYEE_NAME_PATTERN,
  EXTERNAL_CODE_PATTERN,
  STORED_URL_PATTERN,
} from '../../../common/validation/text-rules'

/**
 * Alta de la ficha de un empleado desde el registro de la app.
 *
 * El endpoint recibia `any`: cualquier sesion, incluida la de rol USER, podia
 * guardar cualquier campo con cualquier contenido, y asi entro un nombre con
 * codigo JavaScript. Solo se aceptan los campos que manda la app; el resto
 * (huella, rostro, firma, estado) lo gestiona el servidor por su cuenta.
 */
export class CreateEmployeeDto {
  /** `staff_id` de Cosmos. Quien viene solo de Visma no lo tiene. */
  @IsOptional()
  @IsInt({ message: 'El código de personal debe ser un número entero.' })
  @Min(1, { message: 'El código de personal debe ser un número entero.' })
  id?: number

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(EMPLOYEE_NAME_MAX)
  @Matches(EMPLOYEE_NAME_PATTERN, { message: EMPLOYEE_NAME_MESSAGE })
  firstName: string

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Los apellidos son obligatorios.' })
  @MaxLength(EMPLOYEE_NAME_MAX)
  @Matches(EMPLOYEE_NAME_PATTERN, { message: EMPLOYEE_NAME_MESSAGE })
  lastName: string

  @Trim()
  @IsString()
  @Matches(DOCUMENT_PATTERN, { message: DOCUMENT_MESSAGE })
  document: string

  /** Foto ya guardada. Si llega un fichero, manda el fichero. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(STORED_URL_PATTERN, { message: 'La imagen no es válida.' })
  image?: string

  @IsOptional()
  @IsString()
  @Matches(EXTERNAL_CODE_PATTERN, { message: 'El id de Visma no es válido.' })
  vismaId?: string

  @IsOptional()
  @IsString()
  @Matches(EXTERNAL_CODE_PATTERN, { message: 'El legajo no es válido.' })
  fileNumber?: string
}
