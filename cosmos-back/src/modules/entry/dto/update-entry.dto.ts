import { PartialType } from '@nestjs/swagger';
import { CreateEntryDto } from './create-entry.dto';
import { IsDateString, IsOptional } from 'class-validator';

export class UpdateEntryDto extends PartialType(CreateEntryDto) {
    @IsOptional()
    @IsDateString()
    createdAt?: string;
}
