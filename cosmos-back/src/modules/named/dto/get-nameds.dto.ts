import { IsNotEmpty, IsString } from "class-validator";

export class GetNamedsDto {
    @IsString()
    @IsNotEmpty()
    sInitialDate: string;
    @IsString()
    @IsNotEmpty()
    sFinalDate: string;
}
