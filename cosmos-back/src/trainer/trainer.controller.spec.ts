import { Test, TestingModule } from '@nestjs/testing';
import { TrainerController } from './trainer.controller';
import { TrainerService } from './trainer.service';

describe('TrainerController', () => {
  let controller: TrainerController;
  let service: jest.Mocked<TrainerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrainerController],
      providers: [
        {
          provide: TrainerService,
          useValue: {
            create: jest.fn().mockResolvedValue({ _id: 'e1' }),
            resolveFromPerson: jest.fn().mockResolvedValue({ _id: 'e1' }),
            findAll: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({ _id: 'e1' }),
            update: jest.fn().mockResolvedValue({ _id: 'e1' }),
            remove: jest.fn().mockResolvedValue({ _id: 'e1' }),
          },
        },
      ],
    }).compile();

    controller = module.get(TrainerController);
    service = module.get(TrainerService);
  });

  it('POST delega el DTO', async () => {
    const dto = { firstName: 'Marcos', lastName: 'Torres' } as never;

    await controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('POST /resolve pasa la persona del maestro al servicio', async () => {
    const persona = { fullName: 'TORRES ALARCON MARCOS', document: '12345678' } as never;

    await expect(controller.resolve(persona)).resolves.toEqual({ _id: 'e1' });
    expect(service.resolveFromPerson).toHaveBeenCalledWith(persona);
  });

  it('POST /resolve se declara antes que las rutas por id', () => {
    const metodos = Object.getOwnPropertyNames(TrainerController.prototype);

    // No colisionan hoy porque `resolve` es POST y `:id` es GET, pero el orden
    // lo deja fijado por si alguien anade un POST /:id mas adelante.
    expect(metodos.indexOf('resolve')).toBeLessThan(metodos.indexOf('findOne'));
  });

  it('GET lista, GET por id, PATCH y DELETE delegan', async () => {
    await controller.findAll();
    await controller.findOne('e1');
    await controller.update('e1', { position: 'Jefe' } as never);
    await controller.remove('e1');

    expect(service.findAll).toHaveBeenCalledWith();
    expect(service.findOne).toHaveBeenCalledWith('e1');
    expect(service.update).toHaveBeenCalledWith('e1', { position: 'Jefe' });
    expect(service.remove).toHaveBeenCalledWith('e1');
  });

  it('propaga el fallo del servicio', async () => {
    service.resolveFromPerson.mockRejectedValue(new Error('maestro no disponible'));

    await expect(controller.resolve({ fullName: 'X' } as never)).rejects.toThrow(
      'maestro no disponible'
    );
  });
});
