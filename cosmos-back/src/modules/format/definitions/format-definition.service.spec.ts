import { FormatDefinitionService } from './format-definition.service'
import { SEED_DEFINITIONS } from '../v2/definitions/seed'

/**
 * El ciclo de vida de una definicion publicada.
 *
 * Lo que estas pruebas fijan es el caso que fallaba en produccion: una
 * instalacion que ya tenia definiciones sembradas se quedaba con ellas para
 * siempre. La siembra solo escribia cuando no habia ninguna, asi que al
 * desplegar plantillas nuevas el panel seguia mostrando los documentos
 * antiguos, sin imagenes y con hojas que ya no existen, y no habia forma de
 * refrescarlas sin entrar a la base de datos.
 *
 * La regla que lo arregla tiene dos mitades y las dos importan: lo de fabrica
 * se actualiza solo, y lo que alguien configuro no se toca nunca.
 */

interface Row {
  formatType: string
  status: 'draft' | 'published'
  [key: string]: any
}

class FakeModel {
  rows: Row[] = []

  findOne(filter: any) {
    const found = this.rows.find(row =>
      Object.entries(filter).every(([key, value]) => row[key] === value)
    )
    return { lean: () => ({ exec: async () => found ?? null }) }
  }

  find() {
    return { lean: () => ({ exec: async () => this.rows }) }
  }

  async updateOne(filter: any, update: any, options: any = {}) {
    const index = this.rows.findIndex(row =>
      Object.entries(filter).every(([key, value]) => row[key] === value)
    )
    const body = { ...filter, ...update.$set }
    if (index >= 0) {
      this.rows[index] = { ...this.rows[index], ...body }
    } else if (options.upsert) {
      this.rows.push(body)
    }
  }

  async deleteOne(filter: any) {
    this.rows = this.rows.filter(row =>
      !Object.entries(filter).every(([key, value]) => row[key] === value)
    )
  }

  async create(row: Row) {
    this.rows.push({ ...row })
    return row
  }

  async exists(filter: any) {
    return this.rows.some(row =>
      Object.entries(filter).every(([key, value]) => row[key] === value)
    )
  }
}

