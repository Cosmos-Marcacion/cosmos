import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { lastValueFrom } from 'rxjs'
import { TtlCache } from '../../common/cache/ttl-cache'

/**
 * Maestro de personal propio (VISMA TuRecibo).
 *
 * Es la unica fuente de personas para todos los cargos que la plataforma asigna
 * a una nombrada y que despues firman los formatos: jefe de cubierta,
 * supervisor de operaciones, supervisor SSOMA, entrenador, responsable del
 * registro y los aprobadores de la inspeccion de nave. Ninguno de ellos viene
 * en la nombrada: son personal de la empresa. Tambien alimenta el buscador del
 * registro de empleados de la app, fusionado con el maestro de Cosmos.
 *
 * Contrato real, verificado contra `https://api.stage.turecibo.com`
 * (`gu_a_de_uso_de_api_turecibo.md`):
 *
 *   POST {VISMA_URL}/v2/auth-mod/login
 *        Content-Type: application/json
 *        { "user": "...", "password": "..." }
 *        -> { "jwt": "<JWT>" }            (vigencia 12 h)
 *
 *   GET  {VISMA_URL}/v2/admin-mod/users/search?filter=<texto>
 *        Authorization: Bearer <jwt>
 *        -> { "data": [ { id, nombre, cuil, mail } ] }
 *
 *   GET  {VISMA_URL}/v2/admin-mod/users/{id}
 *        -> { usuario, nombre, apellido, mail, dni, cuil, fecha_nacimiento,
 *             fecha_contratacion, numero_legajo, external_id, sector,
 *             locacion, ingreso, estado_empresa, cargo, reporta }
 *
 * Dos limites de la API mandan sobre el diseño de este servicio:
 *
 *  1. `users/search` **exige** `filter` y rechaza menos de 3 caracteres
 *     (`SYSTEM_API_MIN_LENGTH_VALUE_NOT_REACHED`). No existe endpoint de
 *     listado, asi que el maestro no se puede descargar entero: se consulta
 *     por termino y se cachea cada termino.
 *  2. `users/search` solo devuelve id, nombre completo, documento y correo. El
 *     nombre viene en una sola cadena y sin separar apellidos, y no trae ni
 *     legajo ni cargo ni estado. Todo eso vive en el detalle, que cuesta una
 *     llamada por persona, asi que se pide solo cuando alguien la selecciona.
 *
 * Sin `VISMA_URL` se sirve un maestro simulado con datos de prueba. El resto
 * del sistema no cambia porque siempre consume `search()`.
 */

export interface VismaPerson {
  /** Identificador del usuario en TuRecibo (`id`). */
  id: string
  /** Nombre completo tal como lo devuelve el buscador. */
  fullName: string
  /** Documento de identidad (`dni`, o `cuil` cuando el buscador solo trae ese). */
  document: string
  /**
   * Cargo. El buscador NO lo devuelve; solo la ficha, y solo si el cliente lo
   * cargo en TuRecibo (en pruebas hay de los dos). No se puede filtrar por el
   * ni darlo por presente.
   */
  position: string
  active: boolean
  /** Nombres, solo disponible en el detalle. */
  firstName?: string
  /** Apellidos, solo disponible en el detalle. */
  lastName?: string
  /** Legajo (`numero_legajo`), solo disponible en el detalle. */
  fileNumber?: string
  email?: string
  sector?: string
  location?: string
  hireDate?: string
  birthDate?: string
}

/** Fila de `GET /v2/admin-mod/users/search`. */
interface TuReciboSearchRow {
  id?: string | number
  nombre?: string
  cuil?: string
  mail?: string | null
}

/**
 * Respuesta del buscador. Se acepta tambien el arreglo pelado por si el
 * cliente expone el maestro a traves de un intermediario propio.
 */
type TuReciboSearchResponse =
  | { data?: TuReciboSearchRow[] }
  | TuReciboSearchRow[]

