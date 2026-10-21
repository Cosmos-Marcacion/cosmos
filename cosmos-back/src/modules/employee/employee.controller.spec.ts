import { Test, TestingModule } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants'
import { EmployeeController } from './employee.controller'
import { EmployeeService } from './employee.service'
import { EmployeeDirectoryService } from './employee-directory.service'
import { EmployeeSyncRunService } from './employee-sync-run.service'

jest.mock('../named/named.service', () => ({
  NamedService: class NamedService {},
}))
jest.mock('face-api.js', () => ({
  nets: {
    ssdMobilenetv1: { loadFromDisk: jest.fn() },
    faceLandmark68Net: { loadFromDisk: jest.fn() },
    faceRecognitionNet: { loadFromDisk: jest.fn() },
  },
  LabeledFaceDescriptors: class {},
  FaceMatcher: jest.fn(),
}))

/** Ruta declarada de un metodo del controlador, tal y como la registra Nest. */
const ruta = (metodo: string) => ({
  path: Reflect.getMetadata(
    PATH_METADATA,
    EmployeeController.prototype[metodo]
  ) as string,
  method: Reflect.getMetadata(
    METHOD_METADATA,
    EmployeeController.prototype[metodo]
  ) as number,
})

/**
 * Forma de una ruta: lo que decide si dos rutas casan con las mismas URLs.
 * El nombre del parametro no cuenta —`:id` y `:employeeId` aceptan lo mismo—,
 * asi que se normaliza a `:param`.
 */
const forma = (metodo: string) => {
  const { path, method } = ruta(metodo)
  const segmentos = path
    .split('/')
    .filter(Boolean)
    .map(s => (s.startsWith(':') ? ':param' : s))
  return `${method} /${segmentos.join('/')}`
}

/** Orden de declaracion, que es el orden en que Nest resuelve las rutas. */
const orden = (metodo: string) =>
  Object.getOwnPropertyNames(EmployeeController.prototype).indexOf(metodo)

