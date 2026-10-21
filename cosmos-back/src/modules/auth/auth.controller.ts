import {
  Controller,
  Post,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Get,
  Req,
  Body,
  Ip,
} from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthGuard } from '@nestjs/passport'
import { RegisterDto } from './dto/register.dto'
import { RolesGuard } from './guards/roles.guard'
import { Roles } from './decorators/roles.decorador'
import { ROLES } from './enums/roles.enum'
import { RequestResetDto } from './dto/request-reset.dto'
import { ConfirmResetDto } from './dto/confirm-reset.dto'
import { RateLimiter } from '../../common/http/rate-limiter'
@Controller('auth')
export class AuthController {
  /** 10 solicitudes de codigo por IP cada 15 minutos. */
  private readonly sendCodeLimiter = new RateLimiter(10, 15 * 60 * 1000)
  /** 20 intentos de cambio por IP cada 15 minutos; el limite por codigo va en el servicio. */
  private readonly resetLimiter = new RateLimiter(20, 15 * 60 * 1000)

  constructor(private authService: AuthService) {}

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(ROLES.SUPER_ADMIN)
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return await this.authService.register(registerDto)
  }

  @UseGuards(AuthGuard('local'))
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() req) {
    return this.authService.login(req)
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  getProfile(@Request() req) {
    return req.user
  }

  @Post('password/send-code')
  @HttpCode(HttpStatus.OK)
  async sendPasswordCode(@Body() dto: RequestResetDto, @Ip() ip: string) {
    // Rutas publicas: el limite por IP es lo que frena probar correos para
    // saber cuales estan registrados, ahora que el no registrado se informa.
    this.sendCodeLimiter.hit(`ip:${ip}`)
    return this.authService.sendPasswordResetCode(dto)
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ConfirmResetDto, @Ip() ip: string) {
    this.resetLimiter.hit(`ip:${ip}`)
    return this.authService.resetPassword(dto)
  }
}
