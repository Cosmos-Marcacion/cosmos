import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  Delete,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  BadRequestException,
  UseGuards,
  Req,
} from '@nestjs/common'
import { EmployeeService } from './employee.service'
import { EmployeeDirectoryService } from './employee-directory.service'
import { EmployeeSyncRunService } from './employee-sync-run.service'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { Roles } from '../auth/decorators/roles.decorador'
import { ROLES } from '../auth/enums/roles.enum'
import { FileInterceptor } from '@nestjs/platform-express'
import { SyncEmployeesResponseDto } from './dto/sync-employees-response.dto'
import { CreateEmployeeDto } from './dto/create-employee.dto'
import { SaveSignatureDto, UpdateEmployeeDto } from './dto/update-employee.dto'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../auth/guards/roles.guard'
import { UpdateEmployeeFingerprintDto } from '../fingerprint/dto/update-employee-fingerprint.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Public } from '../auth/decorators/public.decorator'

@ApiTags('Employee')
@Controller('employee')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeeController {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly employeeDirectoryService: EmployeeDirectoryService,
    private readonly syncRuns: EmployeeSyncRunService
  ) {}

  @Public()
  @Get('loggued')
  async getLogguedIn() {
    return []
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
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
    @Body() createEmployeeDto: CreateEmployeeDto
  ) {
    const fileName = `${Date.now()}-${image?.originalname}`
    return this.employeeService.create(createEmployeeDto, image, fileName)
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @Post('signature')
  @UseInterceptors(FileInterceptor('signature'))
  async saveSignature(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 }), // 5MB max
          new FileTypeValidator({ fileType: /.(jpg|jpeg|png|gif)$/ }), // Valida tipos de archivo
          // new FileTypeValidator({ fileType: /.(jpg|jpeg|png|gif|pdf|doc|docx|txt|xls|xlsx|ppt|pptx|mp4|mov|avi|mkv|webm)$/ }), // Valida tipos de archivo
        ],
        exceptionFactory: errors => {
          throw new BadRequestException(errors)
        },
      })
    )
    signature: Express.Multer.File,
    @Body() createEmployeeDto: SaveSignatureDto
  ) {
    const fileName = `${Date.now()}-${signature.originalname}`
    return this.employeeService.saveSignature(
      createEmployeeDto,
      signature,
      fileName
    )
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @Get('search/:document')
  searchEmployee(@Param('document') document: string) {
    return this.employeeService.searchEmployee(document)
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @Get()
  findAll() {
    return this.employeeService.findAll()
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @Get('list-with-status')
  @ApiOperation({ summary: 'Obtener empleados con estado de registro facial' })
  @ApiResponse({
    status: 200,
    description: 'Lista con firstName, lastName y status',
  })
  async listWithStatus() {
    return this.employeeService.getEmployeesWithStatus()
  }

  /**
   * Buscador del registro de empleados: maestro local (Cosmos) y maestro de
   * Visma fusionados por documento.
   *
   * Va antes de `@Get(':id')` a proposito: Nest resuelve las rutas en orden de
   * declaracion y `:id` se tragaria `directory`.
   */
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @Get('directory')
  @ApiOperation({
    summary: 'Personal de Cosmos y de Visma fusionado por documento',
  })
  @ApiResponse({
    status: 200,
    description:
      'Sin `search` devuelve solo el maestro local; Visma se suma a partir de ' +
      '`minLength` caracteres, que es lo minimo que acepta su buscador.',
  })
  async directory(
    @Query('search') search?: string,
    @Query('limit') limit?: string
  ) {
    const parsedLimit = Number(limit)
    return this.employeeDirectoryService.search(
      search ?? '',
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 500)
        : 100
    )
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  /**
   * Historial de sincronizaciones, la mas reciente primero. Va antes de
   * `@Get(':id')` por la misma razon que `directory`.
   */
  @Get('sync-runs')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Ultimas ejecuciones de la sincronizacion de empleados',
  })
  listSyncRuns(@Query('limit') limit?: string) {
    return this.syncRuns.list(Number(limit) || 20)
  }

  /**
   * Va antes de `@Get(':id')`: declarada despues, `GET /employee/models`
   * entraba en `findOne('models')`.
   */
  @Get('models')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @ApiOperation({
    summary: 'Obtener información de archivos JSON de modelos',
    description:
      'Lista todos los archivos JSON disponibles en la carpeta models con su información',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de archivos JSON obtenida exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'La carpeta models no existe',
  })
  async getModelsInfo() {
    return this.employeeService.getModelsInfo()
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.employeeService.findOne(id)
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @Get('by-id-bs/:id')
  getByIdBS(@Param('id') id: number) {
    return this.employeeService.getByIdBS(id)
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @Patch(':id')
  @UseInterceptors(FileInterceptor('image'))
  async update(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 }), // 5MB máximo
          new FileTypeValidator({ fileType: /^(image\/)(jpeg|png|gif)$/ }), // Solo imágenes permitidas
        ],
        fileIsRequired: false,
        exceptionFactory: errors => {
          throw new BadRequestException(
            'El archivo debe ser una imagen válida y no superar los 5MB.'
          )
        },
      })
    )
    image: Express.Multer.File,
    @Body() updateEmployeeDto: UpdateEmployeeDto
  ) {
    const fileName = `${Date.now()}-${image?.originalname}`
    return this.employeeService.update(id, updateEmployeeDto, image, fileName)
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @Patch(':id/register-face')
  registerFace(@Param('id') id: string, @Body() descriptor: number[]) {
    return this.employeeService.registerFace(id, descriptor)
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  // Con la ruta `:employeeId` a secas nunca se llegaba aqui: `@Patch(':id')`,
  // declarado antes, recoge la misma URL.
  @Patch(':employeeId/fingerprint-status')
  @ApiOperation({
    summary: 'Actualizar estado de huella dactilar del empleado',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado de huella actualizado exitosamente',
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'Empleado no encontrado' })
  async updateFingerprintStatus(
    @Param('employeeId') employeeId: string,
    @Body() updateEmployeeFingerprintDto: UpdateEmployeeFingerprintDto
  ) {
    return this.employeeService.updateFingerprintStatus(
      employeeId,
      updateEmployeeFingerprintDto.issetFinger
    )
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.employeeService.remove(id)
  }

  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @Post('check-in')
  checkIn(@Body() descriptor: number[]) {
    return this.employeeService.checkIn(descriptor)
  }

  @Post('sync-from-named')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Sincronizar empleados desde el servicio NamedService',
    description:
      'Obtiene la lista de usuarios activos del servicio externo y los sincroniza como empleados en la base de datos local',
  })
  @ApiResponse({
    status: 200,
    description: 'Sincronización completada exitosamente',
    type: SyncEmployeesResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Error en la solicitud o respuesta inválida del servicio externo',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado - Se requieren permisos de administrador',
  })
  async syncEmployeesFromNamed(@Req() req?: any) {
    return this.syncRuns.record(req?.user?.email ?? '', () =>
      this.employeeService.syncEmployeesFromNamedService()
    )
  }

  @Get('models/:fileName')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @ApiOperation({
    summary: 'Obtener contenido de un archivo JSON específico',
    description:
      'Retorna el contenido completo de un archivo JSON específico de la carpeta models',
  })
  @ApiResponse({
    status: 200,
    description: 'Contenido del archivo JSON obtenido exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'El archivo no es un JSON válido o error en la solicitud',
  })
  @ApiResponse({
    status: 404,
    description: 'El archivo especificado no existe',
  })
  async getModelFile(@Param('fileName') fileName: string) {
    return this.employeeService.getModelFile(fileName)
  }
}
