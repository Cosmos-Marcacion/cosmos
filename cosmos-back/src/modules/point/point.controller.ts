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
import { PointService } from './point.service'
import { CreatePointDto } from './dto/create-point.dto'
import { UpdatePointDto } from './dto/update-point.dto'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../auth/guards/roles.guard'

import { ModuleGuard } from '../../common/access/module.guard'
import { RequireModule } from '../../common/access/require-module.decorator'
import { ParseObjectIdPipe, parseIntParam } from '../../common/mongo/params'

/**
 * Tenia `@Roles(Super, Admin)` sobre la clase, pero `RolesGuard` solo lee el
 * metodo: no se aplicaba nunca. El acceso lo decide el modulo del perfil.
 *
 * Las dos lecturas del listado las usan tambien marcaciones y la app movil
 * para marcar, asi que aceptan `marcaciones` ademas de `puntos`. Crear,
 * editar y borrar siguen siendo de `puntos`.
 */
@ApiTags('Point')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, ModuleGuard)
@RequireModule('puntos')
@Controller('point')
export class PointController {
  constructor(private readonly pointService: PointService) {}

  @ApiOperation({ summary: 'Create a new point' })
  @Post()
  create(@Body() createPointDto: CreatePointDto) {
    return this.pointService.create(createPointDto)
  }

  @ApiOperation({ summary: 'Get all points by employee id' })
  @RequireModule('puntos', 'marcaciones')
  @Get('by-employee/:employeeId')
  findAllByEmployeeId(@Param('employeeId') employeeId: string) {
    return this.pointService.findAllByEmployeeId(employeeId)
  }

  @ApiOperation({ summary: 'Get all points' })
  @RequireModule('puntos', 'marcaciones')
  @Get(':limit/:page')
  findAll(
    @Param('limit', parseIntParam('El límite')) limit: number,
    @Param('page', parseIntParam('La página')) page: number,
    @Query('search') search: string
  ) {
    return this.pointService.findAll(limit, page, search)
  }

  @ApiOperation({ summary: 'Get all points by port id' })
  @Get('by-port/:portId/:limit/:page')
  findAllByPortId(
    @Param('portId', ParseObjectIdPipe) portId: string,
    @Param('limit', parseIntParam('El límite')) limit: number,
    @Param('page', parseIntParam('La página')) page: number,
    @Query('search') search: string
  ) {
    return this.pointService.findAllByPortId(portId, limit, page, search)
  }

  @ApiOperation({ summary: 'Get a point by id' })
  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.pointService.findOne(id)
  }

  @ApiOperation({ summary: 'Update a point by id' })
  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updatePointDto: UpdatePointDto
  ) {
    return this.pointService.update(id, updatePointDto)
  }

  @ApiOperation({ summary: 'Delete a point by id' })
  @Delete(':id')
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.pointService.remove(id)
  }
}
