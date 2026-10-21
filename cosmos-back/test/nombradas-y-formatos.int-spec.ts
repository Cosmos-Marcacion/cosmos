import * as http from 'http'
import type { AddressInfo } from 'net'
import request from 'supertest'
import * as ExcelJS from 'exceljs'
import { getConnectionToken } from '@nestjs/mongoose'
import type { Connection } from 'mongoose'
import { Types } from 'mongoose'
import { withMongo } from './support/mongo'
import { api, createTestApp, TestApp } from './support/app'
import { AllowAllGuard, bypassAuth } from '../src/testing/guards.mock'
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard'

/**
 * Nombradas de Cosmos de punta a punta: `ListarNombradas` -> copia local ->
 * tablero, detalle y formato emitido.
 *
 * Cosmos es un servidor HTTP de verdad levantado en el propio test, que
 * responde con la forma que tiene hoy la API (con `code_type_vessel` y
 * `description_type_vessel`). Asi se prueba el cliente, el guardado en Mongo,
 * los endpoints y el Excel, no un mock del servicio.
 *
 * Cubre ademas los hallazgos del PDF que viven en el backend y que las e2e del
 * panel, que simulan el servidor, no pueden ver:
 * - CKI01: las marcaciones del detalle y las horas del Excel (hora de Lima).
 * - CKI03: la casilla NAVE del formato lleva la nave, no al jefe de cubierta.
 * - CKI04: el apellido no sale duplicado.
 */

const FECHA = '10/09/2026'
const FECHA_ISO = '2026-09-10'

const persona = (
  staffId: number,
  last: string,
  mother: string,
  first: string,
  doc: string
) => ({
  staff_transmission_id: 0,
  staff_vessel_id: 0,
  staff_transmission_detail_id: staffId * 10,
  staff_id: staffId,
  personal_id: doc,
  last_name: last,
  mother_last_name: mother,
  first_name: first,
  staff_role_type_id: 1,
  staff_role_type_description: 'ESTIBADOR',
  order_number: staffId,
  team_number: 1,
})

const nombrada = (id: number, vessel: string, tipo?: [string, string]) => ({
  staff_transmission_id: id,
  staff_vessel_id: id + 1000,
  vessel_description: vessel,
  voyage_number: 'V-1',
  location_id: 'PAI',
  worker_date: FECHA,
  shift_description: '07:00 - 15:00',
  pier_description: 'MUELLE 1',
  berth_description: 'A',
  staff_vessel_number: String(id),
  ...(tipo
    ? { code_type_vessel: tipo[0], description_type_vessel: tipo[1] }
    : {}),
  listStaffDetail: [
    // CKI04: Cosmos ya trae los dos apellidos en last_name.
    persona(101, 'TORRES ROMERO', 'ROMERO', 'JUAN', '40000101'),
    persona(102, 'ESPINOZA', 'RETO', 'HENRY', '40000102'),
  ],
})

/** Lo que devuelve hoy ListarNombradas: los seis tipos vistos, el vacio y uno sin el campo. */
const LISTADO = [
  nombrada(5001, 'NAVE ETANOL', ['ET', 'ETANOL']),
  nombrada(5002, 'NAVE CONTENEDORES', ['CO', 'CONTAINER']),
  nombrada(5003, 'NAVE GRANELERA', [' gr ', 'GRANEL']),
  nombrada(5004, 'NAVE SIN TIPO', ['', '']),
  nombrada(5005, 'NAVE MERCADERIA', ['ME', 'MERCADERIA']),
  nombrada(5006, 'NAVE BIG BAGS', ['BB', 'BIG BAGS']),
  nombrada(5007, 'NAVE VARILLAS', ['VA', 'VARILLAS']),
]

/** Cosmos de mentira: login y ListarNombradas. Cuenta las llamadas. */
function fakeCosmos() {
  const calls: string[] = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', chunk => (body += chunk))
    req.on('end', () => {
      calls.push(req.url ?? '')
      res.setHeader('content-type', 'application/json')
      if (req.url === '/api/Login/Autenticacion') {
        res.end(JSON.stringify({ token: 'token-de-prueba' }))
        return
      }
      if (req.url === '/api/Users/ListarNombradas') {
        const { sInitialDate } = JSON.parse(body || '{}')
        const listStaff = sInitialDate === FECHA ? LISTADO : []
        res.end(
          JSON.stringify({
            codigoRespuesta: listStaff.length ? '0' : '1',
            descripcionResp: 'OK',
            listStaff,
          })
        )
        return
      }
      res.statusCode = 404
      res.end('{}')
    })
  })
  return { server, calls }
}

