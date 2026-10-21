import { IsNotEmpty, IsNumber } from "class-validator"

export class CreatePresitionDto {
    @IsNumber()
    @IsNotEmpty()
    presition: number
}
