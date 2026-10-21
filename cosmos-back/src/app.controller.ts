import { Controller, Get, Res, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';
import { AppService } from './app.service';
import { Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectConnection() private readonly db: Connection,
  ) { }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Sonda de vida: responde mientras el proceso este en pie, aunque la base no.
   * Si fallara con la base caida, Azure reiniciaria todas las replicas por un
   * corte de red que no se arregla reiniciando.
   */
  @Get('health')
  health() {
    return { status: 'ok', db: this.dbState(), timestamp: new Date().toISOString() };
  }

  /**
   * Sonda de disponibilidad: 503 sin base. El despliegue la consulta antes de
   * pasarle trafico a una revision nueva, y Azure deja de enviarle peticiones a
   * una replica que pierde la conexion.
   */
  @Get('health/ready')
  ready() {
    const db = this.dbState();
    if (db !== 'up') {
      throw new ServiceUnavailableException({ status: 'error', db });
    }
    return { status: 'ok', db };
  }

  private dbState(): 'up' | 'down' {
    return this.db.readyState === ConnectionStates.connected ? 'up' : 'down';
  }

  @Get('test-static')
  testStatic(@Res() res: Response) {
    const modelsPath = join(process.cwd(), 'public', 'models');
    const manifestPath = join(modelsPath, 'ssd_mobilenetv1_model-weights_manifest.json');

    if (existsSync(manifestPath)) {
      return res.json({
        success: true,
        message: 'Archivo estático encontrado correctamente',
        path: manifestPath,
        exists: true
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'Archivo estático no encontrado',
        path: manifestPath,
        exists: false
      });
    }
  }
}