/** Respuesta del login. TuRecibo lo llama `jwt`; el resto son alternativas. */
interface TuReciboLoginResponse {
  jwt?: string
  token?: string
  access_token?: string
}

/**
 * Lo unico que se mira de un error de red. Tiparlo evita manejar el `catch`
 * como `any` y equivocarse de campo sin que nadie avise.
 */
interface HttpFailure {
  message?: string
  response?: { status?: number; data?: unknown }
}

function asFailure(error: unknown): HttpFailure {
  return (error ?? {}) as HttpFailure
}

function statusOf(error: unknown): number | undefined {
  return asFailure(error).response?.status
}

/** Respuesta de `GET /v2/admin-mod/users/{id}`. */
interface TuReciboUserDetail {
  usuario?: string
  nombre?: string
  apellido?: string
  mail?: string | null
  dni?: string
  cuil?: string
  fecha_nacimiento?: string
  fecha_contratacion?: string
  numero_legajo?: string | number | null
  external_id?: string | null
  sector?: string | null
  locacion?: string | null
  ingreso?: number
  estado_empresa?: number
  cargo?: string | null
  reporta?: string | null
}

export interface SearchPersonOptions {
  search?: string
  limit?: number
  includeInactive?: boolean
  /** Filtra por cargo; se compara sin acentos y sin distinguir mayusculas. */
  position?: string
}

/** Longitud minima que acepta `users/search`. Menos devuelve HTTP 400. */
export const VISMA_MIN_SEARCH_LENGTH = 3

/**
 * Datos de prueba. Reflejan la forma del maestro real: nombre completo,
 * documento de identidad y legajo.
 *
 * `position` va vacio a proposito, igual que en produccion: TuRecibo devuelve
 * `cargo: null` mientras el cliente no lo cargue. Poner uno aqui haria que el
 * simulado enseñase un dato que el sistema real no va a tener, y encima
 * reforzaria la confusion entre el puesto de RR. HH. de la persona y el rol que
 * se le asigna en la jornada, que son cosas distintas.
 *
 * Los legajos van por bloques para que en pruebas manuales se pueda repartir la
 * plantilla entre los campos de la vista sin repetir persona:
 *
 *   1001-1008  jefes de cubierta      4001-4003  entrenadores
 *   2001-2005  supervisores de ops.   5001-5003  responsables del registro
 *   3001-3004  supervisores SSOMA     6001-6002  aprobadores de la VSI
 */
