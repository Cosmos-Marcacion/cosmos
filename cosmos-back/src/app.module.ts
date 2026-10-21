import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PortModule } from './modules/port/port.module';
import { PointModule } from './modules/point/point.module';
import { PermissionModule } from './modules/permission/permission.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { RoleModule } from './modules/role/role.module';
import { UserModule } from './modules/user/user.module';
import { EntryModule } from './modules/entry/entry.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { NamedModule } from './modules/named/named.module';
import { HttpModule } from '@nestjs/axios';
import { UploadModule } from './modules/upload/upload.module';
import { TalkModule } from './modules/talk/talk.module';
import { AssistantModule } from './modules/assistant/assistant.module';
import { FingerprintModule } from './modules/fingerprint/fingerprint.module';
import { GeneratorModule } from './generator/generator.module';
import { ModelsModule } from './modules/models/models.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PresitionModule } from './presition/presition.module';
import { TrainerModule } from './trainer/trainer.module';
import { FormatModule } from './modules/format/format.module';
import { VismaModule } from './modules/visma/visma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGO_URI || 'mongodb://localhost:27017/cosmos'),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/static',
      serveStaticOptions: {
        index: false,
        dotfiles: 'deny',
        fallthrough: true,
        setHeaders: (res, path) => {
          if (path.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json');
          }
        },
      },
    }),
    AuthModule,
    RoleModule,
    UserModule,
    PortModule,
    PointModule,
    PermissionModule,
    EntryModule,
    EmployeeModule,
    NamedModule,
    HttpModule,
    UploadModule,
    TalkModule,
    AssistantModule,
    FingerprintModule,
    GeneratorModule,
    ModelsModule,
    PresitionModule,
    TrainerModule,
    FormatModule,
    VismaModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
