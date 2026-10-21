import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common'
import { UpdateEmployeeDto } from './dto/update-employee.dto'
import { InjectModel } from '@nestjs/mongoose'
import { isValidObjectId, Model } from 'mongoose'
import { Employee } from './entities/employee.entity'
import * as faceapi from 'face-api.js'
import { NamedService } from '../named/named.service'
import { UploadService } from '../upload/upload.service'
import { composeLastName } from '../../common/names/compose-last-name'
import * as fs from 'fs'
import * as path from 'path'
import {
  FaceCandidate,
  findConflictingFace,
  isFaceDescriptor,
  matchFace,
} from './face-matching'

/**
 * Campos que necesitan el dashboard, el cruce con nombradas y el buscador de
 * personal de la app móvil. Deja fuera `faceDescriptor`, `image` y
 * `currentChallenge`, que ninguno de ellos consume.
 */
const EMPLOYEE_LEAN_FIELDS =
  'id vismaId fileNumber firstName lastName document signature status issetFinger'

@Injectable()
export class EmployeeService {
  private namedService: NamedService

  constructor(
    @InjectModel(Employee.name) private employeeModel: Model<Employee>,
    private uploadService: UploadService,
    @Inject(forwardRef(() => NamedService)) namedService: any
  ) {
    this.namedService = namedService
    this.loadModels()
  }

  async create(
    createEmployeeDto: any,
    file: Express.Multer.File,
    fileName: string
  ) {
    const url = file ? await this.uploadService.uploadImage(file, fileName) : ''
    const employee = await this.employeeModel
      .findOne({ document: createEmployeeDto.document })
      .exec()
    if (employee) {
      throw new BadRequestException('El empleado ya existe')
    }
    const employeeData = this.withStaffId({
      ...createEmployeeDto,
      image: url,
    })
    return this.employeeModel.create(employeeData)
  }

  async saveSignature(
    createEmployeeDto: any,
    signature: Express.Multer.File,
    fileName: string
  ) {
    const url = await this.uploadService.uploadImage(signature, fileName)
    return this.employeeModel
      .findByIdAndUpdate(
        createEmployeeDto.employeeId,
        { signature: url },
        { new: true }
      )
      .exec()
  }

