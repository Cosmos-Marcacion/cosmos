import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { GeneratorService } from './generator.service';
import { CreateGeneratorDto } from './dto/create-generator.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/modules/auth/decorators/roles.decorador';
import { ROLES } from 'src/modules/auth/enums/roles.enum';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';

import { ModuleGuard } from '../common/access/module.guard';
import { RequireModule } from '../common/access/require-module.decorator';
@ApiTags('Generator')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, ModuleGuard)
@Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
@RequireModule('generador')
@Controller('generator')
export class GeneratorController {
  constructor(private readonly generatorService: GeneratorService) { }

  @Post()
  create(@Body() createGeneratorDto: CreateGeneratorDto) {
    return this.generatorService.generateAndUpload(createGeneratorDto);
  }
}
