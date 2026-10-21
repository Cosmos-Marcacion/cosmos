import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { createHash } from 'crypto'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { FormatDefinition } from '../v2/document-model'
import { SEED_DEFINITIONS } from '../v2/definitions/seed'
import {
  FormatDefinitionEntity,
  FormatDefinitionDocument,
  FormatDefinitionVersionEntity,
  FormatDefinitionVersionDocument,
} from './format-definition.entity'
import { ValidationIssue, validateDefinition } from './format-definition.validator'
import { DefinitionDiff, diffDefinitions } from './format-definition.diff'

/**
 * La constancia de un borrador que se quedo atras.
 *
 * No es un error: el borrador sigue guardado y se puede cargar. Es lo que el
 * maestro necesita para decir por que no lo esta ensenando.
 */
export interface StaleDraft {
  /** Version publicada de la que salio. `null` si es anterior a que se anotara. */
  baseVersion: number | null
  publishedVersion: number
  updatedBy?: string
  updatedAt?: Date
}

/**
 * Las definiciones de formato: borrador, publicada e historial.
 *
 * Tres reglas, y las tres son deliberadas:
 *
 * 1. **Se siembra desde codigo la primera vez.** Un despliegue en limpio tiene
 *    definiciones que funcionan sin que nadie entre al maestro. A partir de ahi
 *    manda la base de datos, y el codigo deja de tener voz: si la siembra
 *    pisara lo publicado, cada despliegue desharia lo que el cliente configuro.
 * 2. **El borrador se guarda aunque no valide.** Configurar es un proceso; una
 *    seccion a medias tiene que poder dejarse para mañana.
 * 3. **Publicar valida.** Es el unico momento en que la definicion pasa a
 *    emitir documentos de verdad, y es donde se comprueba todo.
 */
@Injectable()
export class FormatDefinitionService {
  private readonly logger = new Logger(FormatDefinitionService.name)

  constructor(
    @InjectModel(FormatDefinitionEntity.name)
    private readonly model: Model<FormatDefinitionEntity>,
    @InjectModel(FormatDefinitionVersionEntity.name)
    private readonly versions: Model<FormatDefinitionVersionEntity>
  ) { }

  private toDefinition(row: FormatDefinitionDocument): FormatDefinition {
    return {
      formatType: row.formatType,
      label: row.label,
      version: row.version,
      documents: row.documents as any,
    }
  }

  /** Tipos de formato con definicion, sembrando los que falten. */
  async listTypes(): Promise<{ formatType: string; label: string; version: number; hasDraft: boolean }[]> {
    await this.seedMissing()
    const rows = await this.model.find().lean<FormatDefinitionDocument[]>().exec()
    const byType = new Map<string, { published?: FormatDefinitionDocument; draft?: FormatDefinitionDocument }>()
    for (const row of rows) {
      const entry = byType.get(row.formatType) ?? {}
      entry[row.status] = row
      byType.set(row.formatType, entry)
    }
    return [...byType.entries()].map(([formatType, entry]) => ({
      formatType,
      label: entry.published?.label ?? entry.draft?.label ?? formatType,
      version: entry.published?.version ?? 0,
      hasDraft: !!entry.draft,
    }))
  }

  /** Huella del contenido de una definicion de fabrica. */
  private seedHashOf(seed: FormatDefinition): string {
    return createHash('sha1').update(JSON.stringify(seed.documents)).digest('hex')
  }

  /**
   * Quien puso una definicion publicada.
   *
   * Una fila sin `origin` es **anterior** a este campo, y se trata como de
   * fabrica. No se mira `updatedBy`: la siembra antigua tambien lo escribia, y
   * dar por configurada del cliente cualquier fila que lo trajera dejo a
   * "Mercaderia general" congelada en su definicion de tres documentos
   * —asistencia, charla e ingles— mientras las otras dos plantillas ya iban por
   * los cuatro. Es justo el problema que este mecanismo viene a resolver.
   *
   * Publicar desde el maestro escribe `origin: 'user'` desde que existe el
   * campo, asi que una configuracion de verdad nunca se confunde con una
   * siembra. Y lo que hubiera antes sigue en el historial de versiones.
   */
  private originOf(row: FormatDefinitionDocument): 'seed' | 'user' {
    return row.origin ?? 'seed'
  }


