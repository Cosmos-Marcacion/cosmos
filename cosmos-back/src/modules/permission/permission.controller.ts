import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common'
import { PermissionService } from './permission.service'
import { CreatePermissionDto } from './dto/create-permission.dto'
import { UpdatePermissionDto } from './dto/update-permission.dto'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../auth/guards/roles.guard'
import { ROLES } from '../auth/enums/roles.enum'
import { Roles } from '../auth/decorators/roles.decorador'
import { ParseObjectIdPipe } from '../../common/mongo/params'

/**
 * El rol va en cada metodo y no en la clase: `RolesGuard` solo lee el metodo,
 * y con el decorador en la clase cualquier sesion podia crear, cambiar o
 * borrar permisos de puerto.
 */
@ApiTags('Permission')
@Controller('permission')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @ApiOperation({ summary: 'Create a new permission' })
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @Post()
  create(@Body() createPermissionDto: CreatePermissionDto) {
    return this.permissionService.create(createPermissionDto)
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @Get()
  findAll() {
    return this.permissionService.findAll()
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.permissionService.findOne(id)
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updatePermissionDto: UpdatePermissionDto
  ) {
    return this.permissionService.update(id, updatePermissionDto)
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.permissionService.remove(id)
  }
}
