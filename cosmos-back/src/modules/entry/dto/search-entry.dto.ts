import { IsNumber, IsOptional, IsString, MaxLength } from "class-validator";

export class SearchEntryDto {

    @IsOptional()
    @IsString()
    workerDate: string;

    @IsOptional()
    @IsNumber()
    limit: number;

    @IsOptional()
    @IsNumber()
    page: number;

    @IsOptional()
    @IsString()
    turn: string;

    /**
     * Filtros del listado por trabajador. Se aplican aqui, antes de paginar:
     * en el panel filtraban solo la pagina visible y el total no cuadraba.
     */
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    ship?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    position?: string;
}
