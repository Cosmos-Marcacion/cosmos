import { IsNotEmpty, IsString } from "class-validator";
import { Trim } from "src/common/validation/trim";

export class CreatePortDto {

    @Trim()
    @IsString()
    @IsNotEmpty()
    name: string;

    @Trim()
    @IsString()
    @IsNotEmpty()
    address: string;
}
