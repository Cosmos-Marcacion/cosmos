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
import { AuthGuard } from '@nestjs/passport'
import { ParseObjectIdPipe } from '../common/mongo/params'
import { TrainerService } from './trainer.service'
import { CreateTrainerDto } from './dto/create-trainer.dto'
import { UpdateTrainerDto } from './dto/update-trainer.dto'
import { ResolveTrainerDto } from './dto/resolve-trainer.dto'

/**
 * Exige sesion: no la exigia, y cualquiera podia crear, cambiar o borrar
 * entrenadores. Lo llaman el panel y la app desde el formulario de charlas,
 * siempre con sesion abierta.
 */
@Controller('trainer')
@UseGuards(AuthGuard('jwt'))
export class TrainerController {
  constructor(private readonly trainerService: TrainerService) {}

  @Post()
  create(@Body() createTrainerDto: CreateTrainerDto) {
    return this.trainerService.create(createTrainerDto)
  }

  /**
   * Resuelve una persona del maestro de personal a su `Trainer` local,
   * creándolo si es la primera vez que se la elige. Lo usa el selector de
   * personal del formulario de charlas.
   */
  @Post('resolve')
  resolve(@Body() person: ResolveTrainerDto) {
    return this.trainerService.resolveFromPerson(person)
  }

  @Get()
  findAll() {
    return this.trainerService.findAll()
  }

  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.trainerService.findOne(id)
  }

  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateTrainerDto: UpdateTrainerDto
  ) {
    return this.trainerService.update(id, updateTrainerDto)
  }

  @Delete(':id')
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.trainerService.remove(id)
  }
}
