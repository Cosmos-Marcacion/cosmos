import request from 'supertest'
import { getConnectionToken } from '@nestjs/mongoose'
import type { Connection } from 'mongoose'
import { Types } from 'mongoose'
import { withMongo } from './support/mongo'
import { api, createTestApp, TestApp } from './support/app'
import { AllowAllGuard, bypassAuth } from '../src/testing/guards.mock'
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard'
import { MailService } from '../src/modules/mail/mail.service'

/**
 * Hallazgos de `Cosmos_CheckIn_Hallazgos.pdf` (CKI01-CKI19) contra la API real.
 *
 * Las e2e del panel los comprueban en pantalla con el servidor simulado. Aqui
 * se comprueba lo otro: que el servidor de verdad rechaza lo que tiene que
 * rechazar aunque alguien salte el formulario. CKI01, CKI03 y CKI04 estan en
 * `nombradas-y-formatos.int-spec.ts`; CKI16 y CKI17 son de la app movil.
 */

/** Correo de mentira: se puede hacer fallar como falla Gmail. */
const mail = {
  fail: false,
  sent: [] as { toEmail: string; code: string }[],
  async sendPasswordResetCode(params: { toEmail: string; code: string }) {
    if (mail.fail) {
      throw Object.assign(new Error('Invalid login'), {
        code: 'EAUTH',
        responseCode: 535,
      })
    }
    mail.sent.push(params)
  },
}

