import { PartialType } from '@nestjs/swagger';
import { CreateGeneratorDto } from './create-generator.dto';

export class UpdateGeneratorDto extends PartialType(CreateGeneratorDto) {}
