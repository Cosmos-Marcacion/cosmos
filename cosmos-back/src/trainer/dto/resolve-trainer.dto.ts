import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

/** Persona del maestro de personal que se quiere usar como entrenador o responsable. */
export class ResolveTrainerDto {
  @IsString() @IsNotEmpty() fullName: string

  @IsString() @IsOptional() document?: string

  @IsString() @IsOptional() position?: string
}
