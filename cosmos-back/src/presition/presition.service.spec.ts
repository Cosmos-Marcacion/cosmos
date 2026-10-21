import { Test, TestingModule } from '@nestjs/testing';
import { PresitionService } from './presition.service';
import { Presition } from './entities/presition.entity';
import { createModelMock, modelProvider, query, ModelMock } from '../testing';

describe('PresitionService', () => {
  let service: PresitionService;
  let model: ModelMock;

  beforeEach(async () => {
    model = createModelMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PresitionService, modelProvider(Presition.name, model)],
    }).compile();

    service = module.get(PresitionService);
  });

  it('findOne devuelve el unico documento de configuracion', async () => {
    model.findOne.mockReturnValue(query({ _id: 'c1', value: 0.6 }));

    await expect(service.findOne()).resolves.toEqual({ _id: 'c1', value: 0.6 });
    expect(model.findOne).toHaveBeenCalledWith();
  });

  it('findOne devuelve null cuando aun no se configuro nada', async () => {
    await expect(service.findOne()).resolves.toBeNull();
  });

  it('create guarda el DTO', async () => {
    const dto = { value: 0.75 } as never;
    model.create.mockResolvedValue({ _id: 'c1', value: 0.75 });

    await expect(service.create(dto)).resolves.toMatchObject({ value: 0.75 });
    expect(model.create).toHaveBeenCalledWith(dto);
  });

  it('propaga el error de Mongo en vez de devolver undefined', async () => {
    model.create.mockRejectedValue(new Error('coleccion no disponible'));

    await expect(service.create({ value: 1 } as never)).rejects.toThrow(
      'coleccion no disponible'
    );
  });
});