  /**
   * `staff_id` normalizado, o nada.
   *
   * El formulario del registro manda `id` siempre, pero desde que el buscador
   * tambien trae gente de Visma puede llegar vacio: esa persona no esta en
   * Cosmos y no tiene `staff_id`. Antes `Number('')` guardaba un `NaN` en la
   * ficha, que despues rompia el cruce con las nombradas.
   */
  private withStaffId<T extends object>(payload: T): T {
    const data = payload as Record<string, any>
    const value = data.id
    const parsed = Number(value)
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      !Number.isFinite(parsed) ||
      parsed === 0
    ) {
      delete data.id
      return payload
    }
    data.id = parsed
    return payload
  }

  findByDocument(document: string) {
    return this.employeeModel.findOne({ document: document }).exec()
  }

  searchEmployee(document: string) {
    return this.employeeModel.findOne({ document: document }).exec()
  }

  getByIdBS(id: number) {
    return this.employeeModel.findOne({ id: id }).exec()
  }

  async getEmployeesByIds(ids: number[]) {
    return this.employeeModel
      .find({ id: { $in: ids } })
      .select(EMPLOYEE_LEAN_FIELDS)
      .exec()
  }

  async findAll() {
    return this.employeeModel.find().exec()
  }

  /**
   * Firma registrada de cada documento pedido, indexada por documento.
   *
   * El cruce va por DNI y no por `id` a proposito: `id` es el `staff_id` del
   * sistema externo, y los responsables de una nombrada salen del maestro de
   * personal, que no lo trae. El documento es lo unico que comparten los dos
   * origenes, y ademas es el unico campo con indice unico de la coleccion.
   *
   * Una sola consulta para toda la nombrada: el formato pide la firma de una
   * veintena de personas y una consulta por cabeza multiplicaria por veinte el
   * coste de emitirlo.
   */
  async findSignaturesByDocuments(
    documents: string[]
  ): Promise<Map<string, string>> {
    const wanted = [
      ...new Set(documents.map(d => (d ?? '').trim()).filter(Boolean)),
    ]
    if (wanted.length === 0) {
      return new Map()
    }
    const rows = await this.employeeModel
      .find({ document: { $in: wanted } })
      .select('document signature')
      .exec()

    const byDocument = new Map<string, string>()
    for (const row of rows) {
      if (row.document && row.signature) {
        byDocument.set(row.document.trim(), row.signature)
      }
    }
    return byDocument
  }

  /**
   * Empleados sin el descriptor facial ni el resto de campos pesados.
   *
   * `faceDescriptor` son 128 flotantes, alrededor del 85% del peso de cada
   * documento, y ninguno de los consumidores de esta lista (dashboard,
   * nombradas, buscador de la app) lo utiliza.
   */
  async findAllLean() {
    return this.employeeModel.find().select(EMPLOYEE_LEAN_FIELDS).exec()
  }

  async findOne(id: string) {
    // Un id mal formado (un DNI leido del codigo de barras, por ejemplo) hacia
    // fallar el `findById` con un CastError y la API respondia 500. No existe:
    // quien llama ya trata el `null` como "empleado no encontrado".
    if (!isValidObjectId(id)) {
      return null
    }
    return this.employeeModel.findById(id).exec()
  }

  async update(
    id: string,
    updateEmployeeDto: UpdateEmployeeDto,
    image: Express.Multer.File,
    fileName: string
  ) {
    const employeeData: any = this.withStaffId({ ...updateEmployeeDto } as any)
    if (!updateEmployeeDto.image && image) {
      const url = await this.uploadService.uploadImage(image, fileName)
      employeeData.image = url
    }
    return this.employeeModel
      .findByIdAndUpdate(id, employeeData, { new: true })
      .exec()
  }

  /**
   * Guarda el rostro de una ficha, o lo borra con una lista vacia.
   *
   * Rechaza un rostro que el reconocimiento ya atribuiria a otra ficha. Sin
   * esta comprobacion se llego a tener el mismo rostro en 14 fichas, y la
   * marcacion de una de esas personas mostraba los datos de otra.
   */
  async registerFace(id: string, descriptor: number[]) {
    const employee = await this.employeeModel.findById(id).exec()
    if (!employee) {
      throw new NotFoundException('No se encontró el empleado')
    }
    const borrar = Array.isArray(descriptor) && descriptor.length === 0
    if (!borrar) {
      if (!isFaceDescriptor(descriptor)) {
        throw new BadRequestException('El descriptor facial proporcionado es inválido.')
      }
      const otros = await this.faceCandidates()
      const conflicto = findConflictingFace(descriptor, otros.candidates, String(employee._id))
      if (conflicto) {
        const ajeno = otros.employees.find(e => String(e._id) === conflicto.id)
        const nombre = ajeno
          ? `${ajeno.firstName ?? ''} ${ajeno.lastName ?? ''}`.replace(/\s+/g, ' ').trim()
          : 'otro trabajador'
        throw new ConflictException(
          `Este rostro se parece demasiado al registrado para ${nombre}. ` +
            'Comprueba que delante de la cámara está la persona correcta y vuelve a capturarlo.'
        )
      }
    }
    return this.employeeModel
      .findByIdAndUpdate(id, { faceDescriptor: descriptor }, { new: true })
      .exec()
  }

  async remove(id: string) {
    return this.employeeModel.findByIdAndDelete(id).exec()
  }

  private async loadModels() {
    const modelsPath = path.join(process.cwd(), 'public', 'models')
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath)
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath)
    await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath)
  }

  /** Las fichas con un rostro valido, listas para comparar. */
  private async faceCandidates() {
    const employees = (
      await this.employeeModel.find({ faceDescriptor: { $ne: null } }).exec()
    ).filter(employee => isFaceDescriptor(employee.faceDescriptor))
    return {
      employees,
      candidates: employees.map((employee): FaceCandidate => ({
        // La etiqueta es el id de la ficha y no el nombre: con el nombre
        // completo, dos homonimos se confundian y se marcaba al primero.
        id: employee._id.toString(),
        descriptor: employee.faceDescriptor,
      })),
    }
  }

  /**
   * Reconoce a la persona por su rostro.
   *
   * Solo responde con alguien si queda claramente por delante del segundo
   * candidato (ver `face-matching.ts`). Un empate es "no reconocido": elegir a
   * uno de los dos es lo que mostraba en pantalla a otra persona.
   */
  async checkIn(descriptorToCheck: number[]): Promise<any> {
    if (!isFaceDescriptor(descriptorToCheck)) {
      throw new BadRequestException(
        'El descriptor facial proporcionado es inválido.'
      )
    }

    const { employees, candidates } = await this.faceCandidates()
    if (candidates.length === 0) {
      throw new NotFoundException(
        'No hay rostros de referencia válidos en la base de datos.'
      )
    }

    const match = matchFace(descriptorToCheck, candidates)
    if (match.status === 'ambiguous') {
      throw new NotFoundException(
        'Rostro no reconocido: se parece a más de una persona registrada.'
      )
    }
    if (match.status !== 'match') {
      throw new NotFoundException('Rostro no reconocido')
    }
    const user = employees.find(u => u._id.toString() === match.id)
    return {
      success: true,
      user: { id: user?._id, name: user?.firstName + ' ' + user?.lastName },
      distance: Math.round(match.distance * 1000) / 1000,
    }
  }

  /**
   * Sincroniza empleados desde el servicio NamedService
   * Obtiene la lista de usuarios activos y los guarda como empleados
   * @returns Promise con el resultado de la sincronización
   */
  async syncEmployeesFromNamedService(): Promise<{
    totalProcessed: number
    newEmployees: number
    existingEmployees: number
    errors: string[]
  }> {
    try {
      // Obtener la lista de usuarios del servicio NamedService
      const namedResponse = await this.namedService.getAllUsers()

      if (
        !namedResponse ||
        !namedResponse.listUsers ||
        !Array.isArray(namedResponse.listUsers)
      ) {
        throw new BadRequestException(
          'Respuesta inválida del servicio NamedService'
        )
      }

      // Filtrar solo usuarios activos
      const activeUsers = namedResponse.listUsers.filter(
        user => user.status_description === 'ACTIVO'
      )

      if (activeUsers.length === 0) {
        return {
          totalProcessed: 0,
          newEmployees: 0,
          existingEmployees: 0,
          errors: [],
        }
      }

      const allEmployees = await this.employeeModel
        .find({})
        .select('id document firstName lastName status')
        .exec()

      let newEmployees = 0
      let existingEmployees = 0
      const errors: string[] = []

      // Índices por id y por documento: antes se hacía un `find` lineal sobre
      // todo el arreglo por cada usuario, y una escritura secuencial por cada
      // uno. Ahora las coincidencias son O(1) y todas las escrituras viajan en
      // una sola operación.
      const byStaffId = new Map<number, any>()
      const byDocument = new Map<string, any>()
      for (const employee of allEmployees) {
        if (!byStaffId.has(employee.id)) {
          byStaffId.set(employee.id, employee)
        }
        if (employee.document && !byDocument.has(employee.document)) {
          byDocument.set(employee.document, employee)
        }
      }

      const operations: any[] = []
      // Un mismo empleado local puede ser candidato de varios usuarios externos
      // (mismo documento con distinto staff_id). El bucle original ejecutaba una
      // actualización por cada uno y prevalecía la última, así que aquí se
      // conserva sólo la última y se cuentan todas las coincidencias.
      const updateByEmployeeId = new Map<string, { _id: any; payload: any }>()

      for (const user of activeUsers) {
        try {
          const payload = {
            id: user.staff_id,
            firstName: user.first_name,
            lastName: composeLastName(user.last_name, user.mother_last_name),
            document: user.personal_id,
            status: 'active',
          }

          const existingEmployee =
            byStaffId.get(user.staff_id) ??
            (user.personal_id ? byDocument.get(user.personal_id) : undefined)

          if (existingEmployee) {
            existingEmployees++
            updateByEmployeeId.set(existingEmployee._id.toString(), {
              _id: existingEmployee._id,
              payload,
            })
            continue
          }

          operations.push({ insertOne: { document: payload } })
          newEmployees++
        } catch (error) {
          const errorMsg = `Error procesando usuario ${user.staff_id}: ${error.message}`
          errors.push(errorMsg)
        }
      }

      for (const { _id, payload } of updateByEmployeeId.values()) {
        operations.push({
          updateOne: { filter: { _id }, update: { $set: payload } },
        })
      }

      if (operations.length > 0) {
        try {
          await this.employeeModel.bulkWrite(operations, { ordered: false })
        } catch (error) {
          // Con `ordered: false` Mongo aplica todo lo que puede y reporta el
          // resto en `writeErrors`. Se contabilizan sin abortar la operación,
          // igual que el try/catch por usuario del bucle original.
          const writeErrors = error?.writeErrors ?? []
          if (writeErrors.length === 0) {
            throw error
          }
          for (const writeError of writeErrors) {
            errors.push(
              `Error escribiendo usuario: ${writeError?.errmsg ?? writeError?.message ?? 'desconocido'}`
            )
          }
          const failed = writeErrors.length
          newEmployees = Math.max(0, newEmployees - failed)
        }
      }

      return {
        totalProcessed: activeUsers.length,
        newEmployees,
        existingEmployees,
        errors,
      }
    } catch (error) {
      throw new BadRequestException(
        `Error al sincronizar empleados: ${error.message}`
      )
    }
  }

  /**
   * Obtiene la información de la carpeta models con todos sus archivos JSON
   * @returns Promise con la información de los modelos disponibles
   */
  async getModelsInfo(): Promise<{
    modelsPath: string
    jsonFiles: Array<{
      name: string
      size: string
      lastModified: string
      content?: any
    }>
    errors: string[]
  }> {
    try {
      const modelsPath = path.join(process.cwd(), 'models')

      // Verificar si la carpeta existe
      if (!fs.existsSync(modelsPath)) {
        throw new NotFoundException('La carpeta models no existe')
      }

      const files = fs.readdirSync(modelsPath)
      const jsonFiles: Array<{
        name: string
        size: string
        lastModified: string
        content?: any
      }> = []

      const errors: string[] = []

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(modelsPath, file)
            const stats = fs.statSync(filePath)

            // Formatear tamaño del archivo
            const size = this.formatFileSize(stats.size)

            // Leer contenido del JSON
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'))

            jsonFiles.push({
              name: file,
              size,
              lastModified: stats.mtime.toISOString(),
              content,
            })
          } catch (error) {
            errors.push(`Error procesando ${file}: ${error.message}`)
          }
        }
      }

      return {
        modelsPath,
        jsonFiles,
        errors,
      }
    } catch (error) {
      throw new BadRequestException(
        `Error al obtener información de modelos: ${error.message}`
      )
    }
  }

  /**
   * Obtiene el contenido de un archivo JSON específico
   * @param fileName Nombre del archivo JSON
   * @returns Promise con el contenido del archivo
   */
  async getModelFile(fileName: string): Promise<any> {
    try {
      const modelsPath = path.join(process.cwd(), 'models')
      // Solo un nombre de fichero, sin carpetas: `..%2F..%2Fx.json` llega
      // decodificado y, unido tal cual, leia JSON de fuera de `models`.
      if (fileName !== path.basename(fileName) || fileName.startsWith('.')) {
        throw new BadRequestException('Nombre de archivo no válido')
      }
      const filePath = path.join(modelsPath, fileName)

      // Verificar si el archivo existe
      if (!fs.existsSync(filePath)) {
        throw new NotFoundException(`El archivo ${fileName} no existe`)
      }

      // Verificar que sea un archivo JSON
      if (!fileName.endsWith('.json')) {
        throw new BadRequestException('Solo se permiten archivos JSON')
      }

      // Leer y parsear el archivo
      const content = fs.readFileSync(filePath, 'utf8')
      return JSON.parse(content)
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error
      }
      throw new BadRequestException(
        `Error al leer el archivo ${fileName}: ${error.message}`
      )
    }
  }

  /**
   * Formatea el tamaño del archivo en unidades legibles
   * @param bytes Tamaño en bytes
   * @returns Tamaño formateado
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * Actualiza el estado de huella dactilar de un empleado
   * @param employeeId ID del empleado
   * @param issetFinger Estado de la huella dactilar
   * @returns Empleado actualizado
   */
  async updateFingerprintStatus(
    employeeId: string,
    issetFinger: boolean,
    fingerprintId?: string
  ): Promise<Employee> {
    try {
      const updateData: any = { issetFinger }
      if (!issetFinger) {
        updateData.fingerprintId = null
      } else if (fingerprintId) {
        updateData.fingerprintId = fingerprintId
      }
      const employee = await this.employeeModel
        .findByIdAndUpdate(employeeId, updateData, { new: true })
        .exec()

      if (!employee) {
        throw new NotFoundException('Empleado no encontrado')
      }

      return employee
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error
      }
      throw new InternalServerErrorException(
        `Error al actualizar el estado de huella: ${error.message}`
      )
    }
  }

  /**
   * Retorna lista de empleados con estado de registro facial
   * status: "Registrado" si existe al menos un valor en faceDescriptor
   *         "No registrado" en caso contrario
   */
  async getEmployeesWithStatus(): Promise<
    Array<{ firstName: string; lastName: string; status: string }>
  > {
    const result = await this.employeeModel
      .aggregate([
        {
          $project: {
            _id: 0,
            firstName: 1,
            lastName: 1,
            document: 1,
            status: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ['$faceDescriptor', []] } }, 0] },
                'Registrado',
                'No registrado',
              ],
            },
          },
        },
      ])
      .exec()

    return result as Array<{
      firstName: string
      lastName: string
      status: string
      document: string
    }>
  }
}
