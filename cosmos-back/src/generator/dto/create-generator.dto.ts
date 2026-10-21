import { IsNotEmpty, IsString } from "class-validator";

export class CreateGeneratorDto {
    @IsNotEmpty()
    @IsString()
    employeeId: string;

    @IsNotEmpty()
    @IsString()
    type: 'qrcode' | 'code128';
}
