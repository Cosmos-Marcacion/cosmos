/**
 * Tipo de nave que trae `api/Users/ListarNombradas` y formato que le toca.
 *
 * El tipo de formato ya no se elige en el panel: lo decide `code_type_vessel`.
 * Solo estos codigos tienen formato; cualquier otro (`VA` VARILLAS, vacio o
 * uno nuevo) se rechaza y la nombrada no puede emitir formatos. No hay tipo por defecto a proposito: emitir un formato de
 * granel para un porta contenedores es peor que no emitir nada.
 */
export const VESSEL_TYPE_FORMATS: Readonly<Record<string, string>> = {
  ET: 'ETHANOL',
  GR: 'GRANEL',
  ME: 'MERCADERIA_GENERAL',
  CO: 'CONTAINERO',
  BB: 'BIG_BAG',
}

export interface VesselTypeInfo {
  /** Codigo tal como llega, sin espacios. `''` si no vino. */
  code: string
  /** Descripcion tal como llega (`ETANOL`, `CONTAINER`...). */
  description: string
  /** Formato que le toca, o `''` si el tipo no se acepta. */
  formatType: string
  /** Si la nombrada puede emitir formatos por su tipo de nave. */
  accepted: boolean
  /**
   * `api` si el tipo salio de la API; `record` si la nombrada se guardo antes
   * de que la API trajera el campo y se usa el formato elegido entonces.
   */
  source: 'api' | 'record'
}

/**
 * Resuelve el formato de una nombrada.
 *
 * `code === undefined` significa que la copia local es anterior al campo: en
 * ese caso se respeta el `formatType` que se eligio a mano, hasta que la
 * sincronizacion la actualice. Un codigo presente, aunque sea vacio, manda.
 */
export function resolveVesselType(
  code: string | null | undefined,
  description: string | null | undefined,
  recordFormatType?: string | null
): VesselTypeInfo {
  if (code === undefined) {
    const legacy = Object.values(VESSEL_TYPE_FORMATS).includes(
      recordFormatType ?? ''
    )
      ? (recordFormatType as string)
      : ''
    return {
      code: '',
      description: '',
      formatType: legacy,
      accepted: Boolean(legacy),
      source: 'record',
    }
  }
  const normalized = String(code ?? '')
    .trim()
    .toUpperCase()
  const formatType = VESSEL_TYPE_FORMATS[normalized] ?? ''
  return {
    code: normalized,
    description: String(description ?? '').trim(),
    formatType,
    accepted: Boolean(formatType),
    source: 'api',
  }
}

/** Mensaje para quien intenta emitir un formato con un tipo rechazado. */
export function rejectedVesselTypeMessage(info: VesselTypeInfo): string {
  if (!info.code) {
    return 'La nombrada no trae tipo de nave desde Cosmos; no se puede emitir el formato.'
  }
  const label = info.description
    ? `${info.code} (${info.description})`
    : info.code
  return `El tipo de nave ${label} no tiene formato. Solo se aceptan ET (Etanol), GR (Granel), ME (Mercadería), CO (Container) y BB (Big bags).`
}
