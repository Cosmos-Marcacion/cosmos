import { Injectable } from '@nestjs/common'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

/** Si la url apunta, por https, a un host de S3. */
export function isS3Url(url: unknown): boolean {
  if (typeof url !== 'string') {
    return false
  }
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && hostname.endsWith('.amazonaws.com')
  } catch {
    return false
  }
}

@Injectable()
export class UploadService {
  private readonly s3Client: S3Client

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.getOrThrow('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow('AWS_SECRET_ACCESS_KEY'),
      },
    })
  }

  /**
   * Clave final en el bucket. Con `AWS_S3_KEY_PREFIX` (QA usa `qa/`) un
   * ambiente comparte bucket con otro sin pisar sus archivos. Se aplica igual
   * al subir y al borrar; si la clave ya lo trae, no se duplica.
   */
  private objectKey(key: string): string {
    const prefix = this.configService.get<string>('AWS_S3_KEY_PREFIX')?.trim() ?? ''
    if (!prefix || key.startsWith(prefix)) return key
    return `${prefix}${key}`
  }

  async uploadImageBuffer(file: Buffer, rawKey: string) {
    const bucketName = this.configService.getOrThrow('AWS_S3_BUCKET_NAME')
    const key = this.objectKey(rawKey)

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: file,
      ContentType: 'image/png',
    })

    try {
      await this.s3Client.send(command)
      return `https://s3.${this.configService.getOrThrow('AWS_REGION')}.amazonaws.com/${bucketName}/${key}`
    } catch (error) {
      throw new Error(`Error al subir el archivo a S3: ${error.message}`)
    }
  }

  async uploadImage(file: Express.Multer.File, rawKey: string) {
    const bucketName = this.configService.getOrThrow('AWS_S3_BUCKET_NAME')
    const key = this.objectKey(rawKey)

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })

    try {
      await this.s3Client.send(command)
      return `https://s3.${this.configService.getOrThrow('AWS_REGION')}.amazonaws.com/${bucketName}/${key}`
    } catch (error) {
      throw new Error(`Error al subir el archivo a S3: ${error.message}`)
    }
  }

  /**
   * Descarga una imagen guardada en S3 para servirla desde la API.
   *
   * Descargaba cualquier url que le pidieran: el proxy es publico (la app lo
   * llama con `fetch`, sin token) y servia de puente hacia la red interna del
   * servidor, por ejemplo al servicio de metadatos de la nube. Las firmas y los
   * codigos que se sirven por aqui los sube este mismo servicio a S3, asi que
   * solo se admite https contra un host de S3 y sin seguir redirecciones, que
   * podrian devolver la peticion a la red interna.
   */
  async getFileBuffer(url: string): Promise<Buffer> {
    if (!isS3Url(url)) {
      throw new Error('Origen no permitido')
    }
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      maxRedirects: 0,
      timeout: 10_000,
      maxContentLength: 10 * 1024 * 1024,
    })
    return Buffer.from(response.data)
  }

  async deleteFile(rawKey: string) {
    const bucketName = this.configService.getOrThrow('AWS_S3_BUCKET_NAME')
    const key = this.objectKey(rawKey)

    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    })

    try {
      await this.s3Client.send(command)
      return { message: `Archivo ${key} eliminado exitosamente.` }
    } catch (error) {
      throw new Error(`Error al eliminar el archivo de S3: ${error.message}`)
    }
  }
}
