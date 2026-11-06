import { Injectable } from '@nestjs/common'
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

/**
 * Donde se guardan las firmas, fotos y codigos QR.
 *
 * - `s3` (por defecto): bucket de AWS con claves de acceso (`AWS_*`).
 * - `azure`: contenedor de Azure Blob Storage con lectura publica por blob. La
 *   API escribe con su identidad administrada, sin claves:
 *   `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_CONTAINER` y `AZURE_CLIENT_ID`
 *   (la identidad asignada por el usuario). Lo activa
 *   `infra/azure/migrar-archivos.sh`.
 */
export type StorageProvider = 's3' | 'azure'

export function storageProvider(config: ConfigService): StorageProvider {
  return config.get<string>('STORAGE_PROVIDER')?.trim().toLowerCase() === 'azure' ? 'azure' : 's3'
}

/** Si la url apunta, por https, a un host de S3. */
export function isS3Url(url: unknown): boolean {
  return hostDe(url)?.endsWith('.amazonaws.com') ?? false
}

/** Host de una url https, o null si no lo es. */
function hostDe(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' ? hostname.toLowerCase() : null
  } catch {
    return null
  }
}

/** Version de la API REST de Blob. */
const BLOB_API_VERSION = '2021-08-06'

@Injectable()
export class UploadService {
  private s3?: S3Client
  private token?: { value: string; expiresAt: number }

  constructor(private readonly configService: ConfigService) {}

  get provider(): StorageProvider {
    return storageProvider(this.configService)
  }

  /**
   * Clave final del archivo. Con `STORAGE_KEY_PREFIX` (o `AWS_S3_KEY_PREFIX`;
   * QA usa `qa/`) un ambiente comparte almacenamiento con otro sin pisar sus
   * archivos. Se aplica igual al subir y al borrar; si la clave ya lo trae, no
   * se duplica.
   */
  private objectKey(key: string): string {
    const prefix = (
      this.configService.get<string>('STORAGE_KEY_PREFIX') ??
      this.configService.get<string>('AWS_S3_KEY_PREFIX') ??
      ''
    ).trim()
    if (!prefix || key.startsWith(prefix)) return key
    return `${prefix}${key}`
  }

  uploadImageBuffer(file: Buffer, rawKey: string): Promise<string> {
    return this.put(file, rawKey, 'image/png')
  }

  uploadImage(file: Express.Multer.File, rawKey: string): Promise<string> {
    return this.put(file.buffer, rawKey, file.mimetype)
  }

  async deleteFile(rawKey: string) {
    const key = this.objectKey(rawKey)
    try {
      if (this.provider === 'azure') {
        await axios.delete(this.blobUrl(key), {
          headers: { Authorization: `Bearer ${await this.azureToken()}`, 'x-ms-version': BLOB_API_VERSION },
          // Como en S3: borrar lo que no existe no es un error.
          validateStatus: status => (status >= 200 && status < 300) || status === 404,
        })
      } else {
        await this.s3Client().send(
          new DeleteObjectCommand({ Bucket: this.configService.getOrThrow('AWS_S3_BUCKET_NAME'), Key: key })
        )
      }
      return { message: `Archivo ${key} eliminado exitosamente.` }
    } catch (error) {
      throw new Error(`Error al eliminar el archivo de ${this.nombre()}: ${error.message}`)
    }
  }

  /**
   * Descarga una imagen guardada para servirla desde la API.
   *
   * Descargaba cualquier url que le pidieran: el proxy es publico (la app lo
   * llama con `fetch`, sin token) y servia de puente hacia la red interna del
   * servidor, por ejemplo al servicio de metadatos de la nube. Las firmas y los
   * codigos que se sirven por aqui los sube este mismo servicio, asi que solo
   * se admite https contra S3 o contra la cuenta de Azure configurada, y sin
   * seguir redirecciones, que podrian devolver la peticion a la red interna.
   */
  async getFileBuffer(url: string): Promise<Buffer> {
    if (!this.isStoredFileUrl(url)) {
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

  /** Si la url es de un archivo que puede haber subido este servicio. */
  isStoredFileUrl(url: unknown): boolean {
    const host = hostDe(url)
    if (!host) return false
    if (host.endsWith('.amazonaws.com')) return true
    const account = this.configService.get<string>('AZURE_STORAGE_ACCOUNT')?.trim().toLowerCase()
    return Boolean(account) && host === `${account}.blob.core.windows.net`
  }

  private async put(body: Buffer, rawKey: string, contentType: string): Promise<string> {
    const key = this.objectKey(rawKey)
    try {
      if (this.provider === 'azure') {
        const url = this.blobUrl(key)
        await axios.put(url, body, {
          headers: {
            Authorization: `Bearer ${await this.azureToken()}`,
            'x-ms-version': BLOB_API_VERSION,
            'x-ms-blob-type': 'BlockBlob',
            'x-ms-blob-content-type': contentType,
            'Content-Type': contentType,
          },
          maxBodyLength: Infinity,
          maxRedirects: 0,
        })
        return url
      }
      const bucket = this.configService.getOrThrow('AWS_S3_BUCKET_NAME')
      await this.s3Client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }))
      return `https://s3.${this.configService.getOrThrow('AWS_REGION')}.amazonaws.com/${bucket}/${key}`
    } catch (error) {
      throw new Error(`Error al subir el archivo a ${this.nombre()}: ${error.message}`)
    }
  }

  private nombre(): string {
    return this.provider === 'azure' ? 'Azure Blob' : 'S3'
  }

  /** Url publica del blob. Cada tramo de la clave va codificado. */
  private blobUrl(key: string): string {
    const account = this.configService.getOrThrow<string>('AZURE_STORAGE_ACCOUNT').trim()
    const container = this.configService.getOrThrow<string>('AZURE_STORAGE_CONTAINER').trim()
    const path = key.split('/').map(encodeURIComponent).join('/')
    return `https://${account}.blob.core.windows.net/${container}/${path}`
  }

  /** Se crea al primer uso: con Azure no hacen falta las variables de AWS. */
  private s3Client(): S3Client {
    this.s3 ??= new S3Client({
      region: this.configService.getOrThrow('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow('AWS_SECRET_ACCESS_KEY'),
      },
    })
    return this.s3
  }

  /**
   * Token de Azure Storage de la identidad administrada. Container Apps
   * inyecta IDENTITY_ENDPOINT e IDENTITY_HEADER; con identidad asignada por el
   * usuario hay que decir cual (AZURE_CLIENT_ID). Se reutiliza hasta 5 min
   * antes de caducar.
   */
  private async azureToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value
    const endpoint = this.configService.get<string>('IDENTITY_ENDPOINT')
    const header = this.configService.get<string>('IDENTITY_HEADER')
    if (!endpoint || !header) {
      throw new Error('sin identidad administrada (IDENTITY_ENDPOINT/IDENTITY_HEADER)')
    }
    const params: Record<string, string> = { resource: 'https://storage.azure.com/', 'api-version': '2019-08-01' }
    const clientId = this.configService.get<string>('AZURE_CLIENT_ID')
    if (clientId) params.client_id = clientId
    const { data } = await axios.get<{ access_token: string; expires_on: string | number }>(endpoint, {
      params,
      headers: { 'X-IDENTITY-HEADER': header },
      timeout: 10_000,
    })
    this.token = { value: data.access_token, expiresAt: Number(data.expires_on) * 1000 - 5 * 60_000 }
    return this.token.value
  }
}
