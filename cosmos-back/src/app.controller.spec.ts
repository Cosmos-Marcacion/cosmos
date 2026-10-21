import { ServiceUnavailableException } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  const connection = { readyState: 1 };

  beforeEach(async () => {
    connection.readyState = 1;
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: getConnectionToken(), useValue: connection }],
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

    it('ready da 503 sin base y ok con ella', () => {
      connection.readyState = 0;
      expect(() => appController.ready()).toThrow(ServiceUnavailableException);
      connection.readyState = 1;
      expect(appController.ready()).toEqual({ status: 'ok', db: 'up' });
    });
  });
});
