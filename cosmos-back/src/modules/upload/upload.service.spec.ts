import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import axios from 'axios'
import { UploadService } from './upload.service'

const send = jest.fn()

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3')
  return {
    ...actual,
    // El cliente se construye en el constructor del servicio, asi que se
    // sustituye la clase entera: no hay forma de inyectarlo desde fuera.
    S3Client: jest.fn().mockImplementation(() => ({ send })),
  }
})

jest.mock('axios')

/** Una url como las que devuelve `uploadImage`. */
const S3_IMAGEN = 'https://s3.us-east-1.amazonaws.com/cosmos-archivos/qr-1.png'

/** Llamadas a `axios.get`, que el automock de jest sustituye. */
const llamadasAGet = () => (axios.get as jest.Mock).mock.calls as unknown[][]

describe('UploadService', () => {
  let service: UploadService
  const config: Record<string, string> = {
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'clave',
    AWS_SECRET_ACCESS_KEY: 'secreto',
    AWS_S3_BUCKET_NAME: 'cosmos-archivos',
  }

  beforeEach(async () => {
    send.mockResolvedValue({})
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((clave: string) => {
              if (!(clave in config)) throw new Error(`falta ${clave}`)
              return config[clave]
            }),
          },
        },
      ],
    }).compile()

    service = module.get(UploadService)
  })

  describe('uploadImageBuffer', () => {
    it('sube al bucket configurado con la clave pedida', async () => {
      await service.uploadImageBuffer(Buffer.from('png'), 'qr-1.png')

      const comando = send.mock.calls[0][0] as PutObjectCommand
      expect(comando.input).toMatchObject({
        Bucket: 'cosmos-archivos',
        Key: 'qr-1.png',
        ContentType: 'image/png',
      })
    })

    it('devuelve la url publica del objeto', async () => {
      await expect(
        service.uploadImageBuffer(Buffer.from('png'), 'qr-1.png')
      ).resolves.toBe(
        'https://s3.us-east-1.amazonaws.com/cosmos-archivos/qr-1.png'
      )
    })

    it('convierte el fallo de S3 en un error con contexto', async () => {
      send.mockRejectedValue(new Error('AccessDenied'))

      // Sin el envoltorio, quien lea el log ve "AccessDenied" a secas y no
      // sabe que operacion lo produjo.
      await expect(
        service.uploadImageBuffer(Buffer.from('x'), 'k.png')
      ).rejects.toThrow(/Error al subir el archivo a S3: AccessDenied/)
    })
  })

  describe('uploadImage', () => {
    const archivo = {
      buffer: Buffer.from('jpeg'),
      mimetype: 'image/jpeg',
      originalname: 'foto.jpg',
    } as Express.Multer.File

    it('respeta el tipo de contenido que trae el archivo', async () => {
      await service.uploadImage(archivo, 'fotos/foto.jpg')

      const comando = send.mock.calls[0][0] as PutObjectCommand
      // Forzar `image/png` aqui haria que el navegador se descargara los JPEG
      // en vez de mostrarlos.
      expect(comando.input.ContentType).toBe('image/jpeg')
      expect(comando.input.Body).toBe(archivo.buffer)
    })

    it('propaga el fallo de S3 con contexto', async () => {
      send.mockRejectedValue(new Error('EntityTooLarge'))

      await expect(service.uploadImage(archivo, 'k.jpg')).rejects.toThrow(
        /Error al subir el archivo a S3/
      )
    })
  })

  describe('deleteFile', () => {
    it('borra la clave del bucket configurado', async () => {
      await service.deleteFile('qr-1.png')

      const comando = send.mock.calls[0][0] as DeleteObjectCommand
      expect(comando.input).toMatchObject({
        Bucket: 'cosmos-archivos',
        Key: 'qr-1.png',
      })
    })

    it('confirma el borrado nombrando la clave', async () => {
      await expect(service.deleteFile('qr-1.png')).resolves.toEqual({
        message: 'Archivo qr-1.png eliminado exitosamente.',
      })
    })

    it('propaga el fallo con contexto', async () => {
      send.mockRejectedValue(new Error('NoSuchKey'))

      await expect(service.deleteFile('qr-1.png')).rejects.toThrow(
        /Error al eliminar el archivo de S3/
      )
    })
  })

  describe('getFileBuffer', () => {
    it('descarga la url como binario y no como texto', async () => {
      ;(axios.get as jest.Mock).mockResolvedValue({
        data: Buffer.from('imagen'),
      })

      const buffer = await service.getFileBuffer(S3_IMAGEN)

      // Sin `arraybuffer`, axios interpreta el cuerpo como UTF-8 y el PNG
      // llega corrupto sin que nada falle.
      expect(axios.get).toHaveBeenCalledWith(
        S3_IMAGEN,
        expect.objectContaining({ responseType: 'arraybuffer' })
      )
      expect(Buffer.isBuffer(buffer)).toBe(true)
      expect(buffer.toString()).toBe('imagen')
    })

    it('no sigue redirecciones', async () => {
      ;(axios.get as jest.Mock).mockResolvedValue({
        data: Buffer.from('imagen'),
      })

      await service.getFileBuffer(S3_IMAGEN)

      // Una redireccion podria devolver la peticion a la red interna.
      expect(llamadasAGet()[0]).toEqual([
        S3_IMAGEN,
        expect.objectContaining({ maxRedirects: 0 }),
      ])
    })

    it('propaga el fallo de red', async () => {
      ;(axios.get as jest.Mock).mockRejectedValue(new Error('ENOTFOUND'))

      await expect(service.getFileBuffer(S3_IMAGEN)).rejects.toThrow(
        'ENOTFOUND'
      )
    })

    it.each([
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost:3000/api/v1/user',
      'https://10.0.0.5/imagen.png',
      'http://s3.us-east-1.amazonaws.com/cosmos-archivos/qr-1.png',
      'https://amazonaws.com.evil.example/qr-1.png',
      'file:///etc/passwd',
      'no es una url',
    ])('rechaza %s sin llegar a pedirla', async url => {
      // Era un SSRF: el proxy publico descargaba cualquier url, incluida la
      // red interna del servidor.
      await expect(service.getFileBuffer(url)).rejects.toThrow(
        'Origen no permitido'
      )
      expect(llamadasAGet()).toHaveLength(0)
    })
  })
})
