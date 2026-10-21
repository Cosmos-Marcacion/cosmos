import { Test, TestingModule } from '@nestjs/testing';
import { TrainerService } from './trainer.service';
import { Trainer } from './entities/trainer.entity';
import { createModelMock, modelProvider, query, ModelMock } from '../testing';

describe('TrainerService', () => {
  let service: TrainerService;
  let model: ModelMock;

  beforeEach(async () => {
    model = createModelMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TrainerService, modelProvider(Trainer.name, model)],
    }).compile();

    service = module.get(TrainerService);
  });

  /**
   * `resolveFromPerson` es el puente entre el maestro de Visma —que entrega
   * "APELLIDOS NOMBRES" en un solo campo— y la coleccion local que las charlas
   * referencian por id. Partir mal ese campo se ve en el reporte impreso.
   */
  describe('resolveFromPerson', () => {
    const cambios = () => model.findOneAndUpdate.mock.calls[0][1].$set;
    const filtro = () => model.findOneAndUpdate.mock.calls[0][0];

    it('toma los dos primeros terminos como apellidos y el resto como nombres', async () => {
      await service.resolveFromPerson({ fullName: 'TORRES ALARCON MARCOS ANTONIO' });

      expect(cambios()).toMatchObject({
        lastName: 'TORRES ALARCON',
        firstName: 'MARCOS ANTONIO',
      });
    });

    it('con un solo termino usa el mismo texto en ambos campos', async () => {
      await service.resolveFromPerson({ fullName: 'CHER' });

      // Preferible a dejar un campo vacio: el reporte imprime los dos y una
      // mitad en blanco se lee como un dato perdido.
      expect(cambios()).toMatchObject({ lastName: 'CHER', firstName: 'CHER' });
    });

    it('con dos terminos deja los nombres igual al texto completo', async () => {
      await service.resolveFromPerson({ fullName: 'TORRES MARCOS' });

      expect(cambios()).toMatchObject({
        lastName: 'TORRES MARCOS',
        firstName: 'TORRES MARCOS',
      });
    });

    it('normaliza los espacios repetidos del maestro', async () => {
      await service.resolveFromPerson({ fullName: '  TORRES   ALARCON   MARCOS  ' });

      expect(cambios()).toMatchObject({
        lastName: 'TORRES ALARCON',
        firstName: 'MARCOS',
      });
    });

    it('busca por documento cuando lo hay', async () => {
      await service.resolveFromPerson({ fullName: 'TORRES ALARCON MARCOS', document: '12345678' });

      // El documento es lo unico estable entre los dos sistemas: buscar por
      // nombre duplicaria la ficha en cuanto alguien corrija una tilde.
      expect(filtro()).toEqual({ document: '12345678' });
    });

    it('recorta los espacios del documento antes de usarlo como clave', async () => {
      await service.resolveFromPerson({ fullName: 'TORRES MARCOS', document: ' 12345678 ' });

      expect(filtro()).toEqual({ document: '12345678' });
    });

    it('sin documento cae al nombre partido', async () => {
      await service.resolveFromPerson({ fullName: 'TORRES ALARCON MARCOS' });

      expect(filtro()).toEqual({ lastName: 'TORRES ALARCON', firstName: 'MARCOS' });
    });

    it('un documento en blanco no cuenta como documento', async () => {
      await service.resolveFromPerson({ fullName: 'TORRES ALARCON MARCOS', document: '   ' });

      // Si contara, todas las personas sin documento compartirian la misma
      // ficha con clave vacia.
      expect(filtro()).not.toHaveProperty('document');
    });

    it('crea la ficha la primera vez y la reutiliza despues', async () => {
      await service.resolveFromPerson({ fullName: 'TORRES MARCOS', document: '12345678' });

      expect(model.findOneAndUpdate.mock.calls[0][2]).toEqual({
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      });
    });

    it('marca la ficha como activa y guarda el cargo', async () => {
      await service.resolveFromPerson({ fullName: 'TORRES MARCOS', position: 'Supervisor' });

      expect(cambios()).toMatchObject({ position: 'Supervisor', active: true });
    });

    it('sin cargo guarda cadena vacia, no undefined', async () => {
      await service.resolveFromPerson({ fullName: 'TORRES MARCOS' });

      expect(cambios().position).toBe('');
    });
  });

  describe('CRUD', () => {
    it('create guarda el DTO', async () => {
      const dto = { firstName: 'Marcos', lastName: 'Torres' } as never;

      await service.create(dto);

      expect(model.create).toHaveBeenCalledWith(dto);
    });

    it('findAll pide la coleccion entera', async () => {
      model.find.mockReturnValue(query([{ _id: 'e1' }]));

      await expect(service.findAll()).resolves.toEqual([{ _id: 'e1' }]);
    });

    it('findOne, update y remove trabajan por id', async () => {
      await service.findOne('e1');
      await service.update('e1', { position: 'Jefe' } as never);
      await service.remove('e1');

      expect(model.findById).toHaveBeenCalledWith('e1');
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith('e1', { position: 'Jefe' }, { new: true });
      expect(model.findByIdAndDelete).toHaveBeenCalledWith('e1');
    });
  });
});
