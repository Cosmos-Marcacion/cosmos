import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { randomInt } from 'crypto'
import { IUser, UserService } from '../user/user.service'
import * as bcrypt from 'bcryptjs'
import { JwtService } from '@nestjs/jwt'
import { RegisterDto } from './dto/register.dto'
import { Model, Types } from 'mongoose'
import { RequestResetDto } from './dto/request-reset.dto'
import { ConfirmResetDto } from './dto/confirm-reset.dto'
import { InjectModel } from '@nestjs/mongoose'
import {
  PasswordReset,
  RESET_CODE_TTL_SECONDS,
} from './entities/password-reset.entity'
import { MailService } from '../mail/mail.service'
/** Segundos minimos entre dos envios de codigo al mismo usuario. */
export const RESET_CODE_COOLDOWN_SECONDS = 60
/** Codigos equivocados admitidos antes de invalidar el vigente. */
export const RESET_CODE_MAX_ATTEMPTS = 5

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    @InjectModel(PasswordReset.name)
    private passwordResetModel: Model<PasswordReset>,
    private mailService: MailService
  ) {}

  async register(registerDto: RegisterDto): Promise<any> {
    const { email, password, name, roleId } = registerDto
    const userExists = await this.userService.findOne(email)
    if (userExists) {
      throw new BadRequestException('El usuario ya existe')
    }
    const hashedPassword = await bcrypt.hash(password, 10)
    await this.userService.create({
      email,
      password: hashedPassword,
      name,
      roleId: new Types.ObjectId(roleId),
    })
    return {
      message: 'Usuario creado correctamente',
    }
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.userService.findOne(email)
    if (
      user &&
      user.password &&
      (await bcrypt.compare(password, user.password))
    ) {
      const { password, ...result } = user
      return result
    }
    return null
  }

  async login(userData: IUser) {
    if (!userData.email || !userData.password) {
      throw new BadRequestException('Credenciales inválidas')
    }
    const user = await this.validateUser(userData.email, userData.password)
    if (!user) {
      throw new BadRequestException('Credenciales inválidas')
    }
    // Los permisos viajan en el token para no consultar el perfil en cada
    // peticion. Cambiar un perfil no afecta a quien ya tiene sesion hasta
    // que vuelve a entrar; es el mismo compromiso que ya habia con `roles`.
    const permissions: string[] = user.role?.permissions ?? []
    const payload = {
      email: user.email,
      userId: user._id.toString(),
      roles: [user.role.name],
      permissions,
    }
    return {
      access_token: this.jwtService.sign(payload),
      ...user,
      permissions,
    }
  }

  /**
   * Envia el codigo de recuperacion.
   *
   * Regla acordada (CKI19): la plataforma es interna, asi que un correo que no
   * esta registrado se dice como tal y el flujo se detiene. Antes respondia lo
   * mismo que para un correo valido y el panel pasaba a "Nueva contraseña"
   * sin que se hubiera enviado nada. La enumeracion de cuentas la frena el
   * limite por IP del controlador.
   *
   * Si el correo no sale, no se deja el codigo guardado ni se responde 500
   * (CKI18): se registra la causa tecnica para soporte y se devuelve un 503
   * con un mensaje que dice que hacer.
   */
  async sendPasswordResetCode(
    dto: RequestResetDto
  ): Promise<{ message: string }> {
    const user = await this.userService.findOne(dto.email.trim())
    if (!user || !user._id) {
      throw new NotFoundException(
        'Este correo no está registrado en Cosmos CheckIn. Revisa que esté bien escrito o pide acceso a un administrador.'
      )
    }
    // El correo tal como esta guardado, no como se tecleo: la busqueda no
    // distingue mayusculas y el codigo debe quedar ligado a la cuenta.
    const email = user.email
    const userId = new Types.ObjectId(user._id)

    const previous = await this.passwordResetModel
      .findOne({ email, userId })
      .sort({ createdAt: -1 })
      .exec()
    const since = previous?.createdAt
      ? (Date.now() - new Date(previous.createdAt).getTime()) / 1000
      : Infinity
    if (since < RESET_CODE_COOLDOWN_SECONDS) {
      const wait = Math.ceil(RESET_CODE_COOLDOWN_SECONDS - since)
      throw new HttpException(
        `Ya te enviamos un código hace un momento. Espera ${wait} segundos antes de pedir otro.`,
        HttpStatus.TOO_MANY_REQUESTS
      )
    }

    // `crypto.randomInt` y no `Math.random`: el codigo es una credencial.
    const code = randomInt(100000, 1000000).toString()

    // Limpiar códigos previos
    await this.passwordResetModel.deleteMany({ email, userId }).exec()

    // Guardar nuevo código con TTL (expireAt y expires definido en el esquema)
    const record = await this.passwordResetModel.create({
      email,
      userId,
      code,
      expireAt: new Date(),
    })

    try {
      await this.mailService.sendPasswordResetCode({ toEmail: email, code })
    } catch (error) {
      const err = error as {
        code?: string
        responseCode?: number
        command?: string
        message?: string
      }
      this.logger.error(
        `No se pudo enviar el código de recuperación a ${email}: ` +
          `code=${err?.code ?? '-'} responseCode=${err?.responseCode ?? '-'} ` +
          `command=${err?.command ?? '-'} ${err?.message ?? ''}`
      )
      await this.passwordResetModel.deleteOne({ _id: record._id }).exec()
      throw new ServiceUnavailableException(
        'No pudimos enviar el correo con el código. Inténtalo de nuevo en unos minutos; si el problema sigue, contacta a soporte.'
      )
    }

    return {
      message:
        'Te enviamos un código de verificación. Revisa tu bandeja de entrada y la carpeta de spam.',
    }
  }

  async resetPassword(dto: ConfirmResetDto): Promise<{ message: string }> {
    const { email, code, newPassword } = dto
    const expired = new Date(Date.now() - RESET_CODE_TTL_SECONDS * 1000)
    const record = await this.passwordResetModel
      .findOne({ email, expireAt: { $gt: expired } })
      .collation({ locale: 'es', strength: 2 })
      .sort({ createdAt: -1 })
      .exec()

    if (!record) {
      throw new BadRequestException(
        'El código expiró o no existe. Pide uno nuevo.'
      )
    }

    if (record.code !== code) {
      const attempts = (record.attempts ?? 0) + 1
      if (attempts >= RESET_CODE_MAX_ATTEMPTS) {
        await this.passwordResetModel
          .deleteMany({ email, userId: record.userId })
          .exec()
        throw new BadRequestException(
          'Demasiados intentos con un código equivocado. Pide un código nuevo.'
        )
      }
      await this.passwordResetModel
        .updateOne({ _id: record._id }, { $set: { attempts } })
        .exec()
      throw new BadRequestException(
        `Código incorrecto. Te quedan ${RESET_CODE_MAX_ATTEMPTS - attempts} intentos.`
      )
    }

    await this.userService.updatePassword(record.userId.toString(), newPassword)

    // Invalidar todos los códigos pendientes para este usuario
    await this.passwordResetModel
      .deleteMany({ email, userId: record.userId })
      .exec()

    return { message: 'Contraseña actualizada correctamente' }
  }
}
