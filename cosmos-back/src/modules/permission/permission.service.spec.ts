import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { PermissionService } from './permission.service';
import { Permission } from './entities/permission.entity';
import { createModelMock, modelProvider, query, ModelMock } from '../../testing';

describe('PermissionService', () => {
  let service: PermissionService;
  let model: ModelMock;

  const userId = '6862b2dd5b6efa7634310d2f';
  const portId = '6862b2dd5b6efa7634310d30';

  beforeEach(async () => {
    model = createModelMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PermissionService, modelProvider(Permission.name, model)],
    }).compile();

    service = module.get(PermissionService);
  });

  describe('create', () => {
    it('convierte los ids de texto a ObjectId antes de guardar', async () => {
      await service.create({ userId, portId } as never);

      const guardado = model.create.mock.calls[0][0];
      // Guardarlos como cadena es el fallo silencioso de este servicio: Mongo
      // acepta el documento, pero ningun `find({ userId: ObjectId })` posterior
      // lo encuentra y el permiso queda invisible.
      expect(guardado.userId).toBeInstanceOf(Types.ObjectId);
      expect(guardado.portId).toBeInstanceOf(Types.ObjectId);
      expect(guardado.userId.toString()).toBe(userId);
      expect(guardado.portId.toString()).toBe(portId);
    });

    it('no arrastra campos extra del DTO al documento', async () => {
      await service.create({ userId, portId, isSuper: true } as never);

      expect(Object.keys(model.create.mock.calls[0][0]).sort()).toEqual(['portId', 'userId']);
    });

    it('falla con un id que no es un ObjectId valido', () => {
      expect(() => service.create({ userId: 'no-valido', portId } as never)).toThrow();
    });
  });

  describe('lecturas y escrituras por id', () => {
    it('findAll pide la coleccion entera', async () => {
      model.find.mockReturnValue(query([{ _id: 'x' }]));

      await expect(service.findAll()).resolves.toEqual([{ _id: 'x' }]);
      expect(model.find).toHaveBeenCalledWith();
    });

    it('findOne busca por id', async () => {
      await service.findOne('perm1');

      expect(model.findById).toHaveBeenCalledWith('perm1');
    });

    it('update devuelve el documento ya modificado', async () => {
      await service.update('perm1', { portId } as never);

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'perm1',
        { portId },
        { new: true }
      );
    });

    it('remove borra por id', async () => {
      await service.remove('perm1');

      expect(model.findByIdAndDelete).toHaveBeenCalledWith('perm1');
    });
  });
});
