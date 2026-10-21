import { PartialType } from '@nestjs/swagger';
import { CreateNamedDto } from './create-named.dto';

export class UpdateNamedDto extends PartialType(CreateNamedDto) {}
