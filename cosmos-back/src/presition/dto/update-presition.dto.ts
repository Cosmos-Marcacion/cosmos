import { PartialType } from '@nestjs/swagger';
import { CreatePresitionDto } from './create-presition.dto';

export class UpdatePresitionDto extends PartialType(CreatePresitionDto) {}
