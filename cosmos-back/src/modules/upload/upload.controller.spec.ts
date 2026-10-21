import { Test, TestingModule } from '@nestjs/testing'
import { UploadController } from './upload.controller'
import { UploadService } from './upload.service'
import type { Response } from 'express'
import { GUARDS_METADATA } from '@nestjs/common/constants'

describe('UploadController', () => {
  let controller: UploadController
  let service: jest.Mocked<UploadService>

  const archivo = {
    buffer: Buffer.from('jpeg'),
    mimetype: 'image/jpeg',
    originalname: 'foto de perfil.jpg',
  } as Express.Multer.File

  const respuestaExpress = () => {
    const res = {
      set: jest.fn(),
      send: jest.fn(),
      status: jest.fn(),
    }
    res.status.mockReturnValue(res)
    return res as unknown as Response & typeof res
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        {
          provide: UploadService,
          useValue: {
            uploadImage: jest.fn().mockResolvedValue('https://cdn/foto.jpg'),
            deleteFile: jest.fn().mockResolvedValue({ message: 'borrado' }),
            getFileBuffer: jest.fn().mockResolvedValue(Buffer.from('imagen')),
          },
        },
      ],
    }).compile()

    controller = module.get(UploadController)
    service = module.get(UploadService)
  })

  describe('POST /upload', () => {
    it('devuelve la url de la imagen subida', async () => {
      await expect(controller.uploadImage(archivo)).resolves.toEqual({
        url: 'https://cdn/foto.jpg',
      })
    })

    it('antepone una marca de tiempo al nombre original', async () => {
      await controller.uploadImage(archivo)

      const clave = service.uploadImage.mock.calls[0][1] as string
      // Sin la marca, dos personas que suban "foto.jpg" comparten objeto en el
      // bucket y la segunda pisa la primera.
      expect(clave).toMatch(/^\d{13}-foto de perfil\.jpg$/)
    })

    it('dos subidas del mismo archivo no comparten clave', async () => {
      jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(1_700_000_000_000)
        .mockReturnValueOnce(1_700_000_000_001)

      await controller.uploadImage(archivo)
      await controller.uploadImage(archivo)

      const [primera, segunda] = service.uploadImage.mock.calls.map(c => c[1])
      expect(primera).not.toBe(segunda)
    })
  })

  describe('DELETE /upload/:key', () => {
    it('delega la clave al servicio', async () => {
      await expect(controller.deleteFile('qr-1.png')).resolves.toEqual({
        message: 'borrado',
      })
      expect(service.deleteFile).toHaveBeenCalledWith('qr-1.png')
    })
  })

  describe('GET /upload/proxy', () => {
    it('devuelve la imagen con su tipo y cache', async () => {
      const res = respuestaExpress()

      await controller.proxyImage('https://cdn/imagen.png', res)

      expect(res.set).toHaveBeenCalledWith('Content-Type', 'image/png')
      expect(res.set).toHaveBeenCalledWith(
        'Cache-Control',
        'public, max-age=3600'
      )
      expect(res.send).toHaveBeenCalledWith(Buffer.from('imagen'))
    })

    it('responde 404 cuando la descarga falla, sin filtrar el error interno', async () => {
      service.getFileBuffer.mockRejectedValue(
        new Error('ECONNREFUSED 10.0.0.5:6379')
      )
      const res = respuestaExpress()

      await controller.proxyImage('https://cdn/no-existe.png', res)

      expect(res.status).toHaveBeenCalledWith(404)
      // El mensaje interno describe la red de dentro. Devolverlo al cliente es
      // regalar el mapa del despliegue.
      expect(res.send).toHaveBeenCalledWith({ message: 'Imagen no encontrada' })
    })

    it('una url fuera de S3 sale como 404, sin descargar nada', async () => {
      // Era un SSRF: el proxy descargaba cualquier url, incluida la red interna
      // del servidor. El servicio rechaza lo que no es S3 (ver su spec) y aqui
      // ese rechazo se ve como una imagen que no existe.
      service.getFileBuffer.mockRejectedValue(new Error('Origen no permitido'))
      const res = respuestaExpress()

      await controller.proxyImage(
        'http://169.254.169.254/latest/meta-data/',
        res
      )

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.send).toHaveBeenCalledWith({ message: 'Imagen no encontrada' })
    })
  })

  describe('sesion', () => {
    const guardias = (metodo: keyof UploadController) =>
      (Reflect.getMetadata(
        GUARDS_METADATA,
        UploadController.prototype[metodo]
      ) ?? []) as unknown[]

    it('subir y borrar exigen sesion', () => {
      // No la exigian: cualquiera podia llenar el bucket o borrar firmas.
      expect(guardias('uploadImage')).toHaveLength(1)
      expect(guardias('deleteFile')).toHaveLength(1)
    })

    it('el proxy sigue abierto: la app lo pide con fetch, sin token', () => {
      expect(guardias('proxyImage')).toHaveLength(0)
    })
  })
})
