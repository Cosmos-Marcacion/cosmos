import { ParamMap, Params } from '@angular/router';

/**
 * Con qué se identificó quien marca, y lo seguro que estaba el reconocimiento.
 *
 * Viaja de la pantalla que identifica (rostro, huella, QR o documento) a la de
 * validación por la URL, y de ahí a la marcación. Antes no se guardaba: cuando
 * la salida de un trabajador mostró los datos de otro no había forma de saber
 * con qué método se hizo.
 *
 * `score` es la distancia del rostro (menor es mejor) o la puntuación de la
 * huella (mayor es mejor).
 */
export type MarkMethod = 'rostro' | 'huella' | 'qr' | 'documento';

export interface MarkIdentification {
  method: MarkMethod;
  score?: number;
}

const METHODS: readonly MarkMethod[] = ['rostro', 'huella', 'qr', 'documento'];

/** Los parámetros de URL que la llevan a la pantalla de validación. */
export function identificationParams(identification: MarkIdentification): Params {
  return {
    metodo: identification.method,
    ...(typeof identification.score === 'number' && Number.isFinite(identification.score)
      ? { puntuacion: identification.score }
      : {}),
  };
}

/** La lee de vuelta; `null` si la URL no la trae o trae algo que no es. */
export function readIdentification(params: ParamMap): MarkIdentification | null {
  const method = params.get('metodo') as MarkMethod | null;
  if (!method || !METHODS.includes(method)) {
    return null;
  }
  const raw = params.get('puntuacion');
  const score = raw === null || raw === '' ? NaN : Number(raw);
  return Number.isFinite(score) ? { method, score } : { method };
}