describe('Hallazgos CKI contra la API (integracion)', () => {
  withMongo()
  let ctx: TestApp
  let db: Connection

  beforeAll(async () => {
    process.env.AWS_REGION ??= 'us-east-1'
    process.env.AWS_ACCESS_KEY_ID ??= 'test'
    process.env.AWS_SECRET_ACCESS_KEY ??= 'test'
    process.env.NAMED_SYNC_ENABLED = 'false'
    // Mismo orden que app.module.ts: los servicios se importan en ciclo.
    const { PortModule } = await import('../src/modules/port/port.module')
    const { PointModule } = await import('../src/modules/point/point.module')
    await import('../src/modules/entry/entry.module')
    await import('../src/modules/employee/employee.module')
    await import('../src/modules/named/named.module')
    const { UserModule } = await import('../src/modules/user/user.module')
    const { AuthModule } = await import('../src/modules/auth/auth.module')
    ctx = await createTestApp(
      { imports: [PortModule, PointModule, UserModule, AuthModule] },
      builder =>
        bypassAuth(builder)
          .overrideGuard(JwtAuthGuard)
          .useClass(AllowAllGuard)
          .overrideProvider(MailService)
          .useValue(mail)
    )
    db = ctx.module.get<Connection>(getConnectionToken())
  }, 120_000)

  afterAll(async () => {
    await ctx?.app.close()
  })

  beforeEach(() => {
    mail.fail = false
    mail.sent = []
  })

  const http = () => request(ctx.server as never)

  async function roles() {
    const [superId, adminId, userId] = [
      new Types.ObjectId(),
      new Types.ObjectId(),
      new Types.ObjectId(),
    ]
    await db.collection('roles').insertMany([
      { _id: superId, name: 'Super', description: 'Super', modules: [] },
      {
        _id: adminId,
        name: 'Admin',
        description: 'Administrador',
        modules: [],
      },
      { _id: userId, name: 'User', description: 'Operador', modules: [] },
    ])
    return { superId, adminId, userId }
  }

  describe('usuarios (CKI02, CKI09, CKI13)', () => {
    it('CKI02: los perfiles asignables no incluyen al super administrador', async () => {
      await roles()
      const res = await http().get(api('/user/assignable-roles'))
      expect(res.status).toBe(200)
      expect(res.body.map((r: any) => r.name)).toEqual(['Admin', 'User'])
    })

    it.each([
      ['un nombre de un caracter', { name: 'A' }],
      ['un nombre con numeros', { name: 'Juan 123' }],
      ['un nombre con emojis', { name: 'al😆onso pena' }],
      ['un nombre con simbolos', { name: 'Ana @ # $' }],
      ['una contrasena de un digito', { password: '1' }],
      ['una contrasena sin numeros', { password: 'soloLetras' }],
      ['un correo invalido', { email: 'no-es-correo' }],
    ])('CKI09/CKI13: rechaza %s', async (_caso, cambio) => {
      const { userId } = await roles()
      const res = await http()
        .post(api('/user'))
        .send({
          email: 'ana@cosmos.com.pe',
          name: 'Ana María Ñañez',
          password: 'Clave2026',
          roleId: String(userId),
          ...cambio,
        })
      expect(res.status).toBe(400)
      expect(await db.collection('users').countDocuments()).toBe(0)
    })

    it('CKI13: con datos validos crea el usuario y CKI02 lista su perfil por nombre', async () => {
      const { userId } = await roles()
      const res = await http()
        .post(api('/user'))
        .send({
          email: 'ana@cosmos.com.pe',
          name: "  Ana María Ñañez-O'Neil  ",
          password: 'Clave2026',
          roleId: String(userId),
        })
      expect(res.status).toBe(201)
      const guardado = await db
        .collection('users')
        .findOne({ email: 'ana@cosmos.com.pe' })
      expect(guardado?.name).toBe("Ana María Ñañez-O'Neil")
      expect(guardado?.password).not.toBe('Clave2026')

      const lista = await http().get(api('/user/except-super/10/1'))
      expect(lista.status).toBe(200)
      const filas = lista.body.data ?? lista.body.users ?? lista.body
      const ana = (Array.isArray(filas) ? filas : []).find(
        (u: any) => u.email === 'ana@cosmos.com.pe'
      )
      expect(ana?.role).toBe('User')
    })
  })

  describe('puntos de marcacion (CKI07, CKI15)', () => {
    async function puertos() {
      const a = await http()
        .post(api('/port'))
        .send({ name: 'Paita', address: 'Muelle 1' })
      const b = await http()
        .post(api('/port'))
        .send({ name: 'Callao', address: 'Muelle 2' })
      return { paita: a.body._id as string, callao: b.body._id as string }
    }

    it.each([
      ['negativa', -5],
      ['con decimales', 2.5],
      ['mayor de 240', 241],
      ['nula', null],
      ['con letras', 'abc'],
    ])('CKI15: rechaza una tolerancia %s', async (_caso, valor) => {
      const { paita } = await puertos()
      const res = await http().post(api('/point')).send({
        name: 'Ingreso',
        portId: paita,
        previousTolerance: valor,
        nextTolerance: 10,
      })
      expect(res.status).toBe(400)
    })

    it('CKI15: acepta tolerancias enteras de 0 a 240', async () => {
      const { paita } = await puertos()
      const res = await http().post(api('/point')).send({
        name: 'Ingreso',
        portId: paita,
        previousTolerance: 0,
        nextTolerance: 240,
      })
      expect(res.status).toBe(201)
    })

    it('CKI09: rechaza un nombre de punto con emojis', async () => {
      const { paita } = await puertos()
      const res = await http()
        .post(api('/point'))
        .send({ name: 'Ingreso 😆', portId: paita })
      expect(res.status).toBe(400)
    })

    it('CKI07: un punto solo puede depender de otro del mismo puerto', async () => {
      const { paita, callao } = await puertos()
      const ingreso = await http()
        .post(api('/point'))
        .send({ name: 'Ingreso', portId: paita })
      expect(ingreso.status).toBe(201)

      const mismoPuerto = await http()
        .post(api('/point'))
        .send({ name: 'Salida', portId: paita, dependOnId: ingreso.body._id })
      expect(mismoPuerto.status).toBe(201)

      const otroPuerto = await http()
        .post(api('/point'))
        .send({ name: 'Garita', portId: callao, dependOnId: ingreso.body._id })
      expect(otroPuerto.status).toBe(400)
    })

    it('CKI07: un punto no puede depender de si mismo', async () => {
      const { paita } = await puertos()
      const ingreso = await http()
        .post(api('/point'))
        .send({ name: 'Ingreso', portId: paita })
      const res = await http()
        .patch(api(`/point/${ingreso.body._id}`))
        .send({ dependOnId: ingreso.body._id })
      expect(res.status).toBe(400)
    })
  })

  describe('recuperar la cuenta (CKI18, CKI19)', () => {
    async function usuario() {
      const { userId } = await roles()
      await http()
        .post(api('/user'))
        .send({
          email: 'ana@cosmos.com.pe',
          name: 'Ana Pérez',
          password: 'Clave2026',
          roleId: String(userId),
        })
    }

    it('CKI19: un correo no registrado se informa y no se envia nada', async () => {
      const res = await http()
        .post(api('/auth/password/send-code'))
        .send({ email: 'nadie@cosmos.com.pe' })
      expect(res.status).toBe(404)
      expect(res.body.message).toContain('no está registrado')
      expect(mail.sent).toHaveLength(0)
    })

    it('CKI18: si el correo no sale responde 503 con que hacer y no deja el codigo', async () => {
      await usuario()
      mail.fail = true
      const res = await http()
        .post(api('/auth/password/send-code'))
        .send({ email: 'ana@cosmos.com.pe' })
      expect(res.status).toBe(503)
      expect(res.body.message).toContain('Inténtalo de nuevo')
      expect(await db.collection('password_resets').countDocuments()).toBe(0)
    })

    it('CKI18/CKI19: un correo registrado recibe el codigo, no se reenvia al instante y el codigo cambia la contrasena', async () => {
      await usuario()
      const envio = await http()
        .post(api('/auth/password/send-code'))
        .send({ email: 'ana@cosmos.com.pe' })
      expect(envio.status).toBe(200)
      expect(mail.sent).toHaveLength(1)
      // El codigo guardado es el enviado: la comprobacion de arriba mira la
      // coleccion correcta.
      expect(
        await db
          .collection('password_resets')
          .countDocuments({ code: mail.sent[0].code })
      ).toBe(1)

      const otra = await http()
        .post(api('/auth/password/send-code'))
        .send({ email: 'ana@cosmos.com.pe' })
      expect(otra.status).toBe(429)

      const debil = await http().post(api('/auth/password/reset')).send({
        email: 'ana@cosmos.com.pe',
        code: mail.sent[0].code,
        newPassword: '123',
      })
      expect(debil.status).toBe(400)

      const mal = await http()
        .post(api('/auth/password/reset'))
        .send({
          email: 'ana@cosmos.com.pe',
          code: '000000' === mail.sent[0].code ? '111111' : '000000',
          newPassword: 'Nueva2026',
        })
      expect(mal.status).toBe(400)

      const bien = await http().post(api('/auth/password/reset')).send({
        email: 'ana@cosmos.com.pe',
        code: mail.sent[0].code,
        newPassword: 'Nueva2026',
      })
      expect(bien.status).toBe(200)
    })
  })
})
