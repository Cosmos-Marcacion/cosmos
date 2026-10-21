import { IsArray, IsMongoId } from "class-validator";

export class SaveEmployeesDto {
    @IsArray()
    @IsMongoId({ each: true })
    employeeIds: string[];

    @IsMongoId()
    talkId: string;
}