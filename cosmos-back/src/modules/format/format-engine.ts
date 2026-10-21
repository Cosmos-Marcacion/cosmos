import { GenerateFormatResult, FormatOutput } from './format.service'

/**
 * Los dos motores de formato, y el contrato que comparten.
 *
 * `legacy` rellena la plantilla `.xlsx` del cliente. Es lo que hay en
 * produccion y lo que sigue saliendo por defecto.
 *
 * `v2` genera el documento desde un modelo propio: mismos datos, maquetacion
 * nuestra, y las tres salidas (Excel, PDF e impresion del navegador) desde una
 * sola definicion.
 *
 * Los dos existen a la vez a proposito. Se conmuta con `FORMAT_ENGINE` sin
 * desplegar codigo, y volver atras es cambiar una variable.
 */
export type FormatEngineId = 'legacy' | 'v2'

/**
 * Token con el que se registra el motor v2 cuando exista.
 *
 * Hace falta uno porque `FormatEngine` es una interfaz y en tiempo de ejecucion
 * no queda nada de ella que Nest pueda inyectar.
 */
export const FORMAT_ENGINE_V2 = 'FORMAT_ENGINE_V2'

export const FORMAT_ENGINE_IDS: FormatEngineId[] = ['legacy', 'v2']

/** Motor por defecto. Cambiar esto cambia lo que descarga todo el mundo. */
/**
 * El motor con el que se emite si nadie dice otra cosa.
 *
 * Es `v2`: el que **genera** el documento desde la definicion publicada, con
 * los cuatro formatos —asistencia, charla, permiso de trabajo y ATS— y una
 * hoja por formato en el libro. `legacy` rellenaba el `.xlsx` del cliente y se
 * quedo con las hojas antiguas; sigue disponible poniendo `FORMAT_ENGINE=legacy`
 * para poder volver atras sin desplegar, pero ya no es lo que sale por defecto.
 */
export const DEFAULT_FORMAT_ENGINE: FormatEngineId = 'v2'

/** Tipo de formato tal como lo lista la API. */
export interface FormatTypeSummary {
  id: string
  label: string
  capacity: number
  onePageCapacity: number
  attendanceSheet: string
}

export interface FormatEngine {
  readonly engineId: FormatEngineId

  listFormatTypes(): FormatTypeSummary[]

  generate(
    staffTransmissionId: number,
    workerDate: string,
    generatedBy?: string,
    output?: FormatOutput
  ): Promise<GenerateFormatResult>
}

/** `'V2 '` a `'v2'`; cualquier otra cosa a `null`. */
export function parseFormatEngineId(value: string | undefined | null): FormatEngineId | null {
  const normalized = (value ?? '').trim().toLowerCase()
  return (FORMAT_ENGINE_IDS as string[]).includes(normalized)
    ? (normalized as FormatEngineId)
    : null
}
