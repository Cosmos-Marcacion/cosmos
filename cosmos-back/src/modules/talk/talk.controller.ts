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
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common'
import { TalkService } from './talk.service'
import { CreateTalkDto } from './dto/create-talk.dto'
import { UpdateTalkDto } from './dto/update-talk.dto'
import { SearchTalkDto } from './dto/search-talk.dto'
import { ParseObjectIdPipe } from '../../common/mongo/params'

@UseGuards(AuthGuard('jwt'), RolesGuard, ModuleGuard)
@RequireModule('marcaciones')
@Controller('talk')
export class TalkController {
  constructor(private readonly talkService: TalkService) {}

  @Post()
  create(@Body() createTalkDto: CreateTalkDto) {
    return this.talkService.create(createTalkDto)
  }

  @Get()
  findAll() {
    return this.talkService.findAll()
  }

  @Get('date/:startDate/:endDate/:limit/:page')
  getTalkByDate(
    @Param('startDate') startDate: string,
    @Param('endDate') endDate: string,
    @Param('limit') limit: string,
    @Param('page') page: string
  ) {
    return this.talkService.getTalkByDate(startDate, endDate, limit, page)
  }

  @Post('search')
  search(
    @Body() searchDto: SearchTalkDto,
    // Sin valor por defecto, una peticion sin `limit` o `page` llegaba a Mongo
    // como `skip(NaN)` y respondia 500.
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number
  ) {
    return this.talkService.search(searchDto, limit, page)
  }

  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.talkService.findOne(id)
  }

  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateTalkDto: UpdateTalkDto
  ) {
    return this.talkService.update(id, updateTalkDto)
  }

  @Delete(':id')
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.talkService.remove(id)
  }
}
