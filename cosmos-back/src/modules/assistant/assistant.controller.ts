import { UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../auth/guards/roles.guard'
import { ModuleGuard } from '../../common/access/module.guard'
import { RequireModule } from '../../common/access/require-module.decorator'
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
import { AssistantService } from './assistant.service'
import { CreateAssistantDto } from './dto/create-assistant.dto'
import { UpdateAssistantDto } from './dto/update-assistant.dto'
import { SaveEmployeesDto } from './dto/save-employees.dto'
import { DeleteResult } from 'mongoose'
import { ParseObjectIdPipe } from '../../common/mongo/params'

// Pedia `panel`, pero los asistentes solo los gestiona el formulario de
// charlas, que es de marcaciones (`/talk` exige `marcaciones`). Un perfil con
// marcaciones y sin panel creaba la charla y no podia anadirle asistentes.
@UseGuards(AuthGuard('jwt'), RolesGuard, ModuleGuard)
@RequireModule('marcaciones')
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post()
  create(@Body() createAssistantDto: CreateAssistantDto) {
    return this.assistantService.create(createAssistantDto)
  }

  @Post('save-by-employee-ids')
  saveByEmployeeIds(@Body() saveByEmployeeIdsDto: SaveEmployeesDto) {
    return this.assistantService.saveByEmployeeIds(
      saveByEmployeeIdsDto.employeeIds,
      saveByEmployeeIdsDto.talkId
    )
  }

  @Get()
  findAll() {
    return this.assistantService.findAll()
  }

  @Get('talk/:talkId')
  getByTalkId(@Param('talkId', ParseObjectIdPipe) talkId: string) {
    return this.assistantService.getByTalkId(talkId)
  }

  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.assistantService.findOne(id)
  }

  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateAssistantDto: UpdateAssistantDto
  ) {
    return this.assistantService.update(id, updateAssistantDto)
  }

  @Delete('delete-by-employee-id/:employeeId')
  deleteByEmployeeId(
    @Param('employeeId', ParseObjectIdPipe) employeeId: string,
    // Obligatorio: sin la charla se borraba la primera asistencia del
    // empleado en cualquier charla. Sin `talkId` responde 400.
    @Query('talkId', ParseObjectIdPipe) talkId: string
  ) {
    return this.assistantService.deleteByEmployeeId(employeeId, talkId)
  }

  @Delete('delete-by-talk-id/:talkId')
  deleteByTalkId(
    @Param('talkId', ParseObjectIdPipe) talkId: string
  ): Promise<DeleteResult> {
    return this.assistantService.deleteByTalkId(talkId)
  }

  @Delete(':id')
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.assistantService.remove(id)
  }
}
