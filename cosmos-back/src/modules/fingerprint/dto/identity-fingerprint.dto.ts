import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IdentityFingerprintDto {
    @ApiProperty({ description: 'Template de la huella en Base64 para identificación' })
    @IsString()
    template: string;
}

