import {
  BadRequestException,
  Injectable,
  ParseIntPipe,
  PipeTransform,
} from '@nestjs/common'
import { isValidObjectId } from 'mongoose'

/**
 * Parametros de ruta comprobados antes de llegar a Mongo.
 *
 * Un `:id` que no es un ObjectId hacia fallar `findById` con un CastError, y
 * `new Types.ObjectId(id)` con un BSONError. Ninguno de los dos es una
 * HttpException, asi que la API respondia 500 a lo que es un error de quien
 * pide. Lo mismo pasaba con los numeros: `Number('abc')` es `NaN`, y Mongo no
 * sabe convertir `NaN` a numero ni usarlo en `skip` o `limit`.
 */

/** Rechaza con 400 lo que no es un ObjectId. */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== 'string' || !isValidObjectId(value)) {
      throw new BadRequestException('El identificador no es válido.')
    }
    return value
  }
}

/** Entero de ruta o de consulta, con un 400 que se entiende si no lo es. */
export function parseIntParam(label: string): ParseIntPipe {
  return new ParseIntPipe({
    exceptionFactory: () =>
      new BadRequestException(`${label} debe ser un número entero.`),
  })
}

/** El identificador de una nombrada: el `staff_transmission_id` del externo. */
export function parseNamedIdParam(): ParseIntPipe {
  return new ParseIntPipe({
    exceptionFactory: () =>
      new BadRequestException('El identificador de la nombrada no es válido.'),
  })
}