describe('EmployeeController', () => {
  let controller: EmployeeController
  let service: jest.Mocked<EmployeeService>
  let directorySearch: jest.Mock

  beforeEach(async () => {
    // El doble se guarda aparte y no se lee del contenedor: `expect(x.metodo)`
    // sobre la instancia inyectada dispara `unbound-method`.
    directorySearch = jest.fn().mockResolvedValue({
      data: [],
      total: 0,
      minLength: 3,
      vismaAvailable: true,
    })

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmployeeController],
      providers: [
        {
          provide: EmployeeService,
          useValue: {
            create: jest.fn().mockResolvedValue({ _id: 'e1' }),
            saveSignature: jest.fn().mockResolvedValue({ _id: 'e1' }),
            searchEmployee: jest.fn().mockResolvedValue({ _id: 'e1' }),
            findAll: jest.fn().mockResolvedValue([]),
            getEmployeesWithStatus: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({ _id: 'e1' }),
            getByIdBS: jest.fn().mockResolvedValue({ _id: 'e1' }),
            update: jest.fn().mockResolvedValue({ _id: 'e1' }),
            registerFace: jest.fn().mockResolvedValue({ _id: 'e1' }),
            updateFingerprintStatus: jest.fn().mockResolvedValue({ _id: 'e1' }),
            remove: jest.fn().mockResolvedValue({ _id: 'e1' }),
            checkIn: jest.fn().mockResolvedValue({ success: true }),
            syncEmployeesFromNamedService: jest
              .fn()
              .mockResolvedValue({ totalProcessed: 0 }),
            getModelsInfo: jest.fn().mockResolvedValue({}),
            getModelFile: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: EmployeeDirectoryService,
          useValue: { search: directorySearch },
        },
        {
          provide: EmployeeSyncRunService,
          useValue: {
            record: jest.fn((_by: string, sync: () => Promise<unknown>) =>
              sync()
            ),
            list: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile()

    controller = module.get(EmployeeController)
    service = module.get(EmployeeService)
  })

  describe('delegacion', () => {
    it('GET /search/:document busca por documento', async () => {
      await controller.searchEmployee('12345678')

      expect(service.searchEmployee).toHaveBeenCalledWith('12345678')
    })

    it('GET /directory acota el limite y delega en el buscador fusionado', async () => {
      await controller.directory('gar', '900')

      expect(directorySearch).toHaveBeenCalledWith('gar', 500)
    })

    it('GET /directory sin limite usa el de por defecto', async () => {
      await controller.directory(undefined, undefined)

      expect(directorySearch).toHaveBeenCalledWith('', 100)
    })

    it('GET /by-id-bs/:id busca por el id del sistema externo', async () => {
      await controller.getByIdBS(77)

      expect(service.getByIdBS).toHaveBeenCalledWith(77)
    })

    it('PATCH /:id/register-face guarda el descriptor', async () => {
      const descriptor = Array.from({ length: 128 }, () => 0.5)

      await controller.registerFace('e1', descriptor)

      expect(service.registerFace).toHaveBeenCalledWith('e1', descriptor)
    })

    it('POST /check-in pasa el descriptor al reconocimiento', async () => {
      const descriptor = Array.from({ length: 128 }, () => 0.5)

      await controller.checkIn(descriptor)

      expect(service.checkIn).toHaveBeenCalledWith(descriptor)
    })

    it('PATCH de huella pasa solo el indicador, no el DTO entero', async () => {
      await controller.updateFingerprintStatus('e1', {
        issetFinger: true,
      } as never)

      expect(service.updateFingerprintStatus).toHaveBeenCalledWith('e1', true)
    })

    it('GET, DELETE y la lista con estado delegan', async () => {
      await controller.findAll()
      await controller.findOne('e1')
      await controller.remove('e1')

      expect(service.findAll).toHaveBeenCalledWith()
      expect(service.findOne).toHaveBeenCalledWith('e1')
      expect(service.remove).toHaveBeenCalledWith('e1')
    })

    it('GET /loggued es publico y no consulta nada', async () => {
      await expect(controller.getLogguedIn()).resolves.toEqual([])
    })
  })

  /**
   * Nest resuelve las rutas de un controlador en orden de declaracion. Dos
   * rutas con la misma forma —mismo verbo y mismo numero de segmentos— son la
   * misma ruta: la segunda no se alcanza nunca, y no hay error ni aviso al
   * arrancar. El sintoma en produccion es un endpoint que "no hace nada".
   */
  describe('resolucion de rutas', () => {
    it('las rutas de segmento fijo van antes que GET /:id', () => {
      expect(orden('getLogguedIn')).toBeLessThan(orden('findOne'))
      expect(orden('getEmployeesWithStatus')).toBeLessThan(orden('findOne'))
      expect(orden('directory')).toBeLessThan(orden('findOne'))
    })

    it('GET /models se alcanza antes que GET /:id', () => {
      // Declarada despues, `GET /employee/models` entraba en `findOne('models')`.
      expect(orden('getModelsInfo')).toBeLessThan(orden('findOne'))
    })

    it('PATCH del estado de huella tiene una ruta propia', () => {
      // `@Patch(':id')` y `@Patch(':employeeId')` aceptaban las mismas URLs y
      // `updateFingerprintStatus` era inalcanzable.
      expect(forma('updateFingerprintStatus')).not.toBe(forma('update'))
    })

    it('ningun par de rutas del controlador comparte forma', () => {
      const metodos = Object.getOwnPropertyNames(
        EmployeeController.prototype
      ).filter(m => m !== 'constructor' && ruta(m).method !== undefined)
      const porForma = new Map<string, string[]>()
      for (const metodo of metodos) {
        const clave = forma(metodo)
        porForma.set(clave, [...(porForma.get(clave) ?? []), metodo])
      }
      const colisiones = [...porForma.entries()].filter(
        ([, ms]) => ms.length > 1
      )

      // Si aparece una, este test la nombra en vez de dejarla pasar en silencio.
      expect(colisiones.map(([clave]) => clave)).toEqual([])
    })
  })
})
