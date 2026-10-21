import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayUnique, IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateRoleDto {

    /**
     * El nombre ya no sale de un enum.
     *
     * Con `IsEnum(ROLES)` solo se podian crear los tres perfiles de siempre, que
     * es justo lo que este cambio viene a quitar: el cliente crea los suyos
     * ("Supervisor de turno", "Solo consulta") sin tocar codigo.
     */
    @ApiProperty({ description: 'Nombre del perfil', example: 'Supervisor de turno' })
    @IsString()
    @IsNotEmpty()
    name: string

    @ApiPropertyOptional({ description: 'Para que sirve el perfil' })
    @IsString()
    @IsOptional()
    description?: string

    @ApiPropertyOptional({
        description: 'Modulos que puede abrir. Claves de PLATFORM_MODULES.',
        example: ['panel', 'marcaciones'],
    })
    @IsArray()
    @IsString({ each: true })
    @ArrayUnique()
    @IsOptional()
    permissions?: string[]

    @ApiPropertyOptional({ description: 'Si el perfil se puede asignar' })
    @IsBoolean()
    @IsOptional()
    active?: boolean

}
