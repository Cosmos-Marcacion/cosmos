import { Controller, Get, Param, Res, NotFoundException, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { basename, join } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorador';
import { ROLES } from '../auth/enums/roles.enum';

/**
 * Listado de los modelos de reconocimiento facial. Era publico y unia el
 * parametro a la ruta sin mirarlo: con `..%2F..` cualquiera, sin sesion,
 * listaba carpetas del servidor. Ningun cliente lo usa (la app lleva los
 * modelos dentro), asi que queda para administracion.
 */
@Controller('models')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ModelsController {

    // `RolesGuard` solo lee los roles del metodo, no de la clase.
    @Get()
    @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
    async getModelsList(@Res() res: Response) {
        try {
            const modelsPath = join(process.cwd(), 'public', 'models');

            if (!existsSync(modelsPath)) {
                throw new NotFoundException('Directorio de modelos no encontrado');
            }

            const files = readdirSync(modelsPath);
            const modelsInfo = files.map(file => {
                const filePath = join(modelsPath, file);
                const stats = statSync(filePath);

                return {
                    name: file,
                    size: this.formatFileSize(stats.size),
                    lastModified: stats.mtime.toISOString(),
                    isDirectory: stats.isDirectory(),
                    path: `/static/models/${file}`
                };
            });

            return res.json({
                success: true,
                totalFiles: files.length,
                files: modelsInfo
            });

        } catch (error) {
            return res.status(404).json({
                success: false,
                message: error.message,
                error: 'Not Found'
            });
        }
    }

    @Get(':filename')
    @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
    async getModelFile(@Param('filename') filename: string, @Res() res: Response) {
        try {
            const modelsPath = join(process.cwd(), 'public', 'models');
            if (filename !== basename(filename) || filename.startsWith('.')) {
                throw new NotFoundException(`Archivo ${filename} no encontrado`);
            }
            const filePath = join(modelsPath, filename);

            if (!existsSync(filePath)) {
                throw new NotFoundException(`Archivo ${filename} no encontrado`);
            }

            const stats = statSync(filePath);

            if (stats.isDirectory()) {
                // Si es un directorio, listar su contenido
                const dirFiles = readdirSync(filePath);
                const dirInfo = dirFiles.map(file => {
                    const subFilePath = join(filePath, file);
                    const subStats = statSync(subFilePath);

                    return {
                        name: file,
                        size: this.formatFileSize(subStats.size),
                        lastModified: subStats.mtime.toISOString(),
                        isDirectory: subStats.isDirectory(),
                        path: `/static/models/${filename}/${file}`
                    };
                });

                return res.json({
                    success: true,
                    directory: filename,
                    totalFiles: dirFiles.length,
                    files: dirInfo
                });
            }

            // Si es un archivo, devolver información del archivo
            return res.json({
                success: true,
                filename,
                size: this.formatFileSize(stats.size),
                lastModified: stats.mtime.toISOString(),
                path: `/static/models/${filename}`,
                staticUrl: `/static/models/${filename}`
            });

        } catch (error) {
            return res.status(404).json({
                success: false,
                message: error.message,
                error: 'Not Found'
            });
        }
    }

    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}
