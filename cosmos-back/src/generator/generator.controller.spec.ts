import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { GeneratorController } from './generator.controller';
import { GeneratorService } from './generator.service';
import { ROLES } from 'src/modules/auth/enums/roles.enum';

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

describe('GeneratorController', () => {
  let controller: GeneratorController;
  let service: jest.Mocked<GeneratorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeneratorController],
      providers: [
        {
          provide: GeneratorService,
          useValue: {
            generateAndUpload: jest.fn().mockResolvedValue({ url: 'https://cdn/qr.png' }),
          },
        },
      ],
    }).compile();

    controller = module.get(GeneratorController);
    service = module.get(GeneratorService);
  });

  it('POST delega el DTO y devuelve la url', async () => {
    const dto = { employeeId: 'e1', type: 'qrcode' } as never;

    await expect(controller.create(dto)).resolves.toEqual({ url: 'https://cdn/qr.png' });
    expect(service.generateAndUpload).toHaveBeenCalledWith(dto);
  });

  it('propaga el 404 del servicio', async () => {
    service.generateAndUpload.mockRejectedValue(new Error('El empleado se encuentra registrado'));

    await expect(controller.create({} as never)).rejects.toThrow();
  });

  it('exige rol de administrador y el modulo de generador', () => {
    const reflector = new Reflector();

    // Genera credenciales fisicas: quien pueda llamar aqui puede fabricar un
    // codigo que abre un puerto. La restriccion es parte del contrato.
    expect(reflector.get<string[]>('roles', GeneratorController)).toEqual([
      ROLES.SUPER_ADMIN,
      ROLES.ADMIN,
    ]);
    expect(reflector.get<string>('requireModule', GeneratorController)).toBe('generador');
  });
});
