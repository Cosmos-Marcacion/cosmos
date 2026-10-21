import { ModuleGuard } from '../../common/access/module.guard'
import { RequireModule } from '../../common/access/require-module.decorator'
import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Post,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  Req,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  NotFoundException,
} from '@nestjs/common'
import { IUser, UserService } from './user.service'
import { isValidObjectId } from 'mongoose'
import { UpdateUserDto } from './dto/update-user.dto'
import { CreateUserDto } from './dto/create-user.dto'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../auth/guards/roles.guard'
import { ROLES } from '../auth/enums/roles.enum'
import { Roles } from '../auth/decorators/roles.decorador'
import { FileInterceptor } from '@nestjs/platform-express'
import { ParseObjectIdPipe, parseIntParam } from '../../common/mongo/params'

@ApiTags('User')
@RequireModule('usuarios')
@Controller('user')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, ModuleGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @Get()
  findAll() {
    return this.userService.findAll()
  }

  // @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  // @Post()
  // create(@Body() createUserDto: CreateUserDto) {
  //   return this.userService.create(createUserDto as any)
  // }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @Post()
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 }), // 5MB max
          new FileTypeValidator({ fileType: /.(jpg|jpeg|png|gif)$/ }),
        ],
        fileIsRequired: false,
        exceptionFactory: errors => {
          throw new BadRequestException(errors)
        },
      })
    )
    image: Express.Multer.File,
    // Tipado de verdad: con `any` el ValidationPipe no validaba nada y la API
    // aceptaba nombres de un caracter y contrasenas de un digito.
    @Body() createUserDto: CreateUserDto
  ) {
    const fileName = `${Date.now()}-${image?.originalname}`
    return this.userService.create(createUserDto as any, image, fileName)
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @Get('assignable-roles')
  findAssignableRoles(@Req() req: any) {
    return this.userService.findAssignableRoles(req.user?.roles ?? [])
  }

  @Roles(ROLES.ADMIN)
  @Get('except-super/:limit/:page')
  findAllExceptSuper(
    @Param('limit', parseIntParam('El límite')) limit: number,
    @Param('page', parseIntParam('La página')) page: number,
    @Query('search') search: string
  ) {
    return this.userService.findAllExceptSuper(limit, page, search)
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @Get('by-id/:id')
  findById(@Param('id') id: string) {
    // Devolvia el documento entero, hash de la contrasena incluido. Es la
    // misma ficha que `GET /user/:id`, asi que sale igual y sin el hash.
    return this.findOne(id)
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @Get(':limit/:page')
  findByPagination(
    @Param('limit', parseIntParam('El límite')) limit: number,
    @Param('page', parseIntParam('La página')) page: number,
    @Query('search') search: string
  ) {
    return this.userService.findByPagination(limit, page, search)
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    // Buscaba con `findOne`, que filtra por correo: con un id nunca encontraba
    // a nadie. La ficha sale sin el hash de la contrasena.
    if (!isValidObjectId(id)) {
      throw new NotFoundException('Usuario no encontrado')
    }
    const user = await this.userService.findById(id)
    if (!user) {
      throw new NotFoundException('Usuario no encontrado')
    }
    const { password: _password, ...rest }: IUser = user
    return rest
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @Patch(':id')
  @UseInterceptors(FileInterceptor('image'))
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 }), // 5MB max
          new FileTypeValidator({ fileType: /.(jpg|jpeg|png|gif)$/ }),
        ],
        fileIsRequired: false,
        exceptionFactory: errors => {
          throw new BadRequestException(errors)
        },
      })
    )
    image: Express.Multer.File,
    @Body() updateUserDto: UpdateUserDto
  ) {
    const fileName = image ? `${Date.now()}-${image.originalname}` : ''
    const updated = await this.userService.update(
      id,
      updateUserDto,
      image,
      fileName
    )
    // Con un id que no existe el servicio devuelve un objeto vacio, y la
    // pantalla lo tomaba por un guardado correcto.
    if (!updated || Object.keys(updated).length === 0) {
      throw new NotFoundException('Usuario no encontrado')
    }
    return updated
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @Delete(':id')
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    // El borrado devolvia el documento eliminado con el hash de la contrasena.
    const deleted = await this.userService.remove(id)
    if (!deleted) {
      throw new NotFoundException('Usuario no encontrado')
    }
    const { password: _password, ...rest }: IUser = deleted
    return rest
  }
}
