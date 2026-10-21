import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { TalkController } from './talk.controller';
import { TalkService } from './talk.service';

jest.mock('../named/named.service', () => ({ NamedService: class NamedService {} }));

describe('TalkController', () => {
  let controller: TalkController;
  let service: jest.Mocked<TalkService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TalkController],
      providers: [
        {
          provide: TalkService,
          useValue: {
            create: jest.fn().mockResolvedValue({ _id: 't1' }),
            findAll: jest.fn().mockResolvedValue([]),
            getTalkByDate: jest.fn().mockResolvedValue({ data: [] }),
            search: jest.fn().mockResolvedValue({ data: [] }),
            findOne: jest.fn().mockResolvedValue({ _id: 't1' }),
            update: jest.fn().mockResolvedValue({ _id: 't1' }),
            remove: jest.fn().mockResolvedValue({ _id: 't1' }),
          },
        },
      ],
    }).compile();

    controller = module.get(TalkController);
    service = module.get(TalkService);
  });

  it('POST delega el DTO', async () => {
    const dto = { topic: 'Seguridad' } as never;

    await controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('GET por fecha pasa los cuatro parametros en orden', async () => {
    await controller.getTalkByDate('2026-03-01', '2026-03-31', '10', '2');

    // Cuatro cadenas seguidas: intercambiar dos compila igual de bien y el
    // resultado es un rango de fechas absurdo o una pagina equivocada.
    expect(service.getTalkByDate).toHaveBeenCalledWith('2026-03-01', '2026-03-31', '10', '2');
  });

  it('POST /search separa el cuerpo de la paginacion, que va en la query', async () => {
    const dto = { startDate: '2026-03-01', endDate: '2026-03-31' } as never;

    await controller.search(dto, 20, 3);

    expect(service.search).toHaveBeenCalledWith(dto, 20, 3);
  });

  it('GET por id, PATCH y DELETE delegan el id', async () => {
    await controller.findOne('t1');
    await controller.update('t1', { topic: 'Otro' } as never);
    await controller.remove('t1');

    expect(service.findOne).toHaveBeenCalledWith('t1');
    expect(service.update).toHaveBeenCalledWith('t1', { topic: 'Otro' });
    expect(service.remove).toHaveBeenCalledWith('t1');
  });

  it('exige el modulo de marcaciones', () => {
    expect(new Reflector().get<string>('requireModule', TalkController)).toBe('marcaciones');
  });
});
