import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { of, throwError } from 'rxjs'
import { VismaService } from './visma.service'

/**
 * Sin `VISMA_URL` el servicio trabaja contra el maestro simulado, que es lo que
 * ejercitan las pruebas del buscador: lo que se comprueba ahi es la relevancia,
 * no el transporte.
 */
function buildService(): VismaService {
  const configService = {
    get: (key: string, fallback?: any) =>
      key === 'VISMA_URL' ? undefined : fallback,
  } as unknown as ConfigService
  const httpService = {} as HttpService
  return new VismaService(httpService, configService)
}

/** Config con TuRecibo configurado, para ejercitar el transporte. */
function buildLiveConfig(overrides: Record<string, any> = {}): ConfigService {
  const values: Record<string, any> = {
    VISMA_URL: 'https://api.stage.turecibo.com',
    VISMA_USERNAME: 'demo_api_turecibo_pe',
    VISMA_PASSWORD: 'secreta',
    ...overrides,
  }
  return {
    get: (key: string, fallback?: any) =>
      key in values ? values[key] : fallback,
  } as unknown as ConfigService
}

/** JWT de mentira con el `exp` que se le pida, para probar la caducidad. */
function jwtWithExp(secondsFromNow: number): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow }),
    'utf8'
  ).toString('base64')
  return `header.${payload}.signature`
}

/** Fila del buscador, con la forma exacta que devuelve TuRecibo. */
function row(overrides: Record<string, any> = {}) {
  return {
    id: '1177106',
    nombre: 'Leandro Royer Maldonado Garcia',
    cuil: '41591769',
    mail: 'lmaldonadog@torreblanca.com.pe',
    ...overrides,
  }
}

/** Ficha completa, con la forma exacta que devuelve TuRecibo. */
function detail(overrides: Record<string, any> = {}) {
  return {
    usuario: '41591769',
    nombre: 'Leandro Royer',
    apellido: 'Maldonado Garcia',
    mail: 'lmaldonadog@torreblanca.com.pe',
    dni: '41591769',
    cuil: '41591769',
    fecha_nacimiento: '19/03/1981',
    fecha_contratacion: '16/01/2013',
    numero_legajo: 417580,
    external_id: null,
    sector: 'G11',
    locacion: '264',
    ingreso: 1,
    estado_empresa: 1,
    cargo: null,
    reporta: null,
    ...overrides,
  }
}

function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), {
    response: { status, data: {} },
  })
}

describe('VismaService.search (maestro simulado)', () => {
  let service: VismaService

  beforeEach(() => {
    service = buildService()
  })

  it('sin término devuelve el maestro para poder elegir sin escribir', async () => {
    const result = await service.search({ limit: 5 })
    expect(result).toHaveLength(5)
  })

  it('encuentra por documento exacto y lo pone primero', async () => {
    const result = await service.search({ search: '74355639' })
    expect(result[0].fullName).toBe('HIDALGO CASTILLO DARWIN JAVIER')
  })

  it('encuentra por cualquier palabra del nombre, no solo por el apellido', async () => {
    const result = await service.search({ search: 'darwin' })
    expect(result.map(p => p.fullName)).toContain(
      'HIDALGO CASTILLO DARWIN JAVIER'
    )
  })

  it('ignora acentos y mayúsculas', async () => {
    const conAcento = await service.search({ search: 'morán' })
    const sinAcento = await service.search({ search: 'MORAN' })
    expect(conAcento.map(p => p.id)).toEqual(sinAcento.map(p => p.id))
    expect(conAcento[0].fullName).toBe('MORAN PERALTA CARLOS ENRIQUE')
  })

  it('deja fuera a los inactivos salvo que se pidan', async () => {
    const activos = await service.search({ search: 'RUIZ SANDOVAL' })
    expect(activos).toHaveLength(0)
    const todos = await service.search({
      search: 'RUIZ SANDOVAL',
      includeInactive: true,
    })
    expect(todos.map(p => p.document)).toContain('03477412')
  })

  it('no exige longitud mínima: el maestro simulado se busca en memoria', () => {
    expect(service.minSearchLength()).toBe(0)
  })
})

