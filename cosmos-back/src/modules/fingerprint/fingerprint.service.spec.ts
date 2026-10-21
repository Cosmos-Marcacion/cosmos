import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { FingerprintService } from './fingerprint.service';
import { Fingerprint } from './entities/fingerprint.entity';
import { EmployeeService } from '../employee/employee.service';
import { query } from '../../testing';

jest.mock('../employee/employee.service', () => ({
  EmployeeService: class EmployeeService {},
}));

/**
 * Las huellas son el dato mas sensible que guarda el sistema y el que decide si
 * una persona figura como presente. Los casos vigilan dos cosas: que el estado
 * del empleado no se desincronice de la huella guardada, y que un fallo interno
 * no acabe describiendo la base de datos en la respuesta.
 */
describe('FingerprintService', () => {
  let service: FingerprintService;
  let model: jest.Mock & Record<string, jest.Mock>;
  let employees: { findOne: jest.Mock; updateFingerprintStatus: jest.Mock };

  const employeeId = '6862b2dd5b6efa7634310d2f';
  const fingerprintId = new Types.ObjectId('6862b2dd5b6efa7634310d30');
  const guardar = jest.fn();

  const dto = {
    employeeId,
    template: 'QkFTRTY0',
    quality: 80,
    templateLen: 512,
  };

  beforeEach(async () => {
    const constructor = jest.fn().mockImplementation((data) => ({ ...data, save: guardar }));
    model = Object.assign(constructor, {
      find: jest.fn(() => query([])),
      findOne: jest.fn(() => query(null)),
      deleteMany: jest.fn(() => query({ deletedCount: 1 })),
    }) as never;

    guardar.mockResolvedValue({ _id: fingerprintId });
    employees = {
      findOne: jest.fn().mockResolvedValue({ _id: employeeId }),
      updateFingerprintStatus: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FingerprintService,
        { provide: getModelToken(Fingerprint.name), useValue: model },
        { provide: EmployeeService, useValue: employees },
      ],
    }).compile();

    service = module.get(FingerprintService);
  });

  describe('saveFingerprint', () => {
    it('devuelve el id de la huella guardada', async () => {
      await expect(service.saveFingerprint(dto as never)).resolves.toEqual({
        status: 'success',
        fingerprintId: fingerprintId.toString(),
      });
    });

    it('guarda el empleado como ObjectId', async () => {
      await service.saveFingerprint(dto as never);

      expect(model.mock.calls[0][0].employeeId).toBeInstanceOf(Types.ObjectId);
    });

    it('marca al empleado como enrolado con el id de su huella', async () => {
      await service.saveFingerprint(dto as never);

      // Si el estado no se actualizara, el empleado tendria huella guardada y
      // la pantalla seguiria pidiendo que la registre.
      expect(employees.updateFingerprintStatus).toHaveBeenCalledWith(
        employeeId,
        true,
        fingerprintId.toString()
      );
    });

    it('actualiza el estado despues de guardar, no antes', async () => {
      await service.saveFingerprint(dto as never);

      // Al reves, un fallo al guardar dejaria al empleado marcado como enrolado
      // sin huella detras.
      expect(guardar.mock.invocationCallOrder[0]).toBeLessThan(
        employees.updateFingerprintStatus.mock.invocationCallOrder[0]
      );
    });

    it('falla con 404 si el empleado no existe', async () => {
      employees.findOne.mockResolvedValue(null);

      await expect(service.saveFingerprint(dto as never)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('el 404 no se convierte en un 500', async () => {
      employees.findOne.mockResolvedValue(null);

      // El `catch` general envuelve todo; sin la comprobacion explicita, un
      // empleado inexistente se reportaria como fallo del servidor.
      await expect(service.saveFingerprint(dto as never)).rejects.not.toBeInstanceOf(
        InternalServerErrorException
      );
    });

    it('no guarda huella si el empleado no existe', async () => {
      employees.findOne.mockResolvedValue(null);

      await service.saveFingerprint(dto as never).catch(() => undefined);

      expect(guardar).not.toHaveBeenCalled();
      expect(employees.updateFingerprintStatus).not.toHaveBeenCalled();
    });

    it('un fallo al guardar sale como 500', async () => {
      guardar.mockRejectedValue(new Error('disco lleno'));

      await expect(service.saveFingerprint(dto as never)).rejects.toBeInstanceOf(
        InternalServerErrorException
      );
    });
  });

  describe('identifyFingerprint', () => {
    it('devuelve el empleado cuando el template coincide', async () => {
      const empleado = { _id: 'e1', name: 'Ana' };
      model.findOne.mockReturnValue(query({ employeeId: empleado }));

      await expect(service.identifyFingerprint('QkFTRTY0')).resolves.toEqual({
        employee: empleado,
      });
    });

    it('busca por coincidencia exacta del template', async () => {
      await service.identifyFingerprint('QkFTRTY0');

      expect(model.findOne).toHaveBeenCalledWith({ template: 'QkFTRTY0' });
    });

    it('devuelve empleado nulo cuando no hay coincidencia, sin lanzar', async () => {
      model.findOne.mockReturnValue(query(null));

      // Es la respuesta esperada del lector cuando la huella no esta enrolada;
      // convertirla en error haria fallar el marcaje en vez de rechazarlo.
      await expect(service.identifyFingerprint('otra')).resolves.toEqual({ employee: null });
    });

    it('un fallo de la base sale como 500', async () => {
      model.findOne.mockReturnValue({
        populate: () => ({ exec: () => Promise.reject(new Error('timeout')) }),
      });

      await expect(service.identifyFingerprint('QkFTRTY0')).rejects.toBeInstanceOf(
        InternalServerErrorException
      );
    });
  });

  describe('deleteFingerprintByEmployeeId', () => {
    it('borra todas las huellas del empleado', async () => {
      await service.deleteFingerprintByEmployeeId(employeeId);

      const filtro = model.deleteMany.mock.calls[0][0] as { employeeId: Types.ObjectId };
      expect(filtro.employeeId).toBeInstanceOf(Types.ObjectId);
      expect(filtro.employeeId.toString()).toBe(employeeId);
    });

    it('deja al empleado marcado como no enrolado', async () => {
      await service.deleteFingerprintByEmployeeId(employeeId);

      expect(employees.updateFingerprintStatus).toHaveBeenCalledWith(employeeId, false);
    });

    it('borra primero y actualiza el estado despues', async () => {
      await service.deleteFingerprintByEmployeeId(employeeId);

      expect(model.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
        employees.updateFingerprintStatus.mock.invocationCallOrder[0]
      );
    });
  });

  describe('findAll', () => {
    it('devuelve las huellas registradas', async () => {
      model.find.mockReturnValue(query([{ _id: 'f1' }]));

      await expect(service.findAll()).resolves.toEqual([{ _id: 'f1' }]);
    });
  });
});
