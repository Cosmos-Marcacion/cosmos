import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common'
import { PortService } from './port.service'
import { CreatePortDto } from './dto/create-port.dto'
import { UpdatePortDto } from './dto/update-port.dto'
import { UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../auth/guards/roles.guard'

import { ModuleGuard } from '../../common/access/module.guard'
import { RequireModule } from '../../common/access/require-module.decorator'
import { ParseObjectIdPipe, parseIntParam } from '../../common/mongo/params'
@UseGuards(AuthGuard('jwt'), RolesGuard, ModuleGuard)
@RequireModule('puertos')
@Controller('port')
export class PortController {
  constructor(private readonly portService: PortService) {}

  @Post()
  create(@Body() createPortDto: CreatePortDto) {
    return this.portService.create(createPortDto)
  }

  @Get(':limit/:page')
  findAll(
    @Param('limit', parseIntParam('El límite')) limit: number,
    @Param('page', parseIntParam('La página')) page: number,
    @Query('search') search: string
  ) {
    return this.portService.findAll(limit, page, search)
  }

  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.portService.findOne(id)
  }

  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updatePortDto: UpdatePortDto
  ) {
    return this.portService.update(id, updatePortDto)
  }

  @Delete(':id')
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.portService.remove(id)
  }
}