describe('VismaService contra TuRecibo', () => {
  let post: jest.Mock
  let get: jest.Mock
  let httpService: HttpService

  beforeEach(() => {
    post = jest.fn().mockReturnValue(of({ data: { jwt: jwtWithExp(43200) } }))
    get = jest.fn().mockReturnValue(of({ data: { data: [row()] } }))
    httpService = { post, get } as unknown as HttpService
  })

  it('hace el login documentado: JSON con user y password', async () => {
    const service = new VismaService(httpService, buildLiveConfig())
    await service.search({ search: 'gar' })

    const [url, body, options] = post.mock.calls[0]
    expect(url).toBe('https://api.stage.turecibo.com/v2/auth-mod/login')
    expect(body).toEqual({ user: 'demo_api_turecibo_pe', password: 'secreta' })
    expect(options.headers['Content-Type']).toBe('application/json')
  })

  it('busca con `filter` y el JWT como bearer', async () => {
    const service = new VismaService(httpService, buildLiveConfig())
    await service.search({ search: 'gar' })

    const [url, options] = get.mock.calls[0]
    expect(url).toBe('https://api.stage.turecibo.com/v2/admin-mod/users/search')
    expect(options.params).toEqual({ filter: 'gar' })
    expect(options.headers.Authorization).toMatch(/^Bearer /)
  })

  it('mapea la fila del buscador: nombre completo, documento y correo', async () => {
    const service = new VismaService(httpService, buildLiveConfig())
    const [person] = await service.search({ search: 'gar' })

    expect(person).toMatchObject({
      id: '1177106',
      fullName: 'LEANDRO ROYER MALDONADO GARCIA',
      document: '41591769',
      position: '',
      active: true,
      email: 'lmaldonadog@torreblanca.com.pe',
    })
  })

  it('no llama a la API con menos de 3 caracteres, que es lo que rechaza', async () => {
    const service = new VismaService(httpService, buildLiveConfig())
    expect(await service.search({ search: 'ga' })).toEqual([])
    expect(get).not.toHaveBeenCalled()
    expect(service.minSearchLength()).toBe(3)
  })

  it('reutiliza el token entre búsquedas: un solo login', async () => {
    const service = new VismaService(httpService, buildLiveConfig())
    await service.search({ search: 'gar' })
    await service.search({ search: 'per' })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('cachea por término: el mismo texto no vuelve a consultar', async () => {
    const service = new VismaService(httpService, buildLiveConfig())
    await service.search({ search: 'gar' })
    await service.search({ search: 'GAR ' })
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('un 404 es "sin coincidencias", no un fallo', async () => {
    get.mockReturnValue(throwError(() => httpError(404)))
    const service = new VismaService(httpService, buildLiveConfig())
    expect(await service.search({ search: 'aaa' })).toEqual([])
  })

  it('renueva el token una vez cuando la API responde 401', async () => {
    get
      .mockReturnValueOnce(throwError(() => httpError(401)))
      .mockReturnValueOnce(of({ data: { data: [row()] } }))

    const service = new VismaService(httpService, buildLiveConfig())
    const result = await service.search({ search: 'gar' })

    expect(result).toHaveLength(1)
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('vuelve a autenticarse cuando el JWT ya venía caducado', async () => {
    post.mockReturnValue(of({ data: { jwt: jwtWithExp(-10) } }))
    const service = new VismaService(httpService, buildLiveConfig())
    await service.search({ search: 'gar' })
    await service.search({ search: 'per' })
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('con VISMA_TOKEN fijo no hace login', async () => {
    const service = new VismaService(
      httpService,
      buildLiveConfig({ VISMA_TOKEN: 'fijo' })
    )
    await service.search({ search: 'gar' })
    expect(post).not.toHaveBeenCalled()
    expect(get.mock.calls[0][1].headers.Authorization).toBe('Bearer fijo')
  })

  it('sin credenciales avisa en vez de llamar a ciegas', async () => {
    const config = buildLiveConfig({
      VISMA_USERNAME: undefined,
      VISMA_PASSWORD: undefined,
    })
    const service = new VismaService(httpService, config)
    await expect(service.search({ search: 'gar' })).rejects.toThrow(
      /credenciales/i
    )
  })

  it('la ficha completa separa nombres y apellidos y trae el legajo', async () => {
    get.mockReturnValue(of({ data: detail() }))
    const service = new VismaService(httpService, buildLiveConfig())
    const person = await service.findById('1177106')

    expect(get.mock.calls[0][0]).toBe(
      'https://api.stage.turecibo.com/v2/admin-mod/users/1177106'
    )
    expect(person).toMatchObject({
      firstName: 'LEANDRO ROYER',
      lastName: 'MALDONADO GARCIA',
      fullName: 'MALDONADO GARCIA LEANDRO ROYER',
      document: '41591769',
      fileNumber: '417580',
      position: '',
      active: true,
      sector: 'G11',
    })
  })

  it('marca inactivo a quien ya no está vinculado', async () => {
    get.mockReturnValue(of({ data: detail({ estado_empresa: 0 }) }))
    const service = new VismaService(httpService, buildLiveConfig())
    expect((await service.findById('1177106'))?.active).toBe(false)
  })

  it('un cargo cargado en TuRecibo sí se refleja', async () => {
    get.mockReturnValue(of({ data: detail({ cargo: 'Jefe de Cubierta' }) }))
    const service = new VismaService(httpService, buildLiveConfig())
    expect((await service.findById('1177106'))?.position).toBe(
      'JEFE DE CUBIERTA'
    )
  })

  it('invalidate descarta token y caché', async () => {
    const service = new VismaService(httpService, buildLiveConfig())
    await service.search({ search: 'gar' })
    service.invalidate()
    await service.search({ search: 'gar' })
    expect(post).toHaveBeenCalledTimes(2)
    expect(get).toHaveBeenCalledTimes(2)
  })
})
