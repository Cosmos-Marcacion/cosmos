import { IsBoolean, IsIn, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, IsDateString } from "class-validator";
import { ENTRY_METHODS, EntryMethod } from "../entities/entry.entity";

export class CreateEntryDto {
    @IsNotEmpty()
    @IsString()
    @IsMongoId()
    pointId: string;

    @IsNotEmpty()
    @IsString()
    @IsMongoId()
    employeeId: string;

    @IsBoolean()
    @IsOptional()
    isAbsence: boolean;

    @IsBoolean()
    @IsOptional()
    isRemate: boolean;

    @IsString()
    @IsOptional()
    workerDate: string;

    @IsNumber()
    @IsOptional()
    namedId: number;

    @IsOptional()
    date: string;

    @IsString()
    @IsOptional()
    observation: string;

    /** Con que se identifico la persona en la app. */
    @IsIn(ENTRY_METHODS)
    @IsOptional()
    method?: EntryMethod;

    /** Distancia del rostro o puntuacion de la huella. */
    @IsNumber()
    @IsOptional()
    matchScore?: number;
}