describe('Nombradas de Cosmos, tipo de nave y formatos (integracion)', () => {
  withMongo()
  let ctx: TestApp
  let db: Connection
  const cosmos = fakeCosmos()

  beforeAll(async () => {
    await new Promise<void>(resolve =>
      cosmos.server.listen(0, '127.0.0.1', resolve)
    )
    const { port } = cosmos.server.address() as AddressInfo
    process.env.URL_COSMOS = `http://127.0.0.1:${port}/`
    process.env.USER_COSMOS = 'qa'
    process.env.PASSWORD_COSMOS = 'qa'
    process.env.NAMED_SYNC_ENABLED = 'false'
    process.env.AWS_REGION ??= 'us-east-1'
    process.env.AWS_ACCESS_KEY_ID ??= 'test'
    process.env.AWS_SECRET_ACCESS_KEY ??= 'test'
    process.env.FORMAT_ENGINE = 'v2'
    // El harness vacia Mongo tras cada test; la cache en memoria de nombradas
    // no, y serviria la respuesta anterior sin volver a guardarla.
    process.env.NAMEDS_CACHE_TTL_MS = '1'

    // Import diferido: los modulos leen el entorno al cargarse. Y en el orden de
    // `app.module.ts`: los servicios de puntos, marcaciones, empleados y
    // nombradas se importan en ciclo, y entrar por otro lado deja a PointService
    // sin EntryService.
    await import('../src/modules/point/point.module')
    await import('../src/modules/entry/entry.module')
    await import('../src/modules/employee/employee.module')
    const { NamedModule } = await import('../src/modules/named/named.module')
    const { FormatModule } = await import('../src/modules/format/format.module')
    // El controlador de formatos usa su propio JwtAuthGuard.
    ctx = await createTestApp(
      { imports: [NamedModule, FormatModule] },
      builder =>
        bypassAuth(builder).overrideGuard(JwtAuthGuard).useClass(AllowAllGuard)
    )
    db = ctx.module.get<Connection>(getConnectionToken())
  }, 120_000)

  afterAll(async () => {
    await ctx?.app.close()
    await new Promise(resolve => cosmos.server.close(resolve))
  })

  /** Personal registrado y marcaciones de entrada y salida (CKI01). */
  async function seedMarcaciones() {
    const port = new Types.ObjectId()
    const [inicio, fin] = [new Types.ObjectId(), new Types.ObjectId()]
    await db.collection('points').insertMany([
      {
        _id: inicio,
        portId: port,
        name: 'INGRESO',
        order: 1,
        previousTolerance: 0,
        nextTolerance: 0,
      },
      {
        _id: fin,
        portId: port,
        name: 'SALIDA',
        order: 2,
        previousTolerance: 0,
        nextTolerance: 0,
      },
    ])
    const juan = new Types.ObjectId()
    await db.collection('employees').insertMany([
      {
        _id: juan,
        id: 101,
        firstName: 'JUAN',
        lastName: 'TORRES ROMERO',
        document: '40000101',
        status: 'active',
      },
      {
        _id: new Types.ObjectId(),
        id: 102,
        firstName: 'HENRY',
        lastName: 'ESPINOZA RETO',
        document: '40000102',
        status: 'active',
      },
    ])
    // 12:05 y 20:02 UTC son 07:05 y 15:02 en Lima.
    await db.collection('entries').insertMany([
      {
        pointId: inicio,
        employeeId: juan,
        namedId: 5001,
        workerDate: FECHA_ISO,
        date: new Date('2026-09-10T12:05:00Z'),
        isAbsence: false,
        isRemate: false,
      },
      {
        pointId: fin,
        employeeId: juan,
        namedId: 5001,
        workerDate: FECHA_ISO,
        date: new Date('2026-09-10T20:02:00Z'),
        isAbsence: false,
        isRemate: false,
      },
    ])
  }

  const board = () =>
    request(ctx.server as never)
      .post(api('/named/board'))
      .send({ sInitialDate: FECHA, sFinalDate: FECHA })

  const excel = (id: number) =>
    request(ctx.server as never)
      .get(api(`/format/${id}`))
      .query({ workerDate: FECHA })
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => done(null, Buffer.concat(chunks)))
      })

  async function workbookOf(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as any)
    return workbook
  }

  function textOf(sheet: ExcelJS.Worksheet): string {
    const parts: string[] = []
    sheet.eachRow(row =>
      row.eachCell({ includeEmpty: false }, cell => {
        const value = cell.value as any
        parts.push(
          typeof value === 'string'
            ? value
            : (value?.richText?.map((p: any) => p.text).join('') ??
                String(value ?? ''))
        )
      })
    )
    return parts.join('\n')
  }

  describe('ListarNombradas con code_type_vessel', () => {
    it('el tablero expone el tipo de nave y el formato que le toca', async () => {
      const res = await board()
      expect(res.status).toBe(201)
      const porId = new Map<number, any>(
        res.body.map((row: any) => [row.staffTransmissionId, row])
      )

      expect(porId.get(5001).vesselType).toMatchObject({
        code: 'ET',
        description: 'ETANOL',
        formatType: 'ETHANOL',
        accepted: true,
        source: 'api',
      })
      expect(porId.get(5003).vesselType).toMatchObject({
        code: 'GR',
        formatType: 'GRANEL',
        accepted: true,
      })
      expect(porId.get(5005).vesselType).toMatchObject({
        code: 'ME',
        formatType: 'MERCADERIA_GENERAL',
        accepted: true,
      })
      for (const [id, code, description, formatType] of [
        [5002, 'CO', 'CONTAINER', 'CONTAINERO'],
        [5006, 'BB', 'BIG BAGS', 'BIG_BAG'],
      ] as const) {
        expect(porId.get(id).vesselType).toMatchObject({
          code,
          description,
          formatType,
          accepted: true,
        })
      }
      for (const id of [5004, 5007]) {
        expect({ id, ...porId.get(id).vesselType }).toMatchObject({
          id,
          formatType: '',
          accepted: false,
        })
        expect(porId.get(id).formatType).toBe('')
        expect(porId.get(id).ready).toBe(false)
      }
    })

    it('la copia local guarda los dos campos y los devuelve igual', async () => {
      await board()
      const guardadas = await db
        .collection('nameds')
        .find(
          {},
          {
            projection: {
              staffTransmissionId: 1,
              codeTypeVessel: 1,
              descriptionTypeVessel: 1,
            },
          }
        )
        .toArray()
      const et = guardadas.find(n => n.staffTransmissionId === 5001)
      expect(et).toMatchObject({
        codeTypeVessel: 'ET',
        descriptionTypeVessel: 'ETANOL',
      })
      expect(guardadas.find(n => n.staffTransmissionId === 5004)).toMatchObject(
        { codeTypeVessel: '', descriptionTypeVessel: '' }
      )

      // Servido desde la copia local, sin volver a Cosmos, el tipo sigue ahi.
      const antes = cosmos.calls.filter(url =>
        url.includes('ListarNombradas')
      ).length
      const detalle = await request(ctx.server as never)
        .get(api('/named/detail/5001'))
        .query({ workerDate: FECHA })
      expect(detalle.status).toBe(200)
      expect(detalle.body.vesselType).toMatchObject({
        code: 'ET',
        formatType: 'ETHANOL',
      })
      expect(
        cosmos.calls.filter(url => url.includes('ListarNombradas')).length
      ).toBe(antes)
    })

    it('el formato ya no se elige: guardar formatType en la ficha no cambia nada', async () => {
      const put = await request(ctx.server as never)
        .put(api('/named/records/5007'))
        .send({ workerDate: FECHA, formatType: 'GRANEL' })
      expect(put.status).toBe(200)
      const detalle = await request(ctx.server as never)
        .get(api('/named/detail/5007'))
        .query({ workerDate: FECHA })
      expect(detalle.body.vesselType).toMatchObject({
        code: 'VA',
        accepted: false,
      })
    })

    it('una copia guardada antes del campo usa el formato elegido a mano', async () => {
      await board()
      await db
        .collection('nameds')
        .updateOne(
          { staffTransmissionId: 5005 },
          { $unset: { codeTypeVessel: '', descriptionTypeVessel: '' } }
        )
      await db.collection('named_records').updateOne(
        { staffTransmissionId: 5005 },
        {
          $set: {
            staffTransmissionId: 5005,
            workerDateIso: FECHA_ISO,
            formatType: 'GRANEL',
          },
        },
        { upsert: true }
      )
      const detalle = await request(ctx.server as never)
        .get(api('/named/detail/5005'))
        .query({ workerDate: FECHA })
      expect(detalle.body.vesselType).toMatchObject({
        source: 'record',
        formatType: 'GRANEL',
        accepted: true,
      })
    })
  })

  describe('emision del formato segun el tipo de nave', () => {
    it.each([
      [5007, 'VA (VARILLAS)'],
      [5004, 'no trae tipo de nave'],
    ])(
      'rechaza la nombrada %s con 422 y sin gastar permiso de trabajo',
      async (id, motivo) => {
        const res = await request(ctx.server as never)
          .get(api(`/format/${id}`))
          .query({ workerDate: FECHA })
        expect(res.status).toBe(422)
        expect(res.body.message).toContain(motivo)
        const ficha = await db
          .collection('named_records')
          .findOne({ staffTransmissionId: id })
        expect(ficha?.workPermitNumber ?? null).toBeNull()
        // La vista de impresion tampoco lo compone.
        const doc = await request(ctx.server as never)
          .get(api(`/format/${id}/document`))
          .query({ workerDate: FECHA })
        expect(doc.status).toBe(422)
      }
    )

    it.each([
      [5001, 'ETHANOL'],
      [5003, 'GRANEL'],
      [5005, 'MERCADERIA_GENERAL'],
      [5002, 'CONTAINERO'],
      [5006, 'BIG_BAG'],
    ])(
      'la nombrada %s sale con el formato %s, cuatro hojas A4',
      async (id, tipo) => {
        await board()
        const res = await excel(id)
        expect(res.status).toBe(200)
        expect(res.headers['x-format-type']).toBe(tipo)
        const workbook = await workbookOf(res.body as Buffer)
        expect(workbook.worksheets).toHaveLength(4)
        for (const sheet of workbook.worksheets) {
          expect({
            hoja: sheet.name,
            papel: sheet.pageSetup.paperSize,
          }).toEqual({ hoja: sheet.name, papel: 9 })
        }
      }
    )
  })

  describe('hallazgos del PDF que viven en el backend', () => {
    it('CKI01: el detalle encuentra las marcaciones de la jornada', async () => {
      await seedMarcaciones()
      const detalle = await request(ctx.server as never)
        .get(api('/named/detail/5001'))
        .query({ workerDate: FECHA })
      expect(detalle.status).toBe(200)
      const juan = detalle.body.staff.find((p: any) => p.staffId === 101)
      expect(juan.markCount).toBe(2)
      expect(detalle.body.summary.presentCount).toBeGreaterThanOrEqual(1)
    })

    it('CKI01: el Excel imprime las horas en hora de Lima', async () => {
      await seedMarcaciones()
      const workbook = await workbookOf((await excel(5001)).body as Buffer)
      const asistencia = textOf(workbook.worksheets[0])
      expect(asistencia).toContain('07:05')
      expect(asistencia).toContain('15:02')
      expect(asistencia).not.toContain('12:05')
    })

    it('CKI03: la casilla NAVE lleva la nave, no al jefe de cubierta', async () => {
      await request(ctx.server as never)
        .put(api('/named/records/5001'))
        .send({
          workerDate: FECHA,
          jefeCubierta: {
            fullName: 'JEFE DE PRUEBA',
            document: '49999999',
            source: 'manual',
          },
        })
      const res = await request(ctx.server as never)
        .get(api('/format/5001/document'))
        .query({ workerDate: FECHA })
      expect(res.status).toBe(200)
      const asistencia = res.body.documents.find(
        (d: any) => d.id === 'asistencia'
      )
      const celdas: any[] = []
      for (const section of asistencia.sections) {
        if (section.kind !== 'rows') continue
        for (const row of section.rows) celdas.push(...row.cells)
      }
      const nave = celdas.findIndex(c =>
        /^NAVE:?$/i.test(String(c.text ?? '').trim())
      )
      expect(nave).toBeGreaterThanOrEqual(0)
      // La casilla de al lado es un dato y lleva la nave de la nombrada.
      expect(celdas[nave + 1]).toMatchObject({
        kind: 'data',
        text: 'NAVE ETANOL',
      })
      expect(JSON.stringify(celdas)).not.toContain('JEFE DE PRUEBA 49999999')
    })

    it('CKI04: el apellido paterno y materno no sale duplicado', async () => {
      const detalle = await request(ctx.server as never)
        .get(api('/named/detail/5001'))
        .query({ workerDate: FECHA })
      const nombres = detalle.body.staff.map((p: any) => p.fullName)
      expect(nombres).toContain('TORRES ROMERO JUAN')
      expect(nombres).toContain('ESPINOZA RETO HENRY')
      const workbook = await workbookOf((await excel(5001)).body as Buffer)
      const asistencia = textOf(workbook.worksheets[0])
      expect(asistencia).toContain('TORRES ROMERO JUAN')
      expect(asistencia).not.toContain('ROMERO ROMERO')
    })

    it('la vista de impresion lleva las hojas A4 de la plantilla original', async () => {
      const res = await request(ctx.server as never)
        .get(api('/format/5003/document'))
        .query({ workerDate: FECHA })
      expect(res.status).toBe(200)
      expect(
        res.body.documents.map((d: any) => [d.id, d.orientation, d.printPages])
      ).toEqual([
        ['asistencia', 'landscape', 1],
        ['charla', 'portrait', 1],
        ['pts', 'portrait', 2],
        ['ats', 'portrait', 2],
      ])
    })
  })
})