describe('FormatDefinitionService', () => {
  let model: FakeModel
  let versions: FakeModel
  let service: FormatDefinitionService

  const TYPE = 'GRANEL'
  const seed = () => SEED_DEFINITIONS[TYPE]

  beforeEach(() => {
    model = new FakeModel()
    versions = new FakeModel()
    service = new FormatDefinitionService(model as any, versions as any)
  })

  const published = () => model.rows.find(row => row.status === 'published')

  describe('siembra', () => {
    it('publica las definiciones de fabrica cuando no hay ninguna', async () => {
      const definition = await service.getPublished(TYPE)

      expect(definition.documents.map(document => document.id))
        .toEqual(['asistencia', 'charla', 'pts', 'ats'])
      expect(published()?.origin).toBe('seed')
      expect(published()?.seedHash).toBeTruthy()
    })

    it('la anota en el historial', async () => {
      await service.getPublished(TYPE)
      expect(versions.rows.length).toBe(1)
      expect(versions.rows[0].publishedBy).toBe('sistema')
    })

    it('no vuelve a escribir si nada ha cambiado', async () => {
      await service.getPublished(TYPE)
      const version = published()?.version
      await service.getPublished(TYPE)
      expect(published()?.version).toBe(version)
    })
  })

  describe('actualizacion de las definiciones de fabrica', () => {
    it('actualiza cuando las plantillas cambian', async () => {
      // Una instalacion sembrada con una version anterior.
      model.rows.push({
        formatType: TYPE, status: 'published', label: 'Granel', version: 1,
        origin: 'seed', seedHash: 'huella-antigua',
        documents: [{ id: 'ingles', name: 'INGLÉS', orientation: 'portrait', sections: [] }],
      })

      const definition = await service.getPublished(TYPE)

      expect(definition.documents.map(document => document.id))
        .toEqual(['asistencia', 'charla', 'pts', 'ats'])
      expect(definition.version).toBe(2)
      expect(published()?.seedHash).not.toBe('huella-antigua')
    })

    it('trata como de fabrica una fila anterior a que existiera el campo', async () => {
      // Las sembradas por la version anterior no traen `origin` ni `updatedBy`.
      model.rows.push({
        formatType: TYPE, status: 'published', label: 'Granel', version: 3,
        documents: [{ id: 'ingles', name: 'INGLÉS', orientation: 'portrait', sections: [] }],
      })

      const definition = await service.getPublished(TYPE)

      expect(definition.documents.map(document => document.id))
        .toEqual(['asistencia', 'charla', 'pts', 'ats'])
      expect(definition.version).toBe(4)
    })

    it('no toca una definicion publicada desde el maestro', async () => {
      model.rows.push({
        formatType: TYPE, status: 'published', label: 'Granel', version: 7,
        origin: 'user', updatedBy: 'alguien@cosmos.com.pe',
        documents: [{ id: 'propio', name: 'PROPIO', orientation: 'portrait', sections: [] }],
      })

      const definition = await service.getPublished(TYPE)

      // Lo que alguien configuro no lo pisa un despliegue.
      expect(definition.documents.map(document => document.id)).toEqual(['propio'])
      expect(definition.version).toBe(7)
    })

    it('actualiza una fila antigua aunque traiga `updatedBy`', async () => {
      // La siembra antigua tambien escribia `updatedBy`, asi que no sirve para
      // distinguir una configuracion del cliente de una fila sembrada. Darla
      // por configurada dejo a "Mercaderia general" congelada en su definicion
      // de tres documentos mientras las otras dos ya iban por los cuatro.
      model.rows.push({
        formatType: TYPE, status: 'published', label: 'Granel', version: 2,
        updatedBy: 'alguien@cosmos.com.pe',
        documents: [
          { id: 'asistencia', name: 'ASISTENCIA', orientation: 'portrait', sections: [] },
          { id: 'charla', name: 'CHARLA', orientation: 'portrait', sections: [] },
          { id: 'ingles', name: 'INGLÉS', orientation: 'portrait', sections: [] },
        ],
      })

      const definition = await service.getPublished(TYPE)

      expect(definition.documents.map(document => document.id))
        .toEqual(['asistencia', 'charla', 'pts', 'ats'])
      expect(definition.version).toBe(3)
      expect(published()?.origin).toBe('seed')
    })

    it('sigue sin tocar lo publicado desde el maestro, que si trae `origin`', async () => {
      model.rows.push({
        formatType: TYPE, status: 'published', label: 'Granel', version: 2,
        origin: 'user', updatedBy: 'alguien@cosmos.com.pe',
        documents: [{ id: 'propio', name: 'PROPIO', orientation: 'portrait', sections: [] }],
      })

      const definition = await service.getPublished(TYPE)
      expect(definition.documents.map(document => document.id)).toEqual(['propio'])
    })
  })

  /**
   * Un borrador que se ha quedado atras.
   *
   * La definicion publicada avanza sola cuando cambian las plantillas de
   * fabrica. El borrador guardado antes se servia tal cual por encima de ella:
   * el maestro ensenaba los documentos antiguos, nada decia que hubiera algo
   * mas nuevo debajo, y publicar desde ahi habria devuelto el formato al estado
   * anterior sin que nadie lo pidiera. Es el mismo fallo que congelo
   * "Mercaderia general", una capa mas arriba.
   */
  describe('borrador que se quedo atras', () => {
    const draft = () => model.rows.find(row => row.status === 'draft')

    it('sirve el borrador cuando salio de la version publicada', async () => {
      model.rows.push({
        formatType: TYPE, status: 'published', version: 4, origin: 'user',
        documents: [{ id: 'publicado', name: 'PUBLICADO', orientation: 'portrait', sections: [] }],
      })
      model.rows.push({
        formatType: TYPE, status: 'draft', version: 4, baseVersion: 4,
        documents: [{ id: 'borrador', name: 'BORRADOR', orientation: 'portrait', sections: [] }],
      })

      const state = await service.getDraftState(TYPE)

      expect(state.definition.documents.map(d => d.id)).toEqual(['borrador'])
      expect(state.stale).toBeNull()
    })

    it('con lo publicado por delante, sirve lo publicado y avisa', async () => {
      model.rows.push({
        formatType: TYPE, status: 'published', version: 7, origin: 'user',
        documents: [{ id: 'publicado', name: 'PUBLICADO', orientation: 'portrait', sections: [] }],
      })
      model.rows.push({
        formatType: TYPE, status: 'draft', version: 4, baseVersion: 4,
        updatedBy: 'alguien@cosmos.com.pe',
        documents: [{ id: 'viejo', name: 'VIEJO', orientation: 'portrait', sections: [] }],
      })

      const state = await service.getDraftState(TYPE)

      expect(state.definition.documents.map(d => d.id)).toEqual(['publicado'])
      expect(state.stale?.baseVersion).toBe(4)
      expect(state.stale?.publishedVersion).toBe(7)
      expect(state.stale?.updatedBy).toBe('alguien@cosmos.com.pe')
    })

    it('un borrador anterior a que se anotara la version se da por atrasado', async () => {
      // Sin `baseVersion` no hay forma de saber de donde salio, y darlo por
      // valido es justo lo que tapaba la definicion publicada.
      model.rows.push({
        formatType: TYPE, status: 'published', version: 2, origin: 'user',
        documents: [{ id: 'publicado', name: 'PUBLICADO', orientation: 'portrait', sections: [] }],
      })
      model.rows.push({
        formatType: TYPE, status: 'draft', version: 2,
        documents: [{ id: 'viejo', name: 'VIEJO', orientation: 'portrait', sections: [] }],
      })

      const state = await service.getDraftState(TYPE)

      expect(state.definition.documents.map(d => d.id)).toEqual(['publicado'])
      expect(state.stale?.baseVersion).toBeNull()
    })

    it('no borra el borrador atrasado: puede tener horas de trabajo dentro', async () => {
      model.rows.push({
        formatType: TYPE, status: 'published', version: 7, origin: 'user',
        documents: [{ id: 'publicado', name: 'PUBLICADO', orientation: 'portrait', sections: [] }],
      })
      model.rows.push({
        formatType: TYPE, status: 'draft', version: 4, baseVersion: 4,
        documents: [{ id: 'viejo', name: 'VIEJO', orientation: 'portrait', sections: [] }],
      })

      await service.getDraftState(TYPE)

      expect(draft()).toBeDefined()
      const recuperado = await service.getDraftAnyway(TYPE)
      expect(recuperado.documents.map(d => d.id)).toEqual(['viejo'])
    })

    it('la comparacion cuenta con que lo publicado se actualice al pedirlo', async () => {
      // `getPublished` puede subir la version de fabrica en la misma llamada.
      // Comparando contra la fila antigua, un borrador recien quedado atras
      // pareceria al dia.
      model.rows.push({
        formatType: TYPE, status: 'published', version: 3, origin: 'seed',
        seedHash: 'huella-antigua',
        documents: [{ id: 'antiguo', name: 'ANTIGUO', orientation: 'portrait', sections: [] }],
      })
      model.rows.push({
        formatType: TYPE, status: 'draft', version: 3, baseVersion: 3,
        documents: [{ id: 'viejo', name: 'VIEJO', orientation: 'portrait', sections: [] }],
      })

      const state = await service.getDraftState(TYPE)

      expect(state.stale?.publishedVersion).toBe(4)
      expect(state.definition.documents.map(d => d.id))
        .toEqual(['asistencia', 'charla', 'pts', 'ats'])
    })

    it('guardar un borrador anota de que version salio', async () => {
      model.rows.push({
        formatType: TYPE, status: 'published', version: 9, origin: 'user', documents: [],
      })

      await service.saveDraft(TYPE, { formatType: TYPE, label: 'Granel', version: 9, documents: [] } as never)

      expect(draft()?.baseVersion).toBe(9)
    })

    it('sin borrador se sirve lo publicado y no se avisa de nada', async () => {
      model.rows.push({
        formatType: TYPE, status: 'published', version: 4, origin: 'user',
        documents: [{ id: 'publicado', name: 'PUBLICADO', orientation: 'portrait', sections: [] }],
      })

      const state = await service.getDraftState(TYPE)

      expect(state.stale).toBeNull()
      expect(state.definition.documents.map(d => d.id)).toEqual(['publicado'])
    })
  })

  describe('restaurar de fabrica', () => {
    it('rehace una definicion configurada a mano', async () => {
      model.rows.push({
        formatType: TYPE, status: 'published', label: 'Granel', version: 7,
        origin: 'user', updatedBy: 'alguien@cosmos.com.pe',
        documents: [{ id: 'propio', name: 'PROPIO', orientation: 'portrait', sections: [] }],
      })

      const definition = await service.restoreFactory(TYPE, 'admin@cosmos.com.pe')

      expect(definition.documents.map(document => document.id))
        .toEqual(['asistencia', 'charla', 'pts', 'ats'])
      // Sube version, asi que lo anterior sigue en el historial.
      expect(definition.version).toBe(8)
      expect(published()?.origin).toBe('seed')
    })

    it('descarta el borrador en curso', async () => {
      model.rows.push({ formatType: TYPE, status: 'draft', version: 1, documents: [] })
      await service.restoreFactory(TYPE)
      expect(model.rows.some(row => row.status === 'draft')).toBe(false)
    })

    it('falla con un tipo que no existe de fabrica', async () => {
      await expect(service.restoreFactory('INVENTADO')).rejects.toThrow(/No hay definicion/)
    })
  })

  describe('publicar desde el maestro', () => {
    it('marca la definicion como del cliente', async () => {
      await service.getPublished(TYPE)
      await service.saveDraft(TYPE, seed(), 'alguien@cosmos.com.pe')

      await service.publish(TYPE, 'alguien@cosmos.com.pe')

      // A partir de aqui ningun despliegue la pisa.
      expect(published()?.origin).toBe('user')
      expect(published()?.seedHash).toBeNull()
    })

    it('rechaza publicar un borrador invalido', async () => {
      await service.saveDraft(
        TYPE,
        { formatType: TYPE, label: 'Granel', version: 1, documents: [] },
        'alguien@cosmos.com.pe'
      )
      await expect(service.publish(TYPE)).rejects.toThrow()
    })
  })

  it('lista los cinco tipos, sembrandolos si faltan', async () => {
    const types = await service.listTypes()
    expect(types.map(type => type.formatType).sort()).toEqual([
      'BIG_BAG',
      'CONTAINERO',
      'ETHANOL',
      'GRANEL',
      'MERCADERIA_GENERAL',
    ])
  })
})
