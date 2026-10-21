import { Module } from '@nestjs/common'
import { UserService } from './user.service'
import { MongooseModule } from '@nestjs/mongoose'
import { User, UserSchema } from './schemas/user.schema'
import { UserController } from './user.controller'
import { UploadModule } from '../upload/upload.module'
import { Role, RoleSchema } from '../role/entities/role.entity'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
    ]),
    UploadModule,
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