  /**
   * La definicion que emite los formatos.
   *
   * Tres casos, y el del medio es el que faltaba:
   *
   * 1. **No hay ninguna publicada**: se siembra desde codigo. Es lo que hace
   *    que un despliegue en limpio funcione sin configuracion previa.
   * 2. **Hay una de fabrica y las plantillas han cambiado**: se actualiza. Sin
   *    esto, una instalacion que ya tenia definiciones publicadas seguia
   *    emitiendo los documentos antiguos despues de desplegar, y no habia forma
   *    de refrescarlas sin entrar a la base de datos.
   * 3. **Hay una publicada desde el maestro**: no se toca nunca. Lo que alguien
   *    configuro no lo pisa un despliegue; para volver a fabrica esta
   *    `restoreFactory`, que es una accion explicita.
   */
  async getPublished(formatType: string): Promise<FormatDefinition> {
    const seed = SEED_DEFINITIONS[formatType]
    const row = await this.model
      .findOne({ formatType, status: 'published' })
      .lean<FormatDefinitionDocument>()
      .exec()

    if (row) {
      const outdatedSeed =
        seed &&
        this.originOf(row) === 'seed' &&
        row.seedHash !== this.seedHashOf(seed)
      if (!outdatedSeed) {
        return this.toDefinition(row)
      }
      this.logger.log(
        `Las definiciones de fabrica de "${formatType}" han cambiado; se actualiza la publicada.`
      )
      return this.writeSeed(formatType, seed, (row.version ?? 0) + 1)
    }

    if (!seed) {
      throw new NotFoundException(`No hay definicion de formato para "${formatType}"`)
    }
    return this.writeSeed(formatType, seed, seed.version ?? 1)
  }

  /** Publica una definicion de fabrica y la anota en el historial. */
  private async writeSeed(
    formatType: string,
    seed: FormatDefinition,
    version: number
  ): Promise<FormatDefinition> {
    const body = { ...seed, version }
    await this.model.updateOne(
      { formatType, status: 'published' },
      {
        $set: {
          ...body,
          status: 'published',
          origin: 'seed',
          seedHash: this.seedHashOf(seed),
          publishedAt: new Date(),
          updatedBy: 'sistema',
        },
      },
      { upsert: true }
    )
    await this.versions.updateOne(
      { formatType, version },
      { $set: { ...body, publishedAt: new Date(), publishedBy: 'sistema' } },
      { upsert: true }
    )
    return body
  }

  /**
   * Devuelve un tipo de formato a las definiciones de fabrica.
   *
   * Es la salida para una definicion que se configuro a mano y se quiere
   * rehacer: el despliegue no la toca por si sola, asi que hace falta pedirlo.
   * Sube version y queda en el historial, de modo que lo anterior se puede
   * recuperar.
   */
  async restoreFactory(formatType: string, requestedBy?: string): Promise<FormatDefinition> {
    const seed = SEED_DEFINITIONS[formatType]
    if (!seed) {
      throw new NotFoundException(`No hay definicion de fabrica para "${formatType}"`)
    }
    const current = await this.model
      .findOne({ formatType, status: 'published' })
      .lean<FormatDefinitionDocument>()
      .exec()

    this.logger.log(`${requestedBy ?? 'alguien'} restauro "${formatType}" a las definiciones de fabrica.`)
    await this.model.deleteOne({ formatType, status: 'draft' })
    return this.writeSeed(formatType, seed, (current?.version ?? 0) + 1)
  }

  /**
   * El borrador en curso, o una copia de lo publicado si aun no hay ninguno.
   *
   * **Un borrador que se ha quedado atras no se sirve.** La definicion
   * publicada avanza sola cuando cambian las plantillas de fabrica, y hasta
   * ahora el borrador guardado antes se devolvia tal cual por encima de ella:
   * el maestro ensenaba los documentos antiguos, nada decia que hubiera algo
   * mas nuevo debajo, y publicar desde ahi habria devuelto el formato al estado
   * anterior sin que nadie lo pidiera.
   *
   * Tampoco se borra. Puede tener horas de trabajo dentro, asi que se deja
   * donde esta y se avisa: `staleDraft` lleva de que version salio, quien lo
   * dejo y cuando, y el maestro ofrece descartarlo o cargarlo a proposito.
   */
  async getDraft(formatType: string): Promise<FormatDefinition> {
    const { definition } = await this.getDraftState(formatType)
    return definition
  }

