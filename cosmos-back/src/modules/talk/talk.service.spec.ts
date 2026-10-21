import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { TalkService } from './talk.service';
import { Talk } from './entities/talk.entity';
import { AssistantService } from '../assistant/assistant.service';
import { NamedService } from '../named/named.service';
import { query } from '../../testing';

/**
 * `NamedService` y `TalkService` se importan mutuamente; en la aplicacion lo
 * resuelve el `forwardRef`, pero cargar el modulo real aqui rompe el orden de
 * inicializacion. La fabrica devuelve una clase vacia que sirve de token.
 */
jest.mock('../named/named.service', () => ({ NamedService: class NamedService {} }));

describe('TalkService', () => {
  let service: TalkService;
  let model: jest.Mock & Record<string, jest.Mock>;
  let assistants: { deleteByTalkId: jest.Mock };
  let nameds: { getNameds: jest.Mock };

  const guardado = jest.fn();
  const doc = (data: Record<string, unknown>) => ({ ...data, toObject: () => ({ ...data }) });

  beforeEach(async () => {
    const constructor = jest.fn().mockImplementation((data) => ({ ...data, save: guardado }));
    model = Object.assign(constructor, {
      create: jest.fn().mockResolvedValue({ _id: 't1' }),
      find: jest.fn(() => query([])),
      // `search` cuenta aparte las coincidencias para el total de paginas.
      countDocuments: jest.fn(() => query(0)),
      findById: jest.fn(() => query(null)),
      findByIdAndUpdate: jest.fn(() => query(null)),
      findByIdAndDelete: jest.fn(() => query({ _id: 't1' })),
    }) as never

    assistants = { deleteByTalkId: jest.fn().mockResolvedValue(undefined) };
    nameds = { getNameds: jest.fn().mockResolvedValue({ listStaff: [] }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TalkService,
        { provide: getModelToken(Talk.name), useValue: model },
        { provide: AssistantService, useValue: assistants },
        { provide: NamedService, useValue: nameds },
      ],
    }).compile();

    service = module.get(TalkService);
  });

  describe('create', () => {
    const base = {
      trainerId: '6862b2dd5b6efa7634310d2f',
      registerId: '6862b2dd5b6efa7634310d30',
      place: 'Muelle 1',
      otherPlace: '',
    };

    it('convierte entrenador y responsable a ObjectId', async () => {
      await service.create({ ...base } as never);

      const construido = model.mock.calls[0][0];
      expect(construido.trainerId).toBeInstanceOf(Types.ObjectId);
      expect(construido.registerId).toBeInstanceOf(Types.ObjectId);
    });

    it('cuando el lugar es "Otros" guarda el texto libre en su sitio', async () => {
      await service.create({ ...base, place: 'Otros', otherPlace: 'Patio de maniobras' } as never);

      // Si se guardara "Otros" literal, el listado mostraria esa palabra en vez
      // del lugar real y el dato escrito se perderia.
      expect(model.mock.calls[0][0].place).toBe('Patio de maniobras');
    });

    it('con un lugar del catalogo ignora el texto libre', async () => {
      await service.create({ ...base, place: 'Muelle 1', otherPlace: 'sobra' } as never);

      expect(model.mock.calls[0][0].place).toBe('Muelle 1');
    });
  });

  describe('formatDate', () => {
    it('pasa de ISO a dia/mes/ano', () => {
      expect(service.formatDate('2026-03-09')).toBe('09/03/2026');
    });

    it('conserva los ceros a la izquierda', () => {
      // Recortar el cero deja "9/3/2026", que el servicio de nombradas no
      // reconoce y devuelve una lista vacia sin avisar.
      expect(service.formatDate('2026-01-05')).toBe('05/01/2026');
    });
  });

  describe('search', () => {
    const rango = { startDate: '2026-03-01', endDate: '2026-03-31' };

    it('filtra siempre por el rango de fechas', async () => {
      await service.search({ ...rango } as never, 10, 1);

      expect(model.find).toHaveBeenCalledWith({
        workerDate: { $gte: '2026-03-01', $lte: '2026-03-31' },
      });
    });

    it('los filtros opcionales no aparecen si no se piden', async () => {
      await service.search({ ...rango } as never, 10, 1);

      const filtro = model.find.mock.calls[0][0] as Record<string, unknown>;
      expect(Object.keys(filtro)).toEqual(['workerDate']);
    });

    it('convierte el numero de registro a numero', async () => {
      await service.search({ ...rango, registerNumber: '42' } as never, 10, 1);

      // Guardado como numero en Mongo, buscarlo como cadena no encuentra nada.
      expect((model.find.mock.calls[0][0] as { registerNumber: unknown }).registerNumber).toBe(42);
    });

    it('el tipo "Otros" busca todo lo que no sea del catalogo', async () => {
      await service.search({ ...rango, type: 'Otros' } as never, 10, 1);

      expect((model.find.mock.calls[0][0] as { type: unknown }).type).toEqual({
        $nin: ['Inducción', 'Charla', 'Entrenamiento', 'Simulacro de emergencia'],
      });
    });

    it('un tipo concreto se busca por igualdad', async () => {
      await service.search({ ...rango, type: 'Charla' } as never, 10, 1);

      expect((model.find.mock.calls[0][0] as { type: unknown }).type).toBe('Charla');
    });

    it('pide las nombradas del mismo rango, con el formato que espera Visma', async () => {
      await service.search({ ...rango } as never, 10, 1);

      expect(nameds.getNameds).toHaveBeenCalledWith({
        sInitialDate: '01/03/2026',
        sFinalDate: '31/03/2026',
      });
    });

    it('pagina desde 1', async () => {
      const cadena = query([]);
      model.find.mockReturnValue(cadena);

      await service.search({ ...rango } as never, 20, 3);

      expect(cadena.skip).toHaveBeenCalledWith(40);
      expect(cadena.limit).toHaveBeenCalledWith(20);
    });

    it('adjunta la lista de personal de las nombradas', async () => {
      nameds.getNameds.mockResolvedValue({ listStaff: [{ sDocument: '12345678' }] });

      const respuesta = await service.search({ ...rango } as never, 10, 1);

      expect(respuesta.nameds).toEqual([{ sDocument: '12345678' }]);
    });
  });

  describe('getByStaffTransmissionIds', () => {
    it('no consulta la base con una lista vacia', async () => {
      await expect(service.getByStaffTransmissionIds([])).resolves.toEqual([]);

      // Sin el atajo, `$in: []` recorre la coleccion para no devolver nada.
      expect(model.find).not.toHaveBeenCalled();
    });

    it('busca por el conjunto de nombradas pedido', async () => {
      await service.getByStaffTransmissionIds(['n1', 'n2']);

      expect(model.find).toHaveBeenCalledWith({ staffTransmissionId: { $in: ['n1', 'n2'] } });
    });

    it('trae solo los campos que el listado necesita', async () => {
      const cadena = query([]);
      model.find.mockReturnValue(cadena);

      await service.getByStaffTransmissionIds(['n1']);

      expect(cadena.select).toHaveBeenCalledWith(
        'staffTransmissionId workerDate turn topic type registerNumber'
      );
    });
  });

  describe('getByStaffTransmissionId', () => {
    it('ordena las charlas por hora de inicio', async () => {
      const cadena = query([]);
      model.find.mockReturnValue(cadena);

      await service.getByStaffTransmissionId('n1');

      // La vista de detalle las pinta en orden; sin el `sort` salen como las
      // devuelva Mongo, que es el orden de insercion.
      expect(cadena.sort).toHaveBeenCalledWith({ startTime: 1 });
    });
  });

  describe('findOne', () => {
    it('aplana entrenador y responsable conservando sus ids', async () => {
      const entrenador = { _id: 'e1', name: 'Luis' };
      const responsable = { _id: 'r1', name: 'Ana' };
      model.findById.mockReturnValue(
        query(doc({ _id: 't1', trainerId: entrenador, registerId: responsable }))
      );

      const charla = await service.findOne('t1');

      expect(charla.trainer).toEqual(entrenador);
      expect(charla.register).toEqual(responsable);
      expect(charla.trainerId).toBe('e1');
      expect(charla.registerId).toBe('r1');
    });

    it('no revienta cuando la charla no existe', async () => {
      await expect(service.findOne('fantasma')).resolves.toEqual({
        trainer: undefined,
        register: undefined,
        trainerId: undefined,
        registerId: undefined,
      });
    });
  });

  describe('remove', () => {
    it('borra tambien la asistencia de la charla', async () => {
      await service.remove('t1');

      // Dejarla huerfana infla los conteos de asistencia de ahi en adelante.
      expect(assistants.deleteByTalkId).toHaveBeenCalledWith('t1');
    });

    it('devuelve la charla borrada', async () => {
      await expect(service.remove('t1')).resolves.toEqual({ _id: 't1' });
    });
  });

  describe('getTalkByDate', () => {
    it('devuelve pagina y limite como numeros, no como texto', async () => {
      const respuesta = await service.getTalkByDate('2026-03-01', '2026-03-31', '10', '2');

      // Llegan de `@Param` como cadenas; devolverlas asi rompe la aritmetica
      // del paginador en el frontend.
      expect(respuesta.page).toBe(2);
      expect(respuesta.limit).toBe(10);
    });

    it('filtra por el rango de fechas', async () => {
      await service.getTalkByDate('2026-03-01', '2026-03-31', '10', '1');

      expect(model.find).toHaveBeenCalledWith({
        workerDate: { $gte: '2026-03-01', $lte: '2026-03-31' },
      });
    });
  });
});
