import { Test, TestingModule } from '@nestjs/testing';
import { PresitionController } from './presition.controller';
import { PresitionService } from './presition.service';

describe('PresitionController', () => {
  let controller: PresitionController;
  let service: jest.Mocked<PresitionService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PresitionController],
      providers: [
        {
          provide: PresitionService,
          useValue: { findOne: jest.fn().mockResolvedValue({ value: 0.6 }) },
        },
      ],
    }).compile();

    controller = module.get(PresitionController);
    service = module.get(PresitionService);
  });

  it('GET devuelve la configuracion de precision', async () => {
    await expect(controller.findOne()).resolves.toEqual({ value: 0.6 });
    expect(service.findOne).toHaveBeenCalledWith();
  });

  it('devuelve null tal cual cuando no hay configuracion, sin inventar un valor por defecto', async () => {
    service.findOne.mockResolvedValue(null as never);

    await expect(controller.findOne()).resolves.toBeNull();
  });
});
