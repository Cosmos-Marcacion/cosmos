import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PLATFORM_MODULES } from './modules'

/**
 * Deja pasar si el perfil de quien pide tiene el modulo.
 *
 * Es la otra mitad del filtrado del menu. Ocultar una opcion en el frontend
 * ordena la pantalla pero no protege nada: la ruta de la API sigue ahi para
 * quien la escriba a mano.
 *
 * Un endpoint sin `@RequireModule` pasa. La alternativa —denegar por defecto—
 * es mas estricta sobre el papel y peor en la practica: dejaria fuera el login,
 * la salud del servicio y todo lo que se anada sin acordarse del decorador, y
 * el fallo se veria en produccion como un 403 sin explicacion.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string | string[]>(
      'requireModule',
      [context.getHandler(), context.getClass()]
    )
    if (!required || required.length === 0) {
      return true
    }

    // Un metodo puede declarar varios modulos: basta con tener uno.
    const keys = Array.isArray(required) ? required : [required]
    const request = context.switchToHttp().getRequest()
    const permissions: string[] = request.user?.permissions ?? []
    if (keys.some(key => permissions.includes(key))) {
      return true
    }

    const labels = keys.map(
      key => PLATFORM_MODULES.find(module => module.key === key)?.label ?? key
    )
    throw new ForbiddenException(
      `Tu perfil no tiene acceso a ${labels.join(' ni a ')}.`
    )
  }
}
