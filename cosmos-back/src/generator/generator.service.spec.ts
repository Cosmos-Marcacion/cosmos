import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GeneratorService } from './generator.service';
import { UploadService } from 'src/modules/upload/upload.service';
import { EmployeeService } from 'src/modules/employee/employee.service';
import * as bwip from 'bwip-js';

jest.mock('bwip-js', () => ({ toBuffer: jest.fn() }));

/**
 * `EmployeeService` arrastra un ciclo de importacion
 * (employee -> named -> entry -> employee) que en la aplicacion resuelve el
 * `forwardRef` de Nest, pero que al cargar el modulo suelto estalla con
 * "Cannot access 'X' before initialization".
 *
 * La fabrica devuelve una clase vacia sin tocar el modulo real. Basta: lo unico
 * que este test necesita de `EmployeeService` es su identidad como token de
 * inyeccion, y el comportamiento lo pone el `useValue` de cada caso.
 */
jest.mock('src/modules/employee/employee.service', () => ({
  EmployeeService: class EmployeeService {},
}));

describe('GeneratorService', () => {
  let service: GeneratorService;
  let upload: jest.Mocked<UploadService>;
  let employee: jest.Mocked<EmployeeService>;
  const toBuffer = bwip.toBuffer as unknown as jest.Mock;

  const empleado = { _id: { toString: () => '6862b2dd5b6efa7634310d2f' } };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeneratorService,
        {
          provide: UploadService,
          useValue: { uploadImageBuffer: jest.fn().mockResolvedValue('https://cdn/qr.png') },
        },
        { provide: EmployeeService, useValue: { findOne: jest.fn().mockResolvedValue(empleado) } },
      ],
    }).compile();

    service = module.get(GeneratorService);
    upload = module.get(UploadService);
    employee = module.get(EmployeeService);
    toBuffer.mockResolvedValue(Buffer.from('png'));
  });

  it('devuelve la url de la imagen subida', async () => {
    await expect(
      service.generateAndUpload({ employeeId: 'e1', type: 'qrcode' } as never)
    ).resolves.toEqual({ url: 'https://cdn/qr.png' });
  });

  it('codifica el id del empleado, no el id que vino en la peticion', async () => {
    await service.generateAndUpload({ employeeId: 'e1', type: 'qrcode' } as never);

    // La distincion importa: el DTO trae un identificador cualquiera y lo que
    // el lector de codigos debe encontrar es el `_id` del documento hallado.
    // Si se codificara el del DTO, un escaneo apuntaria a un empleado que no es.
    expect(toBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ text: '6862b2dd5b6efa7634310d2f' })
    );
  });

  it('usa el tipo de codigo pedido', async () => {
    await service.generateAndUpload({ employeeId: 'e1', type: 'code128' } as never);

    expect(toBuffer).toHaveBeenCalledWith(expect.objectContaining({ bcid: 'code128' }));
  });

  it('da mas alto al QR que al codigo de barras', async () => {
    await service.generateAndUpload({ employeeId: 'e1', type: 'qrcode' } as never);
    const qr = toBuffer.mock.calls[0][0];

    await service.generateAndUpload({ employeeId: 'e1', type: 'code128' } as never);
    const barras = toBuffer.mock.calls[1][0];

    expect(qr.height).toBe(17);
    expect(barras.height).toBe(10);
  });

  it('sube el PNG con un nombre unico por generacion', async () => {
    await service.generateAndUpload({ employeeId: 'e1', type: 'qrcode' } as never);
    await service.generateAndUpload({ employeeId: 'e1', type: 'qrcode' } as never);

    const [primero, segundo] = upload.uploadImageBuffer.mock.calls.map((c) => c[1] as string);

    // Sin nombre unico la segunda subida pisaria la primera en el bucket y dos
    // empleados acabarian compartiendo imagen.
    expect(primero).not.toBe(segundo);
    expect(primero).toMatch(/^qrcode-[0-9a-f-]{36}\.png$/);
  });

  it('sube el buffer que devolvio el generador', async () => {
    const png = Buffer.from('imagen-real');
    toBuffer.mockResolvedValue(png);

    await service.generateAndUpload({ employeeId: 'e1', type: 'qrcode' } as never);

    expect(upload.uploadImageBuffer).toHaveBeenCalledWith(png, expect.any(String));
  });

  it('falla con 404 si el empleado no existe', async () => {
    employee.findOne.mockResolvedValue(null as never);

    await expect(
      service.generateAndUpload({ employeeId: 'fantasma', type: 'qrcode' } as never)
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('no genera ni sube nada cuando el empleado no existe', async () => {
    employee.findOne.mockResolvedValue(null as never);

    await service
      .generateAndUpload({ employeeId: 'fantasma', type: 'qrcode' } as never)
      .catch(() => undefined);

    expect(toBuffer).not.toHaveBeenCalled();
    expect(upload.uploadImageBuffer).not.toHaveBeenCalled();
  });

  it('propaga el fallo de la subida en vez de devolver una url vacia', async () => {
    upload.uploadImageBuffer.mockRejectedValue(new Error('S3 rechazo el objeto'));

    await expect(
      service.generateAndUpload({ employeeId: 'e1', type: 'qrcode' } as never)
    ).rejects.toThrow('S3 rechazo el objeto');
  });
});
