import request from 'supertest'
import { PortModule } from '../src/modules/port/port.module'
import { withMongo } from './support/mongo'
import { api, createTestApp, TestApp } from './support/app'
import { bypassAuth } from '../src/testing/guards.mock'

/**
 * Integracion del modulo de puertos: HTTP -> ValidationPipe -> controlador ->
 * servicio -> Mongo.
 *
 * Es el modulo mas simple del backend, y por eso es el que sirve de piedra de
 * toque del arnes: si algo se rompe aqui, el problema esta en la
 * infraestructura de pruebas y no en el dominio.
 */
describe('Puertos (integracion)', () => {
  withMongo()
  let ctx: TestApp

  beforeAll(async () => {
    ctx = await createTestApp({ imports: [PortModule] }, bypassAuth)
  })

  afterAll(async () => {
    await ctx.app.close()
  })

  const crear = (body: unknown) =>
    request(ctx.server as never)
      .post(api('/port'))
      .send(body as object)

  describe('POST /port', () => {
    it('guarda el puerto y devuelve el documento con su id', async () => {
      const respuesta = await crear({
        name: 'Callao',
        address: 'Av. Contralmirante Mora 1',
      })

      expect(respuesta.status).toBe(201)
      expect(respuesta.body).toMatchObject({
        name: 'Callao',
        address: 'Av. Contralmirante Mora 1',
      })
      expect(respuesta.body._id).toEqual(expect.any(String))
    })

    it('rechaza un puerto sin nombre', async () => {
      const respuesta = await crear({ address: 'Sin nombre 1' })

      expect(respuesta.status).toBe(400)
      expect(JSON.stringify(respuesta.body.message)).toContain('name')
    })

    it('rechaza un nombre en blanco, no solo ausente', async () => {
      const respuesta = await crear({ name: '   ', address: 'Av. 1' })

      // `@IsNotEmpty` por si solo da por bueno '   '. El DTO recorta antes de
      // validar (`@Trim`), asi que el campo en blanco se rechaza en vez de
      // acabar como una fila vacia en pantalla y en el documento emitido.
      expect(respuesta.status).toBe(400)
      expect(JSON.stringify(respuesta.body.message)).toContain('name')
    })

    it('recorta los espacios sobrantes de los campos que si tienen contenido', async () => {
      const respuesta = await crear({
        name: '  Matarani  ',
        address: ' Muelle 2 ',
      })

      expect(respuesta.status).toBe(201)
      expect(respuesta.body.name).toBe('Matarani')
      expect(respuesta.body.address).toBe('Muelle 2')
    })

    it('descarta campos que el DTO no declara en vez de guardarlos', async () => {
      const respuesta = await crear({
        name: 'Paita',
        address: 'Muelle 3',
        isAdmin: true,
      })

      // `forbidNonWhitelisted` esta activo, asi que la API responde 400. Lo que
      // este test protege no es el codigo, es la propiedad: que nadie pueda
      // inyectar campos no declarados en un documento.
      expect(respuesta.status).toBe(400)
      expect(JSON.stringify(respuesta.body.message)).toContain('isAdmin')
    })

    it('no admite dos puertos con el mismo nombre', async () => {
      await crear({ name: 'Salaverry', address: 'Muelle 1' }).expect(201)
      const repetido = await crear({ name: 'Salaverry', address: 'Muelle 2' })

      expect(repetido.status).toBeGreaterThanOrEqual(400)
    })
  })

  describe('GET /port/:limit/:page', () => {
    beforeEach(async () => {
      await crear({ name: 'Callao', address: 'A' })
      await crear({ name: 'Paita', address: 'B' })
      await crear({ name: 'Ilo', address: 'C' })
    })

    it('devuelve la pagina pedida con su metadato', async () => {
      const respuesta = await request(ctx.server as never).get(api('/port/2/1'))

      expect(respuesta.status).toBe(200)
      expect(respuesta.body.data).toHaveLength(2)
      expect(respuesta.body).toMatchObject({ page: 1, limit: 2 })
    })

    it('la segunda pagina no repite los de la primera', async () => {
      const primera = await request(ctx.server as never).get(api('/port/2/1'))
      const segunda = await request(ctx.server as never).get(api('/port/2/2'))

      const idsPrimera = primera.body.data.map((p: { _id: string }) => p._id)
      const idsSegunda = segunda.body.data.map((p: { _id: string }) => p._id)

      expect(idsSegunda).toHaveLength(1)
      expect(idsPrimera).not.toContain(idsSegunda[0])
    })

    it('filtra por nombre con el parametro search', async () => {
      const respuesta = await request(ctx.server as never).get(
        api('/port/10/1?search=pai')
      )

      expect(respuesta.body.data).toHaveLength(1)
      expect(respuesta.body.data[0].name).toBe('Paita')
    })

    it('trata la busqueda como texto, no como expresion regular', async () => {
      // `search` entraba directo en un `$regex`: un parentesis suelto tumbaba
      // la peticion con un 500 y `.*` devolvia la coleccion entera saltandose
      // el filtro. `buildSearchFilter` escapa los metacaracteres.
      const parentesis = await request(ctx.server as never).get(
        api('/port/10/1?search=%28')
      )
      expect(parentesis.status).toBe(200)
      expect(parentesis.body.data).toHaveLength(0)

      const comodin = await request(ctx.server as never).get(
        api('/port/10/1?search=.*')
      )
      expect(comodin.status).toBe(200)
      expect(comodin.body.data).toHaveLength(0)
    })

    it('ignora una busqueda que es solo espacios', async () => {
      const respuesta = await request(ctx.server as never).get(
        api('/port/10/1?search=%20%20')
      )

      expect(respuesta.status).toBe(200)
      expect(respuesta.body.data).toHaveLength(3)
    })
  })

  describe('GET, PATCH y DELETE /port/:id', () => {
    let id: string

    beforeEach(async () => {
      const creado = await crear({ name: 'Chimbote', address: 'Muelle 5' })
      id = creado.body._id
    })

    it('devuelve el puerto por su id', async () => {
      const respuesta = await request(ctx.server as never).get(
        api(`/port/${id}`)
      )

      expect(respuesta.status).toBe(200)
      expect(respuesta.body.name).toBe('Chimbote')
    })

    it('actualiza y devuelve el documento ya modificado', async () => {
      const respuesta = await request(ctx.server as never)
        .patch(api(`/port/${id}`))
        .send({ address: 'Muelle 9' })

      expect(respuesta.status).toBe(200)
      expect(respuesta.body.address).toBe('Muelle 9')
    })

    it('borra el puerto y deja de encontrarlo', async () => {
      await request(ctx.server as never)
        .delete(api(`/port/${id}`))
        .expect(200)

      const despues = await request(ctx.server as never).get(api(`/port/${id}`))
      expect(despues.body).toEqual({})
    })

    it('no revienta con un id que no es un ObjectId', async () => {
      const respuesta = await request(ctx.server as never).get(
        api('/port/no-es-un-id')
      )

      // Antes Mongoose lanzaba un CastError y salia un 500. `ParseObjectIdPipe`
      // lo corta en la ruta con un 400, que es lo que es: un error de quien pide.
      expect(respuesta.status).toBe(400)
    })

    it('rechaza con 400 una paginacion que no es un numero', async () => {
      const respuesta = await request(ctx.server as never).get(
        api('/port/diez/1')
      )

      expect(respuesta.status).toBe(400)
    })
  })
})