  /**
   * El borrador y, si se ha quedado atras, la constancia de que existe.
   */
  async getDraftState(formatType: string): Promise<{
    definition: FormatDefinition
    stale: StaleDraft | null
  }> {
    const row = await this.model
      .findOne({ formatType, status: 'draft' })
      .lean<FormatDefinitionDocument>()
      .exec()

    if (!row) {
      return { definition: await this.getPublished(formatType), stale: null }
    }

    // `getPublished` puede actualizar la publicada, asi que se pide **antes**
    // de comparar: si no, un borrador recien quedado atras pareceria al dia.
    const published = await this.getPublished(formatType)

    // Sin `baseVersion` el borrador es anterior a que se llevara la cuenta, y
    // eso solo puede significar que se guardo antes de este cambio.
    const base = row.baseVersion
    const atrasado = base === undefined || base < published.version
    if (!atrasado) {
      return { definition: this.toDefinition(row), stale: null }
    }

    this.logger.warn(
      `El borrador de "${formatType}" salio de la version ${base ?? 'desconocida'} ` +
      `y lo publicado va por la ${published.version}; se sirve lo publicado.`
    )
    return {
      definition: published,
      stale: {
        baseVersion: base ?? null,
        publishedVersion: published.version,
        updatedBy: row.updatedBy,
        updatedAt: row.updatedAt,
      },
    }
  }

  /** El borrador tal cual esta guardado, sin comprobar si se quedo atras. */
  async getDraftAnyway(formatType: string): Promise<FormatDefinition> {
    const row = await this.model
      .findOne({ formatType, status: 'draft' })
      .lean<FormatDefinitionDocument>()
      .exec()
    if (!row) {
      throw new NotFoundException(`No hay borrador de "${formatType}"`)
    }
    return this.toDefinition(row)
  }

  /** Guarda el borrador. No valida: configurar es un proceso. */
  async saveDraft(
    formatType: string,
    definition: FormatDefinition,
    updatedBy?: string
  ): Promise<{ definition: FormatDefinition; issues: ValidationIssue[] }> {
    const published = await this.model
      .findOne({ formatType, status: 'published' })
      .lean<FormatDefinitionDocument>()
      .exec()

    const body = {
      formatType,
      label: definition.label ?? formatType,
      // El borrador conserva la version publicada; la sube el publicado.
      version: published?.version ?? 1,
      // De que version salio. Es lo que permite saber despues si se quedo
      // atras porque la publicada avanzo por su cuenta.
      baseVersion: published?.version ?? 1,
      documents: definition.documents ?? [],
      updatedBy,
    }
    await this.model.updateOne(
      { formatType, status: 'draft' },
      { $set: { ...body, status: 'draft' } },
      { upsert: true }
    )

    // Se devuelven los avisos para que el maestro los pinte mientras se edita,
    // sin impedir el guardado.
    return {
      definition: { ...body, documents: body.documents as any },
      issues: validateDefinition({ ...body, documents: body.documents as any }),
    }
  }

  /**
   * Publica el borrador. Sube la version y guarda el historial.
   *
   * Aqui si se valida: a partir de este momento la definicion emite documentos
   * que se firman y se auditan.
   */
  async publish(formatType: string, publishedBy?: string): Promise<FormatDefinition> {
    const draft = await this.model
      .findOne({ formatType, status: 'draft' })
      .lean<FormatDefinitionDocument>()
      .exec()
    if (!draft) {
      throw new BadRequestException(`No hay borrador que publicar en "${formatType}"`)
    }

    const candidate = this.toDefinition(draft)
    const issues = validateDefinition(candidate)
    if (issues.length > 0) {
      throw new BadRequestException({
        message: 'La definicion tiene errores y no se puede publicar',
        issues,
      })
    }

    const published = await this.model
      .findOne({ formatType, status: 'published' })
      .lean<FormatDefinitionDocument>()
      .exec()
    const version = (published?.version ?? 0) + 1
    const body = { ...candidate, version }

    await this.model.updateOne(
      { formatType, status: 'published' },
      {
        $set: {
          ...body,
          status: 'published',
          publishedAt: new Date(),
          updatedBy: publishedBy,
          // A partir de aqui es del cliente: ningun despliegue la pisa.
          origin: 'user',
          seedHash: null,
        },
      },
      { upsert: true }
    )
    await this.versions.create({ ...body, publishedBy, publishedAt: new Date() })
    // El borrador se retira: lo que hay publicado ya es lo que decia.
    await this.model.deleteOne({ formatType, status: 'draft' })

    return body
  }

