import { BadRequestException, Injectable, Type } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { User, UserDocument } from './schemas/user.schema'
import { Model, Types } from 'mongoose'
import { GetRoleDocument, Role } from '../role/entities/role.entity'
import { ROLES } from '../auth/enums/roles.enum'
import { UpdateUserDto } from './dto/update-user.dto'
import { IResponse } from 'src/interfaces/response.interface'
import * as bcrypt from 'bcryptjs'
import { UploadService } from '../upload/upload.service'
import { buildSearchFilter } from 'src/common/mongo/search'
import { ORDEN_ALFABETICO } from 'src/common/mongo/collation'

export interface IUser {
  _id?: Types.ObjectId
  email: string
  name: string
  password?: string
  roleId?: Types.ObjectId
  clientId?: Types.ObjectId
  roles?: string[]
  /** Modulos que puede abrir, tomados de su perfil. */
  permissions?: string[]
  role?: GetRoleDocument
}

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Role.name) private roleModel: Model<Role>,
    private readonly uploadService: UploadService
  ) {}

  /**
   * Perfiles que quien opera puede dar al crear o editar un usuario.
   *
   * Sale de aqui y no de `GET /role` porque ese endpoint es de la pantalla de
   * Perfiles: un operador con acceso a Usuarios pero no a Perfiles recibia un
   * 403 y el desplegable de rol quedaba vacio. Solo un Super puede dar el
   * perfil Super.
   */
  async findAssignableRoles(operatorRoles: string[] = []) {
    const filter = operatorRoles.includes(ROLES.SUPER_ADMIN)
      ? {}
      : { name: { $ne: ROLES.SUPER_ADMIN } }
    return this.roleModel
      .find(filter, { name: 1, description: 1 })
      .sort({ name: 1 })
      .collation(ORDEN_ALFABETICO)
      .lean()
      .exec()
  }

  /** Nombre del perfil de un usuario poblado; vacio si no tiene. */
  private roleName(user: UserDocument): string {
    const role: any = user.roleId
    return role?.name ?? ''
  }

  async findById(id: string): Promise<IUser | null> {
    const user = await this.userModel.findById(id).populate('roleId').exec()
    if (!user) {
      return null
    }
    const { roleId, ...userWithoutRoleId } = user.toObject()
    return {
      ...userWithoutRoleId,
      role: roleId as unknown as GetRoleDocument,
    } as IUser
  }

  /**
   * Usuario por correo, sin distinguir mayusculas: `Ana@cosmos.com.pe` y
   * `ana@cosmos.com.pe` son la misma cuenta. Con la comparacion exacta, quien
   * se registro con mayusculas no podia entrar ni recuperar la contrasena si
   * las escribia distinto ("Este correo no esta registrado").
   *
   * Solo acepta texto: el login lee el correo del cuerpo sin DTO, y un objeto
   * como `{ "$ne": null }` llegaba al filtro como operador.
   */
  async findOne(email: string): Promise<IUser | null> {
    if (typeof email !== 'string' || !email.trim()) {
      return null
    }
    const user = await this.userModel
      .findOne({ email: email.trim() })
      .collation({ locale: 'es', strength: 2 })
      .populate('roleId')
      .exec()
    if (!user) {
      return null
    }
    const { roleId, ...userWithoutRoleId } = user.toObject()
    return {
      ...userWithoutRoleId,
      role: roleId as unknown as GetRoleDocument,
    }
  }

  async create(
    userData: IUser,
    image: Express.Multer.File | null = null,
    fileName: string = ''
  ): Promise<IUser | null> {
    try {
      if (userData.password) {
        userData.password = await bcrypt.hash(userData.password, 10)
      }

      const url = image
        ? await this.uploadService.uploadImage(image, fileName)
        : ''

      const createdUser = new this.userModel({
        ...userData,
        image: url,
        roleId: new Types.ObjectId(userData.roleId),
      })
      const savedUser = await createdUser.save()
      const populatedUser = await this.userModel
        .findById(savedUser._id)
        .populate('roleId')
        .exec()
      const { password, ...userWithoutPassword } =
        populatedUser?.toObject() || {}
      return userWithoutPassword as IUser
    } catch (error) {
      if (error.code === 11000) {
        throw new BadRequestException(
          'El correo electrónico ya está registrado'
        )
      }
      throw error
    }
  }

  async findByPagination(
    limit: number,
    page: number,
    search: string = ''
  ): Promise<IResponse<IUser[]>> {
    const query = buildSearchFilter(search, ['name', 'email'])
    // La cuenta va en paralelo y con el mismo filtro que el listado: es lo que
    // el panel divide entre el limite para saber cuantas paginas hay. Devolver
    // aqui `users.length` daba el tamano de la pagina, asi que la cuenta salia
    // siempre 1 y no se podia pasar de la primera.
    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .sort({ name: 1 })
        .collation(ORDEN_ALFABETICO)
        .populate('roleId')
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(query).collation(ORDEN_ALFABETICO).exec(),
    ])
    return {
      data: users.map(user => {
        const { password, ...userWithoutPassword } = user.toObject()
        return {
          ...userWithoutPassword,
          role: this.roleName(user),
        } as unknown as IUser
      }),
      total,
      page,
      limit,
    }
  }

  async findAllExceptSuper(
    limit: number,
    page: number,
    search: string = ''
  ): Promise<IResponse<IUser[]>> {
    const query = buildSearchFilter(search, ['name', 'email'])
    // El filtro se arma una vez y lo comparten listado y cuenta: contar con un
    // filtro distinto al que lista da un total que no cuadra con lo que se ve.
    const filtro = {
      roleId: { $ne: new Types.ObjectId('6862b2dd5b6efa7634310d2f') },
      ...query,
    }
    const [users, total] = await Promise.all([
      this.userModel
        .find(filtro)
        .sort({ name: 1 })
        .collation(ORDEN_ALFABETICO)
        .populate('roleId')
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(filtro).collation(ORDEN_ALFABETICO).exec(),
    ])
    return {
      // El listado pinta la columna `role`; sin mapearla aqui salia vacia para
      // todo el que no fuera Super, que es quien usa este endpoint.
      data: users.map(user => {
        const { password, ...userWithoutPassword } = user.toObject()
        return {
          ...userWithoutPassword,
          role: this.roleName(user),
        } as unknown as IUser
      }),
      total,
      page,
      limit,
    }
  }

  async findAll(): Promise<IUser[]> {
    const users = await this.userModel.find().populate('roleId').exec()
    return users.map(user => {
      const { password, ...userWithoutPassword } = user.toObject()
      return userWithoutPassword as IUser
    })
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    image: Express.Multer.File | null = null,
    fileName: string = ''
  ): Promise<IUser | null> {
    try {
      const updateData: any = { ...updateUserDto }
      // Contrasena en blanco en la edicion es "no cambiarla"; sin esto se
      // guardaba la cadena vacia y el usuario ya no podia entrar.
      if (updateUserDto.password) {
        updateData.password = await bcrypt.hash(updateUserDto.password, 10)
      } else {
        delete updateData.password
      }
      if (updateUserDto.roleId) {
        updateData.roleId = new Types.ObjectId(updateUserDto.roleId)
      }
      if (image) {
        const url = await this.uploadService.uploadImage(image, fileName)
        updateData.image = url
      }

      const updatedUser = await this.userModel
        .findByIdAndUpdate(id, updateData, { new: true })
        .populate('roleId')
        .exec()
      const { password, ...userWithoutPassword } = updatedUser?.toObject() || {}
      return userWithoutPassword as IUser
    } catch (error) {
      if (error.code === 11000) {
        throw new BadRequestException(
          'El correo electrónico ya está registrado'
        )
      }
      throw error
    }
  }

  async remove(id: string): Promise<IUser | null> {
    const deletedUser = await this.userModel.findByIdAndDelete(id).exec()
    return deletedUser?.toObject() as IUser
  }

  async updatePassword(id: string, plainPassword: string): Promise<void> {
    const hashed = await bcrypt.hash(plainPassword, 10)
    await this.userModel.findByIdAndUpdate(id, { password: hashed }).exec()
  }
}