const MOCK_PERSONAL: VismaPerson[] = [
  {
    id: 'VSM-001',
    fileNumber: '1001',
    lastName: 'HIDALGO CASTILLO',
    firstName: 'DARWIN JAVIER',
    fullName: 'HIDALGO CASTILLO DARWIN JAVIER',
    document: '74355639',
    position: '',
    active: true,
  },
  {
    id: 'VSM-002',
    fileNumber: '1002',
    lastName: 'BRUNO SULLON',
    firstName: 'ALEXANDER PAUL',
    fullName: 'BRUNO SULLON ALEXANDER PAUL',
    document: '80316804',
    position: '',
    active: true,
  },
  {
    id: 'VSM-003',
    fileNumber: '1003',
    lastName: 'MORAN PERALTA',
    firstName: 'CARLOS ENRIQUE',
    fullName: 'MORAN PERALTA CARLOS ENRIQUE',
    document: '42213311',
    position: '',
    active: true,
  },
  {
    id: 'VSM-004',
    fileNumber: '1004',
    lastName: 'CRUZ ANTON',
    firstName: 'MANUEL ANTONIO',
    fullName: 'CRUZ ANTON MANUEL ANTONIO',
    document: '03501122',
    position: '',
    active: true,
  },
  {
    id: 'VSM-005',
    fileNumber: '1005',
    lastName: 'PANTA CHAPILLIQUEN',
    firstName: 'LUIS ALBERTO',
    fullName: 'PANTA CHAPILLIQUEN LUIS ALBERTO',
    document: '44120987',
    position: '',
    active: true,
  },
  {
    id: 'VSM-006',
    fileNumber: '1006',
    lastName: 'ZAPATA FIESTAS',
    firstName: 'SEGUNDO MANUEL',
    fullName: 'ZAPATA FIESTAS SEGUNDO MANUEL',
    document: '03488761',
    position: '',
    active: true,
  },
  {
    id: 'VSM-007',
    fileNumber: '1007',
    lastName: 'YOVERA QUEREVALU',
    firstName: 'JOSE MIGUEL',
    fullName: 'YOVERA QUEREVALU JOSE MIGUEL',
    document: '46903215',
    position: '',
    active: true,
  },
  {
    id: 'VSM-008',
    fileNumber: '1008',
    lastName: 'RUIZ SANDOVAL',
    firstName: 'PEDRO PABLO',
    fullName: 'RUIZ SANDOVAL PEDRO PABLO',
    document: '03477412',
    position: '',
    active: false,
  },
  {
    id: 'VSM-101',
    fileNumber: '2001',
    lastName: 'ALBURQUEQUE PAIVA',
    firstName: 'JORGE LUIS',
    fullName: 'ALBURQUEQUE PAIVA JORGE LUIS',
    document: '41556320',
    position: '',
    active: true,
  },
  {
    id: 'VSM-102',
    fileNumber: '2002',
    lastName: 'CHUNGA ECHE',
    firstName: 'MARIA DEL PILAR',
    fullName: 'CHUNGA ECHE MARIA DEL PILAR',
    document: '45123098',
    position: '',
    active: true,
  },
  {
    id: 'VSM-103',
    fileNumber: '2003',
    lastName: 'TEMOCHE PAZOS',
    firstName: 'RICARDO MARTIN',
    fullName: 'TEMOCHE PAZOS RICARDO MARTIN',
    document: '03399875',
    position: '',
    active: true,
  },
  {
    id: 'VSM-104',
    fileNumber: '2004',
    lastName: 'SEMINARIO GARCIA',
    firstName: 'ANA LUCIA',
    fullName: 'SEMINARIO GARCIA ANA LUCIA',
    document: '47820164',
    position: '',
    active: true,
  },
  {
    id: 'VSM-105',
    fileNumber: '2005',
    lastName: 'ECA VILLEGAS',
    firstName: 'RENZO ALONSO',
    fullName: 'ECA VILLEGAS RENZO ALONSO',
    document: '44873012',
    position: '',
    active: true,
  },
  {
    id: 'VSM-201',
    fileNumber: '3001',
    lastName: 'VILELA CORDOVA',
    firstName: 'JOSE ANTONIO',
    fullName: 'VILELA CORDOVA JOSE ANTONIO',
    document: '43201778',
    position: '',
    active: true,
  },
  {
    id: 'VSM-202',
    fileNumber: '3002',
    lastName: 'FLORES SANDOVAL',
    firstName: 'ROSA ELENA',
    fullName: 'FLORES SANDOVAL ROSA ELENA',
    document: '46711230',
    position: '',
    active: true,
  },
  {
    id: 'VSM-203',
    fileNumber: '3003',
    lastName: 'NUNEZ SILVA',
    firstName: 'WALTER ENRIQUE',
    fullName: 'NUNEZ SILVA WALTER ENRIQUE',
    document: '02876541',
    position: '',
    active: true,
  },
  {
    id: 'VSM-204',
    fileNumber: '3004',
    lastName: 'RAMIREZ COVENAS',
    firstName: 'GIULIANA PAOLA',
    fullName: 'RAMIREZ COVENAS GIULIANA PAOLA',
    document: '47009321',
    position: '',
    active: true,
  },
  {
    id: 'VSM-301',
    fileNumber: '4001',
    lastName: 'CASTILLO RUIZ',
    firstName: 'MIGUEL ANGEL',
    fullName: 'CASTILLO RUIZ MIGUEL ANGEL',
    document: '44098712',
    position: '',
    active: true,
  },
  {
    id: 'VSM-302',
    fileNumber: '4002',
    lastName: 'MENDOZA AGURTO',
    firstName: 'CLAUDIA PATRICIA',
    fullName: 'MENDOZA AGURTO CLAUDIA PATRICIA',
    document: '47331209',
    position: '',
    active: true,
  },
  {
    id: 'VSM-303',
    fileNumber: '4003',
    lastName: 'SANDOVAL PURIZACA',
    firstName: 'VICTOR RAUL',
    fullName: 'SANDOVAL PURIZACA VICTOR RAUL',
    document: '03412998',
    position: '',
    active: true,
  },
  {
    id: 'VSM-401',
    fileNumber: '5001',
    lastName: 'ATOCHE RIVAS',
    firstName: 'LUISA FERNANDA',
    fullName: 'ATOCHE RIVAS LUISA FERNANDA',
    document: '48120356',
    position: '',
    active: true,
  },
  {
    id: 'VSM-402',
    fileNumber: '5002',
    lastName: 'JIMENEZ VALLADARES',
    firstName: 'OSCAR IVAN',
    fullName: 'JIMENEZ VALLADARES OSCAR IVAN',
    document: '45677201',
    position: '',
    active: true,
  },
  {
    id: 'VSM-403',
    fileNumber: '5003',
    lastName: 'GARCIA ZETA',
    firstName: 'MELISSA ANTUANE',
    fullName: 'GARCIA ZETA MELISSA ANTUANE',
    document: '48993410',
    position: '',
    active: true,
  },
  {
    id: 'VSM-501',
    fileNumber: '6001',
    lastName: 'ANCAJIMA PAZO',
    firstName: 'SEGUNDO FELIPE',
    fullName: 'ANCAJIMA PAZO SEGUNDO FELIPE',
    document: '03455129',
    position: '',
    active: true,
  },
  {
    id: 'VSM-502',
    fileNumber: '6002',
    lastName: 'QUEREVALU CHERRE',
    firstName: 'MANUEL JESUS',
    fullName: 'QUEREVALU CHERRE MANUEL JESUS',
    document: '02998877',
    position: '',
    active: true,
  },
]

