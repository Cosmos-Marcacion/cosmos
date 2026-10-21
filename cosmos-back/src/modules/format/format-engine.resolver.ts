import { HttpException, HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common'
import {
  DEFAULT_FORMAT_ENGINE,
  FORMAT_ENGINE_V2,
  FormatEngine,
  FormatEngineId,
  parseFormatEngineId,
} from './format-engine'
import { FormatService } from './format.service'

/**
 * Quien decide que motor emite el formato.
 *
 * Es el unico sitio que lee `FORMAT_ENGINE`. Si algun dia hay que responder
 * "con que se genero esto", la respuesta esta aqui y no repartida por el
 * controlador y tres servicios.
 *
 * Se lee en cada peticion, no al arrancar: cambiar la variable y reiniciar el
 * proceso es suficiente, y en un despliegue con varias replicas no hay que
 * preocuparse de cual arranco antes.
 *
 * Un valor que no sea `legacy` ni `v2` no tumba el servicio: se avisa una vez y
 * se sigue con el motor por defecto. Un formato que sale es siempre mejor que un
 * arranque fallido por una errata en una variable de entorno.
 */
@Injectable()
export class FormatEngineResolver {
  private readonly logger = new Logger(FormatEngineResolver.name)

  /** Para no repetir el mismo aviso en cada descarga. */
  private warnedAbout: string | null = null

  constructor(
    private readonly legacy: FormatService,
    /**
     * El motor v2 se registra cuando exista. Mientras tanto pedirlo devuelve un
     * error claro en vez de un formato a medias.
     */
    @Optional() @Inject(FORMAT_ENGINE_V2) private readonly v2: FormatEngine | null = null
  ) { }

  /** Motor configurado en el entorno. */
  configured(): FormatEngineId {
    const raw = process.env.FORMAT_ENGINE
    const parsed = parseFormatEngineId(raw)
    if (!parsed && raw && this.warnedAbout !== raw) {
      this.warnedAbout = raw
      this.logger.warn(
        `FORMAT_ENGINE="${raw}" no es un motor conocido; se usa "${DEFAULT_FORMAT_ENGINE}".`
      )
    }
    return parsed ?? DEFAULT_FORMAT_ENGINE
  }

  /** Si se admite forzar el motor por peticion. Solo para pruebas. */
  private overrideAllowed(): boolean {
    return (process.env.FORMAT_ENGINE_ALLOW_OVERRIDE ?? '').trim().toLowerCase() === 'true'
  }

  /**
   * Motor con el que atender esta peticion.
   *
   * `requested` viene del parametro `engine` de la URL y solo se tiene en cuenta
   * con `FORMAT_ENGINE_ALLOW_OVERRIDE=true`. Sin eso se ignora en silencio: no
   * interesa que una URL compartida por chat cambie el formato que emite
   * produccion.
   */
  resolve(requested?: string): FormatEngine {
    const wanted = (this.overrideAllowed() ? parseFormatEngineId(requested) : null)
      ?? this.configured()

    if (wanted === 'legacy') {
      return this.legacy
    }

    if (!this.v2) {
      throw new HttpException(
        'El motor de formatos v2 todavia no esta disponible en este despliegue. ' +
        'Pon FORMAT_ENGINE=legacy para seguir emitiendo con la plantilla del cliente.',
        HttpStatus.NOT_IMPLEMENTED
      )
    }
    return this.v2
  }
}
