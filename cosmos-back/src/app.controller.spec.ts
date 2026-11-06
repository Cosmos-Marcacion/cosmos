import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  const connection = { readyState: 1 };
  const env: Record<string, string | undefined> = {};

  beforeEach(async () => {
    connection.readyState = 1;
    delete env.STORAGE_PROVIDER;
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: getConnectionToken(), useValue: connection },
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('responde aunque la base este caida, e informa su estado', () => {
      connection.readyState = 0;
      expect(appController.health()).toMatchObject({ status: 'ok', db: 'down' });
    });

    it('informa donde se guardan los archivos', () => {
      // migrar-archivos.sh lo lee para saber si la API ya escribe en Azure.
      expect(appController.health()).toMatchObject({ storage: 's3' });
      env.STORAGE_PROVIDER = 'azure';
      expect(appController.health()).toMatchObject({ storage: 'azure' });
    });

    it('ready da 503 sin base y ok con ella', () => {
      connection.readyState = 0;
      expect(() => appController.ready()).toThrow(ServiceUnavailableException);
      connection.readyState = 1;
      expect(appController.ready()).toEqual({ status: 'ok', db: 'up' });
    });
  });
});
