import { IsMongoId } from "class-validator";

export class CreateAssistantDto {
    @IsMongoId()
    employeeId: string;

    @IsMongoId()
    talkId: string;
}
