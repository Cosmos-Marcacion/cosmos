import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  BadRequestException,
  Delete,
  Get,
  Param,
  Query,
  Res,
  FileTypeValidator,
  UseGuards,
} from '@nestjs/common'
import { UploadService } from './upload.service'
import { FileInterceptor } from '@nestjs/platform-express'
import { Response } from 'express'
import { AuthGuard } from '@nestjs/passport'

/**
 * Subir y borrar exigen sesion: no la exigian, y cualquiera podia llenar el
 * bucket o borrar de el cualquier clave, firmas incluidas. El proxy sigue
 * abierto porque la app lo llama con `fetch`, sin token; lo que acota es el
 * servicio, que solo descarga de S3.
 */
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file')) // 'file' debe coincidir con el nombre del campo en el FormData del frontend
  async uploadImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 }), // 5MB max
          new FileTypeValidator({ fileType: /.(jpg|jpeg|png|gif)$/ }), // Valida tipos de archivo
          // new FileTypeValidator({ fileType: /.(jpg|jpeg|png|gif|pdf|doc|docx|txt|xls|xlsx|ppt|pptx|mp4|mov|avi|mkv|webm)$/ }), // Valida tipos de archivo
        ],
        exceptionFactory: errors => {
          throw new BadRequestException(errors)
        },
      })
    )
    file: Express.Multer.File
  ): Promise<{ url: string }> {
    const fileName = `${Date.now()}-${file.originalname}`
    const fileUrl = await this.uploadService.uploadImage(file, fileName)
    return { url: fileUrl }
  }

  @Delete(':key')
  @UseGuards(AuthGuard('jwt'))
  async deleteFile(@Param('key') key: string) {
    return this.uploadService.deleteFile(key)
  }

  @Get('proxy')
  async proxyImage(@Query('url') url: string, @Res() res: Response) {
    try {
      const buffer = await this.uploadService.getFileBuffer(url)
      res.set('Content-Type', 'image/png')
      res.set('Cache-Control', 'public, max-age=3600')
      res.send(buffer)
    } catch {
      res.status(404).send({ message: 'Imagen no encontrada' })
    }
  }
}
