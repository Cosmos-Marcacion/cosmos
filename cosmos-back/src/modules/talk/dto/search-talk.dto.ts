import { IsNotEmpty, IsOptional, IsString } from "class-validator"

export class SearchTalkDto {
    @IsString()
    @IsNotEmpty()
    startDate: string
    @IsString()
    @IsNotEmpty()
    endDate: string
    @IsString()
    @IsOptional()
    turn: string
    @IsString()
    @IsOptional()
    registerNumber: string
    @IsString()
    @IsOptional()
    type: string
    @IsString()
    @IsOptional()
    staffTransmissionId: string

}