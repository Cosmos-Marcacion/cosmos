import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common'
import { EntryService } from './entry.service'
import { CreateEntryDto } from './dto/create-entry.dto'
import { UpdateEntryDto } from './dto/update-entry.dto'
import { SearchEntryDto } from './dto/search-entry.dto'
import { CreateManualDto } from './dto/create-manual.dto'
import { DashboardDto } from './dto/dashboard.dto'
import { CancelAbsenceDto } from './dto/cancel-absence.dtp'

import { UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../auth/guards/roles.guard'
import { ModuleGuard } from '../../common/access/module.guard'
import { RequireModule } from '../../common/access/require-module.decorator'
import { ParseObjectIdPipe, parseNamedIdParam } from '../../common/mongo/params'
@UseGuards(AuthGuard('jwt'), RolesGuard, ModuleGuard)
@RequireModule('marcaciones')
@Controller('entry')
export class EntryController {
  constructor(private readonly entryService: EntryService) {}

  @Post()
  create(@Body() createEntryDto: CreateEntryDto) {
    return this.entryService.create(createEntryDto)
  }

  @Post('manual')
  createManual(@Body() createManualDto: CreateManualDto) {
    return this.entryService.createManual(createManualDto)
  }

  @Post('checkin')
  checkin(@Body() createEntryDto: CreateEntryDto) {
    return this.entryService.checkin(createEntryDto)
  }

  @Get()
  findAll() {
    return this.entryService.findAll()
  }

  @Post('search')
  search(@Body() searchEntryDto: SearchEntryDto) {
    return this.entryService.search(searchEntryDto)
  }

  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.entryService.findOne(id)
  }

  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateEntryDto: UpdateEntryDto
  ) {
    return this.entryService.update(id, updateEntryDto)
  }

  @Delete(':id')
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.entryService.remove(id)
  }

  @Get('employee/:id/:staffTransmissionId/:date')
  getEntriesByEmployeeId(
    @Param('id') id: string,
    @Param('staffTransmissionId', parseNamedIdParam())
    staffTransmissionId: number,
    @Param('date') date: string
  ) {
    return this.entryService.getEntriesByEmployeeId(
      id,
      staffTransmissionId,
      date
    )
  }

  @Get('employee-and-named/:id/:staffTransmissionId/:date')
  getEntriesByEmployeeIdAndNamedId(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('staffTransmissionId', parseNamedIdParam())
    staffTransmissionId: number,
    @Param('date') date: string
  ) {
    return this.entryService.getEntriesByEmployeeIdAndNamedId(
      id,
      staffTransmissionId,
      date
    )
  }

  @Get('remate/:employeeId')
  remate(@Param('employeeId', ParseObjectIdPipe) employeeId: string) {
    return this.entryService.remate(employeeId)
  }

  @Post('dashboard')
  dashboard(@Body() dashboardDto: DashboardDto) {
    return this.entryService.dashboard(dashboardDto)
  }

  @Post('dashboard/assistances')
  dashboardAssistances(@Body() dashboardDto: DashboardDto) {
    return this.entryService.getAssistancesDashboard(dashboardDto)
  }

  @Post('dashboard/nameds')
  dashboardNameds(@Body() dashboardDto: DashboardDto) {
    return this.entryService.getNamedsDashboard(dashboardDto)
  }

  @Get('dashboard/filters')
  getDashboardFilters() {
    return this.entryService.getDashboardFilters()
  }

  @Post('cancel-absence')
  cancelAbsence(@Body() cancelAbsenceDto: CancelAbsenceDto) {
    return this.entryService.cancelAbsence(cancelAbsenceDto)
  }
}
