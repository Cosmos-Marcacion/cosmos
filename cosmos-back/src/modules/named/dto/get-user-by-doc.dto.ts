import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

/** Documento de identidad a buscar en el sistema externo de nombradas. */
export class GetUserByDocDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  prDocumentNumber: string
}
