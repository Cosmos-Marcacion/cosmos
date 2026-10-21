import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { Employee } from './entities/employee.entity';
import { UploadService } from '../upload/upload.service';
import { NamedService } from '../named/named.service';
import { createModelMock, modelProvider, query, ModelMock } from '../../testing';

jest.mock('../named/named.service', () => ({ NamedService: class NamedService {} }));

/**
 * `face-api` carga tres redes neuronales desde disco en el constructor del
 * servicio. Ni las redes ni `@tensorflow/tfjs-node` tienen nada que ver con lo
 * que se prueba aqui, y cargarlas cuesta mas que toda la suite junta.
 */
jest.mock('face-api.js', () => ({
  nets: {
    ssdMobilenetv1: { loadFromDisk: jest.fn().mockResolvedValue(undefined) },
    faceLandmark68Net: { loadFromDisk: jest.fn().mockResolvedValue(undefined) },
    faceRecognitionNet: { loadFromDisk: jest.fn().mockResolvedValue(undefined) },
  },
  LabeledFaceDescriptors: class LabeledFaceDescriptors {
    constructor(
      public label: string,
      public descriptors: Float32Array[]
    ) {}
  },
  FaceMatcher: jest.fn(),
}));


describe('EmployeeService', () => {
  let service: EmployeeService;
  let model: ModelMock;
  let upload: { uploadImage: jest.Mock };

  const descriptorValido = () => Array.from({ length: 128 }, (_, i) => i / 128);
  /** Un rostro claramente distinto del de `descriptorValido`. */
  const descriptorLejano = () => Array.from({ length: 128 }, (_, i) => i / 128 + 1);

  beforeEach(async () => {
    model = createModelMock();
    upload = { uploadImage: jest.fn().mockResolvedValue('https://cdn/foto.jpg') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeService,
        modelProvider(Employee.name, model),
        { provide: UploadService, useValue: upload },
        { provide: NamedService, useValue: {} },
      ],
    }).compile();

    service = module.get(EmployeeService);
  });

  describe('create', () => {
    const dto = { document: '12345678', firstName: 'Ana', id: '77' };

    it('rechaza un documento ya registrado', async () => {
      model.findOne.mockReturnValue(query({ _id: 'e1' }));

      // El documento es la clave del cruce con el maestro externo: duplicarlo
      // parte en dos el historial de esa persona.
      await expect(service.create(dto, null as never, '')).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(model.create).not.toHaveBeenCalled();
    });

    it('convierte el id externo a numero', async () => {
      await service.create(dto, null as never, '');

      // Llega como texto del formulario. Guardado asi, `find({ id: { $in: [77] } })`
      // del cruce con nombradas no encuentra a nadie.
      expect(model.create.mock.calls[0][0].id).toBe(77);
    });

    it('sin foto guarda cadena vacia y no llama al almacenamiento', async () => {
      await service.create(dto, null as never, '');

      expect(upload.uploadImage).not.toHaveBeenCalled();
      expect(model.create.mock.calls[0][0].image).toBe('');
    });

    it('con foto guarda su url', async () => {
      const archivo = { buffer: Buffer.from('x') } as Express.Multer.File;

      await service.create(dto, archivo, 'ana.jpg');

      expect(upload.uploadImage).toHaveBeenCalledWith(archivo, 'ana.jpg');
      expect(model.create.mock.calls[0][0].image).toBe('https://cdn/foto.jpg');
    });
  });

  describe('findSignaturesByDocuments', () => {
    it('no consulta la base con la lista vacia', async () => {
      await expect(service.findSignaturesByDocuments([])).resolves.toEqual(new Map());

      expect(model.find).not.toHaveBeenCalled();
    });

    it('quita duplicados, vacios y espacios antes de consultar', async () => {
      await service.findSignaturesByDocuments(['12345678', ' 12345678 ', '', null as never]);

      // Una sola consulta para toda la nombrada: el formato pide la firma de
      // una veintena de personas y una consulta por cabeza multiplicaria por
      // veinte el coste de emitirlo.
      expect(model.find).toHaveBeenCalledWith({ document: { $in: ['12345678'] } });
    });

    it('devuelve todo vacio si solo llegan documentos en blanco', async () => {
      await expect(service.findSignaturesByDocuments(['  ', ''])).resolves.toEqual(new Map());
      expect(model.find).not.toHaveBeenCalled();
    });

    it('indexa la firma por documento', async () => {
      model.find.mockReturnValue(
        query([{ document: '12345678', signature: 'https://cdn/firma.png' }])
      );

      const firmas = await service.findSignaturesByDocuments(['12345678']);

      expect(firmas.get('12345678')).toBe('https://cdn/firma.png');
    });

    it('deja fuera a quien no tiene firma registrada', async () => {
      model.find.mockReturnValue(
        query([
          { document: '12345678', signature: '' },
          { document: '87654321', signature: 'https://cdn/firma.png' },
        ])
      );

      const firmas = await service.findSignaturesByDocuments(['12345678', '87654321']);

      // El formato debe salir con el hueco en blanco, no con una imagen rota.
      expect(firmas.has('12345678')).toBe(false);
      expect(firmas.size).toBe(1);
    });

    it('trae solo documento y firma', async () => {
      const cadena = query([]);
      model.find.mockReturnValue(cadena);

      await service.findSignaturesByDocuments(['12345678']);

      expect(cadena.select).toHaveBeenCalledWith('document signature');
    });
  });

  describe('findAllLean y getEmployeesByIds', () => {
    it('findAllLean deja fuera el descriptor facial', async () => {
      const cadena = query([]);
      model.find.mockReturnValue(cadena);

      await service.findAllLean();

      // 128 flotantes por empleado, el 85% del peso del documento, que ninguno
      // de los consumidores de esta lista usa.
      const campos = cadena.select.mock.calls[0][0] as string;
      expect(campos).not.toContain('faceDescriptor');
      expect(campos).toContain('document');
    });

    it('getEmployeesByIds busca por el conjunto de ids externos', async () => {
      await service.getEmployeesByIds([77, 88]);

      expect(model.find).toHaveBeenCalledWith({ id: { $in: [77, 88] } });
    });
  });

  describe('update', () => {
    it('convierte el id externo a numero', async () => {
      await service.update('e1', { id: '77' } as never, null as never, '');

      expect((model.findByIdAndUpdate.mock.calls[0][1] as { id: number }).id).toBe(77);
    });

    it('sube la imagen nueva solo si el DTO no trae una url ya', async () => {
      const archivo = { buffer: Buffer.from('x') } as Express.Multer.File;

      await service.update('e1', { id: '77' } as never, archivo, 'ana.jpg');

      expect(upload.uploadImage).toHaveBeenCalled();
    });

    it('con url en el DTO no vuelve a subir la foto', async () => {
      const archivo = { buffer: Buffer.from('x') } as Express.Multer.File;

      await service.update('e1', { id: '77', image: 'https://cdn/ya.jpg' } as never, archivo, 'a.jpg');

      // Sin esta guarda, cada guardado del formulario deja una copia nueva en
      // el bucket aunque la foto no haya cambiado.
      expect(upload.uploadImage).not.toHaveBeenCalled();
    });

    it('pide el documento ya modificado', async () => {
      await service.update('e1', { id: '77' } as never, null as never, '');

      expect(model.findByIdAndUpdate.mock.calls[0][2]).toEqual({ new: true });
    });
  });

  describe('registerFace', () => {
    it('falla con 404 si el empleado no existe', async () => {
      model.findById.mockReturnValue(query(null));

      await expect(service.registerFace('fantasma', descriptorValido())).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('guarda el descriptor del empleado existente', async () => {
      model.findById.mockReturnValue(query({ _id: 'e1' }));
      model.find.mockReturnValue(query([]));
      const descriptor = descriptorValido();

      await service.registerFace('e1', descriptor);

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'e1',
        { faceDescriptor: descriptor },
        { new: true }
      );
    });

    it('rechaza un rostro que ya se reconoceria como el de otra ficha', async () => {
      model.findById.mockReturnValue(query({ _id: 'e1' }));
      model.find.mockReturnValue(
        query([{ _id: 'e2', firstName: 'Pedro', lastName: 'Zevallos', faceDescriptor: descriptorValido() }])
      );

      await expect(service.registerFace('e1', descriptorValido())).rejects.toThrow(/Pedro Zevallos/);
      expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('no se compara con su propio rostro anterior', async () => {
      model.findById.mockReturnValue(query({ _id: 'e1' }));
      model.find.mockReturnValue(query([{ _id: 'e1', faceDescriptor: descriptorValido() }]));

      await service.registerFace('e1', descriptorValido());

      expect(model.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('borra el rostro con una lista vacia sin compararlo', async () => {
      model.findById.mockReturnValue(query({ _id: 'e1' }));

      await service.registerFace('e1', []);

      expect(model.find).not.toHaveBeenCalled();
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith('e1', { faceDescriptor: [] }, { new: true });
    });

    it('rechaza un descriptor que no tiene 128 valores', async () => {
      model.findById.mockReturnValue(query({ _id: 'e1' }));

      await expect(service.registerFace('e1', [1, 2])).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('checkIn', () => {
    const empleadoCon = (
      nombre: string,
      apellido: string,
      id = 'e1',
      faceDescriptor = descriptorValido()
    ) => ({
      _id: id,
      firstName: nombre,
      lastName: apellido,
      faceDescriptor,
    });

    it('distingue a dos homonimos por su ficha', async () => {
      model.find.mockReturnValue(
        query([
          empleadoCon('Ana', 'Torres', 'e2', descriptorLejano()),
          empleadoCon('Ana', 'Torres', 'e1'),
        ])
      );

      await expect(service.checkIn(descriptorValido())).resolves.toEqual({
        success: true,
        user: { id: 'e1', name: 'Ana Torres' },
        distance: 0,
      });
    });

    // El caso del 16/10/2026: un rostro copiado en varias fichas. Elegir a una
    // de ellas mostraba en pantalla los datos de otra persona.
    it('no reconoce a nadie si el rostro coincide con dos fichas', async () => {
      model.find.mockReturnValue(
        query([empleadoCon('Gerardo', 'Gomez', 'e1'), empleadoCon('Pedro', 'Zevallos', 'e2')])
      );

      await expect(service.checkIn(descriptorValido())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('no reconoce un rostro lejano de todos', async () => {
      model.find.mockReturnValue(query([empleadoCon('Ana', 'Torres', 'e1', descriptorLejano())]));

      await expect(service.checkIn(descriptorValido())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rechaza un descriptor que no tiene 128 valores', async () => {
      await expect(service.checkIn([1, 2, 3])).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un descriptor ausente', async () => {
      await expect(service.checkIn(null as never)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza algo que no es una lista', async () => {
      await expect(service.checkIn('no soy un array' as never)).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('no consulta la base con un descriptor invalido', async () => {
      await service.checkIn([1]).catch(() => undefined);

      expect(model.find).not.toHaveBeenCalled();
    });

    it('falla con 404 si no hay rostros de referencia', async () => {
      model.find.mockReturnValue(query([]));

      await expect(service.checkIn(descriptorValido())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('descarta descriptores guardados con longitud incorrecta', async () => {
      model.find.mockReturnValue(query([{ ...empleadoCon('Ana', 'Torres'), faceDescriptor: [1, 2] }]));

      // Un descriptor corrupto en la base no puede tumbar el reconocimiento de
      // todos los demas: se ignora y se sigue.
      await expect(service.checkIn(descriptorValido())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('devuelve al empleado reconocido', async () => {
      model.find.mockReturnValue(query([empleadoCon('Ana', 'Torres')]));

      await expect(service.checkIn(descriptorValido())).resolves.toEqual({
        success: true,
        user: { id: 'e1', name: 'Ana Torres' },
        distance: 0,
      });
    });

    it('solo trae empleados con descriptor guardado', async () => {
      await service.checkIn(descriptorValido()).catch(() => undefined);

      expect(model.find).toHaveBeenCalledWith({ faceDescriptor: { $ne: null } });
    });
  });

  describe('updateFingerprintStatus', () => {
    it('al enrolar guarda el id de la huella', async () => {
      model.findByIdAndUpdate.mockReturnValue(query({ _id: 'e1' }));

      await service.updateFingerprintStatus('e1', true, 'f1');

      expect(model.findByIdAndUpdate.mock.calls[0][1]).toEqual({
        issetFinger: true,
        fingerprintId: 'f1',
      });
    });

    it('al desenrolar limpia el id de la huella', async () => {
      model.findByIdAndUpdate.mockReturnValue(query({ _id: 'e1' }));

      await service.updateFingerprintStatus('e1', false);

      // Dejar el id apuntando a una huella borrada deja al empleado en un
      // estado que no describe nada real.
      expect(model.findByIdAndUpdate.mock.calls[0][1]).toEqual({
        issetFinger: false,
        fingerprintId: null,
      });
    });

    it('enrolar sin id de huella no toca el campo', async () => {
      model.findByIdAndUpdate.mockReturnValue(query({ _id: 'e1' }));

      await service.updateFingerprintStatus('e1', true);

      expect(model.findByIdAndUpdate.mock.calls[0][1]).toEqual({ issetFinger: true });
    });

    it('falla con 404 si el empleado no existe', async () => {
      model.findByIdAndUpdate.mockReturnValue(query(null));

      await expect(service.updateFingerprintStatus('fantasma', true)).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('el 404 no se degrada a 500', async () => {
      model.findByIdAndUpdate.mockReturnValue(query(null));

      await expect(service.updateFingerprintStatus('fantasma', true)).rejects.not.toBeInstanceOf(
        InternalServerErrorException
      );
    });

    it('un fallo de la base sale como 500', async () => {
      model.findByIdAndUpdate.mockReturnValue({
        exec: () => Promise.reject(new Error('conexion perdida')),
      });

      await expect(service.updateFingerprintStatus('e1', true)).rejects.toBeInstanceOf(
        InternalServerErrorException
      );
    });
  });

  describe('busquedas por documento', () => {
    it('findByDocument y searchEmployee buscan por el mismo campo', async () => {
      await service.findByDocument('12345678');
      await service.searchEmployee('12345678');

      expect(model.findOne).toHaveBeenNthCalledWith(1, { document: '12345678' });
      expect(model.findOne).toHaveBeenNthCalledWith(2, { document: '12345678' });
    });

    it('getByIdBS busca por el id del sistema externo, no por _id', async () => {
      await service.getByIdBS(77);

      expect(model.findOne).toHaveBeenCalledWith({ id: 77 });
    });
  });
});