/** Quita acentos y pasa a mayusculas, para comparar sin sorpresas. */
function normalizeText(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

/** Une los trozos de nombre sin espacios sobrantes y en mayusculas. */
function joinName(...parts: (string | undefined | null)[]): string {
  return parts
    .map(part => (part ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

@Injectable()
export class VismaService {
  private readonly logger = new Logger(VismaService.name)
  /** Resultados del buscador, por termino. */
  private readonly searchCache: TtlCache<VismaPerson[]>
  /** Fichas completas, por id. */
  private readonly detailCache: TtlCache<VismaPerson | null>
  /** JWT de TuRecibo y su caducidad. Se renueva solo cuando expira. */
  private token: { value: string; expiresAt: number } | null = null

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    const ttlMs = Number(
      this.configService.get('VISMA_CACHE_TTL_MS', 15 * 60 * 1000)
    )
    this.searchCache = new TtlCache<VismaPerson[]>({ ttlMs, maxEntries: 300 })
    this.detailCache = new TtlCache<VismaPerson | null>({
      ttlMs,
      maxEntries: 300,
    })
  }

  /** `true` cuando hay TuRecibo real configurado. */
  isLive(): boolean {
    return Boolean(this.configService.get('VISMA_URL'))
  }

  /** Caracteres minimos que hay que teclear para que la API responda. */
  minSearchLength(): number {
    return this.isLive() ? VISMA_MIN_SEARCH_LENGTH : 0
  }

  /**
   * Busca personal por nombre o documento.
   *
   * Contra TuRecibo la busqueda la resuelve la propia API: no hay listado
   * completo que descargar, y `filter` es obligatorio con al menos tres
   * caracteres. Por debajo de ese minimo se devuelve vacio en vez de provocar
   * un 400, para que el selector pueda pedir en cada tecla sin romperse.
   *
   * En modo simulado se busca en memoria sobre los datos de prueba, y ahi si
   * tiene sentido devolver el maestro entero con el termino vacio.
   */
  async search(options: SearchPersonOptions = {}): Promise<VismaPerson[]> {
    const {
      search = '',
      limit = 20,
      includeInactive = false,
      position,
    } = options
    const term = (search ?? '').trim()

    let people: VismaPerson[]
    if (this.isLive()) {
      if (term.length < VISMA_MIN_SEARCH_LENGTH) {
        return []
      }
      people = await this.searchCache.wrap(normalizeText(term), () =>
        this.fetchSearch(term)
      )
    } else {
      people = this.searchMock()
    }

    if (!includeInactive) {
      people = people.filter(p => p.active)
    }

    // `position` solo sirve si el maestro trae cargo, cosa que TuRecibo no
    // garantiza. Ningun campo de la vista de marcaciones lo usa: los cargos de
    // ahi son roles de la jornada, no puestos de RR. HH.
    if (position) {
      const wanted = normalizeText(position)
      people = people.filter(p => normalizeText(p.position).includes(wanted))
    }

    return this.rank(people, term).slice(0, limit)
  }

  /**
   * Ficha completa de una persona: nombres y apellidos separados, legajo,
   * documento, sector, cargo y estado. Es la unica forma de saber donde acaba
   * el apellido y empieza el nombre, porque el buscador los devuelve juntos.
   */
  async findById(id: string): Promise<VismaPerson | undefined> {
    const key = String(id ?? '').trim()
    if (!key) {
      return undefined
    }

    if (!this.isLive()) {
      return MOCK_PERSONAL.find(
        p => p.id === key || p.fileNumber === key || p.document === key
      )
    }

    const person = await this.detailCache.wrap(key, () => this.fetchDetail(key))
    return person ?? undefined
  }

  /** Descarta lo cacheado y el token. El siguiente acceso releera TuRecibo. */
  invalidate(): void {
    this.searchCache.clear()
    this.detailCache.clear()
    this.token = null
  }

  // ---------------------------------------------------------------- busqueda

  /** Copia de los datos de prueba, para que nadie los mute por accidente. */
  private searchMock(): VismaPerson[] {
    return MOCK_PERSONAL.map(p => ({ ...p }))
  }

  /**
   * Ordena por relevancia para el autocompletado: documento exacto primero,
   * luego prefijo de documento, luego nombre que empieza por lo tecleado y por
   * ultimo lo que solo lo contiene.
   */
  private rank(people: VismaPerson[], search: string): VismaPerson[] {
    const term = normalizeText(search)
    if (!term) {
      return [...people].sort((a, b) => a.fullName.localeCompare(b.fullName))
    }

    const scored: { person: VismaPerson; score: number }[] = []
    for (const person of people) {
      const name = normalizeText(person.fullName)
      const document = normalizeText(person.document)

      let score = 5
      if (document === term) score = 0
      else if (document.startsWith(term)) score = 1
      else if (name.startsWith(term)) score = 2
      // Cada palabra del nombre cuenta como inicio: buscar "DARWIN" encuentra
      // "HIDALGO CASTILLO DARWIN JAVIER".
      else if (name.split(' ').some(word => word.startsWith(term))) score = 3
      else if (name.includes(term) || document.includes(term)) score = 4

      // En modo simulado la busqueda es local y lo que no casa se descarta; con
      // TuRecibo la coincidencia ya la decidio la API, asi que nada se filtra.
      if (score < 5 || this.isLive()) {
        scored.push({ person, score })
      }
    }

    return scored
      .sort(
        (a, b) =>
          a.score - b.score ||
          a.person.fullName.localeCompare(b.person.fullName)
      )
      .map(s => s.person)
  }

  // ---------------------------------------------------------------- transporte

  /** Base de la API sin barra final. */
  private baseUrl(): string {
    return String(this.configService.get('VISMA_URL', '')).replace(/\/+$/, '')
  }

  /**
   * JWT de acceso. `VISMA_TOKEN` permite inyectar uno fijo (util en pruebas de
   * integracion); en su defecto se hace el login documentado y se guarda hasta
   * un minuto antes de que caduque.
   */
  private async getToken(): Promise<string> {
    const fixed = this.configService.get('VISMA_TOKEN')
    if (fixed) {
      return String(fixed)
    }

    if (this.token && Date.now() < this.token.expiresAt) {
      return this.token.value
    }

    const user = this.configService.get('VISMA_USERNAME')
    const password = this.configService.get('VISMA_PASSWORD')
    if (!user || !password) {
      throw new HttpException(
        'Faltan credenciales de Visma (VISMA_USERNAME / VISMA_PASSWORD)',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }

    const loginPath = String(
      this.configService.get('VISMA_LOGIN_PATH', 'v2/auth-mod/login')
    ).replace(/^\/+|\/+$/g, '')

    const response = await lastValueFrom(
      this.httpService.post<TuReciboLoginResponse>(
        `${this.baseUrl()}/${loginPath}`,
        { user: String(user), password: String(password) },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      )
    )

    // La API devuelve el token en `jwt`; se aceptan los nombres habituales por
    // si el cliente lo expone a traves de un intermediario propio.
    const body: TuReciboLoginResponse = response?.data ?? {}
    const jwt = body.jwt ?? body.token ?? body.access_token
    if (!jwt) {
      throw new HttpException(
        'Visma no devolvio token de acceso',
        HttpStatus.UNAUTHORIZED
      )
    }

    this.token = { value: String(jwt), expiresAt: this.readExpiry(String(jwt)) }
    return this.token.value
  }

  /**
   * Caducidad real del JWT, un minuto antes de la que declara.
   *
   * La guia dice 12 h, pero el `exp` del propio token es el dato fiable y la
   * API puede acortarlo; si no se puede leer se asume una hora, que es lo
   * bastante corto para no quedarse con un token muerto.
   */
  private readExpiry(jwt: string): number {
    const fallback = Date.now() + 60 * 60 * 1000
    const payload = jwt.split('.')[1]
    if (!payload) {
      return fallback
    }
    try {
      const decoded = JSON.parse(
        Buffer.from(payload, 'base64').toString('utf8')
      ) as { exp?: number }
      const exp = Number(decoded?.exp)
      if (!Number.isFinite(exp) || exp <= 0) {
        return fallback
      }
      // Sin suelo: un token que ya llega caducado no se guarda como valido, o
      // la primera peticion se gastaria siempre en un 401.
      return exp * 1000 - 60 * 1000
    } catch {
      return fallback
    }
  }

  /**
   * GET autenticado. Un 401 o un 403 casi siempre es el token caducado antes de
   * tiempo: se descarta y se reintenta una vez con uno nuevo.
   */
  private async getWithAuth<T>(
    url: string,
    params?: Record<string, any>
  ): Promise<T> {
    const send = async () => {
      const token = await this.getToken()
      const response = await lastValueFrom(
        this.httpService.get<T>(url, {
          params,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })
      )
      return response.data
    }

    try {
      return await send()
    } catch (error) {
      const status = statusOf(error)
      if (
        (status === 401 || status === 403) &&
        this.token &&
        !this.configService.get('VISMA_TOKEN')
      ) {
        this.token = null
        return send()
      }
      throw error
    }
  }

  /** `GET /v2/admin-mod/users/search?filter=...` */
  private async fetchSearch(term: string): Promise<VismaPerson[]> {
    const path = String(
      this.configService.get('VISMA_SEARCH_PATH', 'v2/admin-mod/users/search')
    ).replace(/^\/+|\/+$/g, '')

    try {
      const payload = await this.getWithAuth<TuReciboSearchResponse>(
        `${this.baseUrl()}/${path}`,
        { filter: term }
      )
      const rows: TuReciboSearchRow[] = Array.isArray(payload)
        ? payload
        : (payload?.data ?? [])
      return rows.map(row => this.fromSearchRow(row)).filter(p => p.fullName)
    } catch (error) {
      // Sin coincidencias la API responde 404, que aqui es una lista vacia y no
      // un fallo: el selector consulta en cada tecla y lo normal es no acertar.
      if (statusOf(error) === 404) {
        return []
      }
      return this.fail(error, `No se pudo buscar "${term}" en Visma`)
    }
  }

  /** `GET /v2/admin-mod/users/{id}` */
  private async fetchDetail(id: string): Promise<VismaPerson | null> {
    const path = String(
      this.configService.get('VISMA_USERS_PATH', 'v2/admin-mod/users')
    ).replace(/^\/+|\/+$/g, '')

    try {
      const data = await this.getWithAuth<TuReciboUserDetail>(
        `${this.baseUrl()}/${path}/${encodeURIComponent(id)}`
      )
      return data ? this.fromDetail(id, data) : null
    } catch (error) {
      if (statusOf(error) === 404) {
        return null
      }
      return this.fail(error, `No se pudo consultar la ficha ${id} en Visma`)
    }
  }

  private fail(error: unknown, message: string): never {
    const failure = asFailure(error)
    const status = failure.response?.status
    const detail = failure.response?.data
    this.logger.error(
      `${message}${status ? ` (HTTP ${status})` : ''}: ${failure.message ?? String(error)}` +
        (detail ? ` | ${JSON.stringify(detail).slice(0, 500)}` : '')
    )
    if (error instanceof HttpException) {
      throw error
    }
    throw new HttpException(message, HttpStatus.SERVICE_UNAVAILABLE)
  }

  // ------------------------------------------------------------------ mapeo

  private fromSearchRow(row: TuReciboSearchRow): VismaPerson {
    return {
      id: String(row.id ?? '').trim(),
      fullName: joinName(row.nombre),
      // El buscador solo trae `cuil`; en Peru coincide con el DNI, y el detalle
      // lo confirma devolviendo el mismo valor en `dni`.
      document: String(row.cuil ?? '').trim(),
      position: '',
      // El buscador no informa el estado. Se asume activo y lo corrige el
      // detalle, que si trae `estado_empresa`.
      active: true,
      email: row.mail ? String(row.mail).trim() : undefined,
    }
  }

  private fromDetail(id: string, detail: TuReciboUserDetail): VismaPerson {
    const fileNumber =
      detail.numero_legajo !== undefined && detail.numero_legajo !== null
        ? String(detail.numero_legajo).trim()
        : undefined

    return {
      id: String(id),
      firstName: joinName(detail.nombre),
      lastName: joinName(detail.apellido),
      fullName: joinName(detail.apellido, detail.nombre),
      document: String(detail.dni ?? detail.cuil ?? '').trim(),
      position: detail.cargo ? String(detail.cargo).toUpperCase().trim() : '',
      // `estado_empresa` es 1 cuando la persona sigue vinculada.
      active:
        detail.estado_empresa === undefined ||
        Number(detail.estado_empresa) === 1,
      fileNumber: fileNumber || undefined,
      email: detail.mail ? String(detail.mail).trim() : undefined,
      sector: detail.sector ? String(detail.sector).trim() : undefined,
      location: detail.locacion ? String(detail.locacion).trim() : undefined,
      hireDate: detail.fecha_contratacion || undefined,
      birthDate: detail.fecha_nacimiento || undefined,
    }
  }
}
