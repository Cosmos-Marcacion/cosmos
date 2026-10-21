import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { FingerprintController } from './fingerprint.controller';
import { FingerprintService } from './fingerprint.service';

jest.mock('../employee/employee.service', () => ({
  EmployeeService: class EmployeeService {},
}));

describe('FingerprintController', () => {
  let controller: FingerprintController;
  let service: jest.Mocked<FingerprintService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FingerprintController],
      providers: [
        {
          provide: FingerprintService,
          useValue: {
            saveFingerprint: jest
              .fn()
              .mockResolvedValue({ status: 'success', fingerprintId: 'f1' }),
            identifyFingerprint: jest.fn().mockResolvedValue({ employee: null }),
            findAll: jest.fn().mockResolvedValue([]),
            deleteFingerprintByEmployeeId: jest.fn().mockResolvedValue({ ok: true }),
          },
        },
      ],
    }).compile();

    controller = module.get(FingerprintController);
    service = module.get(FingerprintService);
  });

  it('POST /save delega el DTO', async () => {
    const dto = { employeeId: 'e1', template: 'QkFTRTY0', quality: 80, templateLen: 512 } as never;

    await expect(controller.saveFingerprint(dto)).resolves.toEqual({
      status: 'success',
      fingerprintId: 'f1',
    });
    expect(service.saveFingerprint).toHaveBeenCalledWith(dto);
  });

  it('POST /identity extrae el template del DTO', async () => {
    await controller.identifyFingerprint({ template: 'QkFTRTY0' } as never);

    // El servicio recibe la cadena, no el DTO: pasarlo entero buscaria un
    // template que es un objeto y no encontraria a nadie nunca.
    expect(service.identifyFingerprint).toHaveBeenCalledWith('QkFTRTY0');
  });

  it('devuelve empleado nulo sin convertirlo en error', async () => {
    await expect(
      controller.identifyFingerprint({ template: 'desconocida' } as never)
    ).resolves.toEqual({ employee: null });
  });

  it('convierte el fallo del servicio en un 400', async () => {
    service.saveFingerprint.mockRejectedValue(new Error('lector desconectado'));

    await expect(controller.saveFingerprint({} as never)).rejects.toBeInstanceOf(HttpException);
    await expect(controller.saveFingerprint({} as never)).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('un 404 del servicio tambien sale como 400', async () => {
    service.saveFingerprint.mockRejectedValue(new NotFoundException('Empleado no encontrado'));

    // Comportamiento actual: el `catch` aplana cualquier error a 400. Queda
    // fijado para que el dia que se decida propagar el codigo original sea un
    // cambio consciente y no una regresion sorpresa del cliente movil.
    await expect(controller.saveFingerprint({} as never)).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('DELETE por empleado delega el id', async () => {
    await controller.deleteFingerprintByEmployeeId('e1');

    expect(service.deleteFingerprintByEmployeeId).toHaveBeenCalledWith('e1');
  });

  it('GET lista las huellas', async () => {
    await controller.findAll();

    expect(service.findAll).toHaveBeenCalledWith();
  });
});
