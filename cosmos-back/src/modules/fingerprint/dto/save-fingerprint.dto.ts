import { IsString, IsOptional, IsNumber, IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveFingerprintDto {
    @ApiProperty({ description: 'ID del empleado' })
    @IsMongoId()
    employeeId: string;

    @ApiProperty({ description: 'Template de la huella en Base64' })
    @IsString()
    template: string;

    @ApiProperty({ description: 'Calidad de la huella', required: false })
    @IsOptional()
    @IsNumber()
    quality?: number;

    @ApiProperty({ description: 'Longitud del template', required: false })
    @IsOptional()
    @IsNumber()
    templateLen?: number;
}

