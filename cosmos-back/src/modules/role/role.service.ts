import { BadRequestException, ConflictException, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from './entities/role.entity';
import { User } from '../user/schemas/user.schema';
import {
  DEFAULT_MODULES,
  LEGACY_ROLE_MODULES,
  PLATFORM_MODULES,
  isModuleKey,
} from '../../common/access/modules';

@Injectable()
export class RoleService implements OnModuleInit {

  private readonly logger = new Logger(RoleService.name)

  constructor(
    @InjectModel(Role.name) private roleModel: Model<Role>,
    @Optional() @InjectModel(User.name) private userModel?: Model<User>
  ) { }

  /**
   * Da permisos a los perfiles que venian de antes.
   *
   * La plataforma tenia tres roles sin permisos dentro; el acceso lo decidia su
   * nombre. Al arrancar con el modelo nuevo, un perfil sin `permissions` no
   * podria abrir nada y todo el mundo se quedaria fuera a la vez.
   *
   * Solo rellena lo que falta. Un perfil que ya tenga permisos —porque alguien
   * los configuro— no se toca nunca, ni siquiera si estan vacios a proposito:
   * se distingue por que el campo exista, no por que tenga contenido.
   */
  async onModuleInit(): Promise<void> {
    const sinPermisos = await this.roleModel
      .find({ permissions: { $exists: false } })
      .exec()

    for (const role of sinPermisos) {
      const permissions = LEGACY_ROLE_MODULES[role.name] ?? DEFAULT_MODULES
      await this.roleModel.updateOne({ _id: role._id }, { $set: { permissions } }).exec()
      this.logger.log(
        `Perfil "${role.name}" migrado con ${permissions.length} modulos.`
      )
    }
  }

  /** El catalogo de modulos, para construir la pantalla de perfiles. */
  modules() {
    return PLATFORM_MODULES
  }

  /**
   * Comprueba los permisos que llegan.
   *
   * Una clave que no existe se rechaza en vez de guardarse. Guardada no da
   * error en ningun sitio: simplemente el perfil nunca abre esa pantalla, y
   * averiguar por que se convierte en revisar la base de datos a mano.
   */
  private checkPermissions(permissions?: string[]): void {
    const desconocidos = (permissions ?? []).filter(key => !isModuleKey(key))
    if (desconocidos.length > 0) {
      throw new BadRequestException(
        `Estos modulos no existen: ${desconocidos.join(', ')}`
      )
    }
  }

  create(createRoleDto: CreateRoleDto) {
    this.checkPermissions(createRoleDto.permissions)
    return this.roleModel.create({
      ...createRoleDto,
      permissions: createRoleDto.permissions ?? [],
    });
  }

  findAll() {
    return this.roleModel.find().exec();
  }

  findOne(id: string) {
    return this.roleModel.findById(id).exec();
  }

  findByUserId(userId: string) {
    return this.roleModel.findOne({ userId }).exec();
  }

  update(id: string, updateRoleDto: UpdateRoleDto) {
    this.checkPermissions(updateRoleDto.permissions)
    // `new: true` para devolver el perfil ya cambiado: sin esto la pantalla
    // recibia el anterior y parecia que no se habia guardado.
    return this.roleModel.findByIdAndUpdate(id, updateRoleDto, { new: true }).exec();
  }

  /**
   * Borra un perfil que nadie usa.
   *
   * Antes se borraba aunque hubiera usuarios con el: esos usuarios quedaban
   * con un `roleId` que no existe y al entrar el login fallaba con un 500
   * (`user.role.name` sobre `undefined`), sin forma de arreglarlo desde el panel.
   */
  async remove(id: string) {
    if (this.userModel && Types.ObjectId.isValid(id)) {
      const enUso = await this.userModel
        .countDocuments({ roleId: new Types.ObjectId(id) })
        .exec()
      if (enUso > 0) {
        throw new ConflictException(
          `No se puede eliminar el perfil: lo tienen asignado ${enUso} usuario(s). Cámbialos de perfil primero.`
        )
      }
    }
    return this.roleModel.findByIdAndDelete(id).exec();
  }
}
