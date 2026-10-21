import { ApiProperty } from '@nestjs/swagger';

export class SyncEmployeesResponseDto {
    @ApiProperty({
        description: 'Total de usuarios procesados',
        example: 150
    })
    totalProcessed: number;

    @ApiProperty({
        description: 'Número de nuevos empleados creados',
        example: 25
    })
    newEmployees: number;

    @ApiProperty({
        description: 'Número de empleados que ya existían',
        example: 125
    })
    existingEmployees: number;

    @ApiProperty({
        description: 'Lista de errores encontrados durante la sincronización',
        example: ['Error procesando usuario 123: Documento duplicado'],
        type: [String]
    })
    errors: string[];
}