  /** Descarta el borrador y vuelve a lo publicado. */
  async discardDraft(formatType: string): Promise<FormatDefinition> {
    await this.model.deleteOne({ formatType, status: 'draft' })
    return this.getPublished(formatType)
  }

  async listVersions(formatType: string) {
    return this.versions
      .find({ formatType }, { documents: 0 })
      .sort({ version: -1 })
      .lean()
      .exec()
  }

  /** Una publicacion del historial, con su definicion entera. */
  async getVersion(formatType: string, version: number): Promise<FormatDefinition> {
    const found = await this.versions
      .findOne({ formatType, version })
      .lean<FormatDefinitionVersionDocument>()
      .exec()
    if (!found) {
      throw new NotFoundException(`No existe la version ${version} de "${formatType}"`)
    }
    return {
      formatType,
      label: found.label,
      version: found.version,
      documents: found.documents as any,
    }
  }

  /**
   * La publicacion inmediatamente anterior a una dada.
   *
   * No es `version - 1`: el historial puede tener huecos si una fila se borro
   * a mano, y restaurar de fabrica o revertir tampoco garantizan que los
   * numeros vayan seguidos. Se busca la mayor por debajo.
   */
  private async previousVersion(
    formatType: string,
    version: number
  ): Promise<FormatDefinition | null> {
    const found = await this.versions
      .findOne({ formatType, version: { $lt: version } })
      .sort({ version: -1 })
      .lean<FormatDefinitionVersionDocument>()
      .exec()
    if (!found) {
      return null
    }
    return {
      formatType,
      label: found.label,
      version: found.version,
      documents: found.documents as any,
    }
  }

  /**
   * Que cambio en una publicacion respecto a la anterior.
   *
   * `against` permite comparar contra cualquier otra version del historial,
   * que es lo que hace falta para responder "que ha cambiado desde que firme
   * el formato de marzo" sin ir publicacion por publicacion.
   */
  async getVersionChanges(
    formatType: string,
    version: number,
    against?: number
  ): Promise<DefinitionDiff> {
    const target = await this.getVersion(formatType, version)
    const base =
      against === undefined
        ? await this.previousVersion(formatType, version)
        : await this.getVersion(formatType, against)
    return diffDefinitions(base, target)
  }

  /**
   * Que tiene el borrador que no tenga lo publicado.
   *
   * Es la parte del historial que todavia no ha ocurrido: quien va a publicar
   * puede ver la lista de lo que va a cambiar antes de que empiece a emitir
   * documentos firmados. Sin borrador la respuesta es una lista vacia, no un
   * error: "no hay nada pendiente" es una respuesta legitima.
   */
  async getDraftChanges(formatType: string): Promise<DefinitionDiff> {
    const published = await this.getPublished(formatType)
    const row = await this.model
      .findOne({ formatType, status: 'draft' })
      .lean<FormatDefinitionDocument>()
      .exec()
    if (!row) {
      return {
        from: published.version,
        to: published.version,
        changes: [],
        summary: { added: 0, removed: 0, changed: 0, moved: 0 },
        truncated: false,
      }
    }
    return diffDefinitions(published, this.toDefinition(row))
  }

  /**
   * Trae una version del historial al borrador.
   *
   * No republica sola: deja el borrador cargado para que quien revierte lo vea
   * antes de publicarlo. Revertir a ciegas en un documento que se audita es
   * justo lo que no conviene.
   */
  async revertTo(formatType: string, version: number, updatedBy?: string): Promise<FormatDefinition> {
    const found = await this.versions
      .findOne({ formatType, version })
      .lean<FormatDefinitionVersionDocument>()
      .exec()
    if (!found) {
      throw new NotFoundException(`No existe la version ${version} de "${formatType}"`)
    }
    const restored: FormatDefinition = {
      formatType,
      label: found.label,
      version: found.version,
      documents: found.documents as any,
    }
    await this.saveDraft(formatType, restored, updatedBy)
    return restored
  }

  /**
   * Siembra o actualiza los tipos de fabrica.
   *
   * Llama a `getPublished`, que decide: sembrar si falta, actualizar si la de
   * fabrica cambio, y no tocar la que alguien haya publicado. Antes solo miraba
   * si existia, y por eso las plantillas nuevas no llegaban nunca a una
   * instalacion que ya tenia definiciones.
   */
  private async seedMissing(): Promise<void> {
    for (const formatType of Object.keys(SEED_DEFINITIONS)) {
      await this.getPublished(formatType)
    }
  }
}
