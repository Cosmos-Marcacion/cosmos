import { Test, TestingModule } from '@nestjs/testing';
import { PortController } from './port.controller';
import { PortService } from './port.service';

/**
 * El controlador no tiene logica propia: traduce la peticion HTTP a una llamada
 * al servicio. Lo que se prueba aqui es esa traduccion —que cada parametro
 * llegue en su sitio y en su orden—, porque es donde se cuelan los errores que
 * ningun tipo detecta: dos `string` intercambiados compilan igual de bien.
 */
describe('PortController', () => {
  let controller: PortController;
  let service: jest.Mocked<PortService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PortController],
      providers: [
        {
          provide: PortService,
          useValue: {
            create: jest.fn().mockResolvedValue({ _id: 'p1' }),
            findAll: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 10 }),
            findOne: jest.fn().mockResolvedValue({ _id: 'p1' }),
            update: jest.fn().mockResolvedValue({ _id: 'p1' }),
            remove: jest.fn().mockResolvedValue({ _id: 'p1' }),
          },
        },
      ],
    }).compile();

    controller = module.get(PortController);
    service = module.get(PortService);
  });

  it('POST delega el DTO al servicio', async () => {
    const dto = { name: 'Callao', address: 'Av. Mora 1' };

    await expect(controller.create(dto)).resolves.toEqual({ _id: 'p1' });
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('GET pasa limite, pagina y busqueda en ese orden', async () => {
    await controller.findAll(20, 2, 'callao');

    expect(service.findAll).toHaveBeenCalledWith(20, 2, 'callao');
  });

  it('GET sin busqueda pasa el parametro sin valor', async () => {
    await controller.findAll(10, 1, undefined as unknown as string);

    expect(service.findAll).toHaveBeenCalledWith(10, 1, undefined);
  });

  it('GET por id delega el id', async () => {
    await controller.findOne('p1');

    expect(service.findOne).toHaveBeenCalledWith('p1');
  });

  it('PATCH pasa id y cuerpo por separado', async () => {
    await controller.update('p1', { address: 'Muelle 9' });

    expect(service.update).toHaveBeenCalledWith('p1', { address: 'Muelle 9' });
  });

  it('DELETE delega el id', async () => {
    await controller.remove('p1');

    expect(service.remove).toHaveBeenCalledWith('p1');
  });

  it('propaga el fallo del servicio en vez de tragarselo', async () => {
    service.findOne.mockRejectedValue(new Error('mongo caido'));

    await expect(controller.findOne('p1')).rejects.toThrow('mongo caido');
  });
});
