import { PartialType } from '@nestjs/swagger';
import { CreateFingerprintDto } from './create-fingerprint.dto';

export class UpdateFingerprintDto extends PartialType(CreateFingerprintDto) {}
