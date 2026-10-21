import { HttpContext, HttpContextToken, HttpErrorResponse } from '@angular/common/http';

/**
 * Marca una petición cuyo error explica la propia pantalla.
 *
 * El interceptor enseña un aviso con el mensaje que llega del servidor. Está
 * bien como red de seguridad, pero cuando la pantalla ya dice qué pasó y qué
 * hacer —"No se pudo guardar el borrador. Lo editado sigue en pantalla"— el
 * aviso sale encima repitiendo la jerga del backend: "Cannot read properties of
 * undefined", "La definición no es válida". Dos mensajes a la vez, y el peor
 * de los dos es el que se ve primero.
 *
 * Con esto la pantalla se hace cargo: si falla, lo cuenta ella.
 */
export const HANDLED_ERROR = new HttpContextToken<boolean>(() => false);

export function handled(context = new HttpContext()): HttpContext {
  return context.set(HANDLED_ERROR, true);
}

/**
 * Convierte el cuerpo de un error pedido como blob en el JSON de la API, para
 * que `error.error.message` diga lo que dijo el servidor (por ejemplo, que el
 * tipo de nave no tiene formato).
 */
export async function readBlobError(error: unknown): Promise<unknown> {
  if (!(error instanceof HttpErrorResponse) || !(error.error instanceof Blob)) {
    return error;
  }
  try {
    const body = JSON.parse(await error.error.text());
    return new HttpErrorResponse({
      error: body,
      headers: error.headers,
      status: error.status,
      statusText: error.statusText,
      url: error.url ?? undefined,
    });
  } catch {
    return error;
  }
}

/** Mensaje de la API de un error ya leido, o `fallback` si no trae ninguno. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse && error.status === 0) {
    return 'No se pudo conectar con el servidor';
  }
  const message = (error as any)?.error?.message;
  if (Array.isArray(message) && message.length) {
    return message.join('. ');
  }
  return typeof message === 'string' && message.trim() ? message : fallback;
}
