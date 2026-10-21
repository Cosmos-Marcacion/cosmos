import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Marca una petición como silenciosa: no levanta el loader global.
 *
 * El loader a pantalla completa tiene sentido para una navegación o un guardado,
 * pero no para las consultas que se disparan mientras se escribe (el buscador
 * del selector de personal hace una por tecla). Sin esto la pantalla parpadea
 * en cada pulsación.
 */
export const SILENT_REQUEST = new HttpContextToken<boolean>(() => false);

export function silent(): HttpContext {
  return new HttpContext().set(SILENT_REQUEST, true);
}

/**
 * La pantalla pinta el error en su sitio: el interceptor no saca el aviso
 * flotante. Sin esto el mensaje salia dos veces, o solo en un aviso que se va
 * a los tres segundos y deja la pantalla vacia.
 */
export const OWN_ERROR_MESSAGE = new HttpContextToken<boolean>(() => false);

export function ownErrorMessage(context = new HttpContext()): HttpContext {
  return context.set(OWN_ERROR_MESSAGE, true);
}
