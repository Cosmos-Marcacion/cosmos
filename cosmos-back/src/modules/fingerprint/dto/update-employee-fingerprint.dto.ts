import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateEmployeeFingerprintDto {
    @ApiProperty({ description: 'Indica si el empleado tiene huella registrada' })
    @IsBoolean()
    issetFinger: boolean;
}

