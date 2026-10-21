import { Test, TestingModule } from '@nestjs/testing';
import { PortService } from './port.service';
import { Port } from './entities/port.entity';
import { createModelMock, modelProvider, query, ModelMock } from '../../testing';

describe('PortService', () => {
  let service: PortService;
  let model: ModelMock;

  beforeEach(async () => {
    model = createModelMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PortService, modelProvider(Port.name, model)],
    }).compile();

    service = module.get(PortService);
  });

  describe('create', () => {
    it('guarda el DTO tal cual llega', async () => {
      const dto = { name: 'Callao', address: 'Av. Mora 1' };
      model.create.mockResolvedValue({ _id: 'p1', ...dto });

      await expect(service.create(dto)).resolves.toMatchObject(dto);
      expect(model.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('pagina desde 1, no desde 0', async () => {
      model.find.mockReturnValue(query([]));

      await service.findAll(10, 3);

      // El error clasico aqui es usar `page * limit`: la pagina 1 se saltaria
      // los diez primeros puertos y el usuario nunca los veria.
      expect(model.find().skip).toHaveBeenCalledWith(20);
      expect(model.find().limit).toHaveBeenCalledWith(10);
    });

    it('la primera pagina no se salta nada', async () => {
      model.find.mockReturnValue(query([]));

      await service.findAll(5, 1);

      expect(model.find().skip).toHaveBeenCalledWith(0);
    });

    it('sin busqueda consulta con filtro vacio', async () => {
      await service.findAll(10, 1);

      expect(model.find).toHaveBeenCalledWith({});
    });

    it('con busqueda filtra por nombre y correo, con el texto escapado', async () => {
      await service.findAll(10, 1, 'a.b');

      expect(model.find).toHaveBeenCalledWith({
        $or: [
          { name: { $regex: 'a\\.b', $options: 'i' } },
          { email: { $regex: 'a\\.b', $options: 'i' } },
        ],
      });
    });

    it('una busqueda de solo espacios se trata como si no hubiera busqueda', async () => {
      await service.findAll(10, 1, '   ');

      expect(model.find).toHaveBeenCalledWith({});
    });

    it('devuelve los puertos con los metadatos de la pagina', async () => {
      const puertos = [{ name: 'Callao' }, { name: 'Paita' }];
      model.find.mockReturnValue(query(puertos));
      model.countDocuments.mockReturnValue(query(2))

      await expect(service.findAll(2, 1)).resolves.toEqual({
        data: puertos,
        total: 2,
        page: 1,
        limit: 2,
      });
    });

    it('total cuenta la coleccion entera, no la pagina', async () => {
      // El fallo que este test fija: `total` devolvia el tamano de la pagina,
      // asi que el panel calculaba `ceil(10 / 10) = 1` y la paginacion se
      // quedaba clavada en la pagina uno por muchos puertos que hubiera.
      model.find.mockReturnValue(query([{ name: 'Callao' }]))
      model.countDocuments.mockReturnValue(query(57))

      const respuesta = await service.findAll(10, 1)

      expect(respuesta.total).toBe(57)
    })

    it('cuenta con el mismo filtro con el que lista', async () => {
      await service.findAll(10, 1, 'callao')

      // Contar con otro filtro da un total que no cuadra con lo que se ve:
      // paginas que existen segun el contador y salen vacias al abrirlas.
      expect(model.countDocuments).toHaveBeenCalledWith(
        model.find.mock.calls[0][0]
      )
    })

    it('ordena alfabeticamente por nombre, con collation en espanol', async () => {
      // Se fija un unico eslabon: por defecto cada `find()` devuelve uno nuevo
      // y la asercion miraria un doble recien creado, sin llamadas.
      model.find.mockReturnValue(query([]))

      await service.findAll(10, 1)

      // Sin collation Mongo ordena por bytes: la eñe cae detras de la zeta.
      expect(model.find().sort).toHaveBeenCalledWith({ name: 1 })
      expect(model.find().collation).toHaveBeenCalledWith({
        locale: 'es',
        strength: 1,
      })
    })
  });

  describe('findOne, update y remove', () => {
    it('busca por id', async () => {
      model.findById.mockReturnValue(query({ _id: 'p1' }));

      await expect(service.findOne('p1')).resolves.toEqual({ _id: 'p1' });
      expect(model.findById).toHaveBeenCalledWith('p1');
    });

    it('devuelve null cuando el puerto no existe', async () => {
      await expect(service.findOne('inexistente')).resolves.toBeNull();
    });

    it('actualiza pidiendo el documento ya modificado', async () => {
      await service.update('p1', { address: 'Muelle 9' });

      // Sin `{ new: true }` la API responderia con la version anterior y la
      // pantalla mostraria el dato viejo justo despues de guardarlo.
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'p1',
        { address: 'Muelle 9' },
        { new: true }
      );
    });

    it('borra por id', async () => {
      await service.remove('p1');

      expect(model.findByIdAndDelete).toHaveBeenCalledWith('p1');
    });
  });
});
