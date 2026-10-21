import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CaptureFingerprintDto {
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(5000) // Mínimo 5 segundos
    @Max(120000) // Máximo 2 minutos
    timeout?: number;
}

export class CaptureWithRetryDto {
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(10)
    maxRetries?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1000) // Mínimo 1 segundo
    @Max(10000) // Máximo 10 segundos
    retryDelay?: number;
}
