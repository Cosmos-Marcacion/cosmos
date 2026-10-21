import { Controller, Get } from '@nestjs/common';
import { PresitionService } from './presition.service';

@Controller('presition')
export class PresitionController {
  constructor(private readonly presitionService: PresitionService) { }



  @Get()
  findOne() {
    return this.presitionService.findOne();
  }
}
