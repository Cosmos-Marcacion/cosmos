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
import { RoleService } from './role.service'
import { CreateRoleDto } from './dto/create-role.dto'
import { UpdateRoleDto } from './dto/update-role.dto'
import { ParseObjectIdPipe } from '../../common/mongo/params'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../auth/guards/roles.guard'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ModuleGuard } from '../../common/access/module.guard'
import { RequireModule } from '../../common/access/require-module.decorator'

@ApiTags('Role')
@ApiBearerAuth()
// Llevaba `@Roles(Super)` en la clase, pero `RolesGuard` solo lee el metodo y
// nunca se aplico. Tampoco puede aplicarse: `Admin` tiene `perfiles` desde la
// migracion y el panel le abre la pantalla. Quien entra aqui lo decide el
// modulo, como en el resto de la plataforma.
@UseGuards(AuthGuard('jwt'), RolesGuard, ModuleGuard)
@RequireModule('perfiles')
@Controller('role')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @ApiOperation({ summary: 'Create a new role' })
  @Post()
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.roleService.create(createRoleDto)
  }

  @ApiOperation({
    summary: 'Los modulos que se pueden dar a un perfil',
    description:
      'El catalogo con el que se construye la pantalla de perfiles. Sale del ' +
      'codigo y no de la base de datos: una opcion del menu que no existe no ' +
      'se puede dar como permiso.',
  })
  @Get('modules')
  modules() {
    return this.roleService.modules()
  }

  @ApiOperation({ summary: 'Get all roles' })
  @Get()
  findAll() {
    return this.roleService.findAll()
  }

  @ApiOperation({ summary: 'Get a role by id' })
  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.roleService.findOne(id)
  }

  @ApiOperation({ summary: 'Update a role by id' })
  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateRoleDto: UpdateRoleDto
  ) {
    return this.roleService.update(id, updateRoleDto)
  }

  @ApiOperation({ summary: 'Delete a role by id' })
  @Delete(':id')
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.roleService.remove(id)
  }
}
