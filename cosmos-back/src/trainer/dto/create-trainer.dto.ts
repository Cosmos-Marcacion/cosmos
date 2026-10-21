import { IsNotEmpty, IsString } from "class-validator"

export class CreateTrainerDto {
    @IsString()
    @IsNotEmpty()
    firstName: string
    @IsString()
    @IsNotEmpty()
    lastName: string
    @IsString()
    @IsNotEmpty()
    document: string
    @IsString()
    @IsNotEmpty()
    position: string
}
