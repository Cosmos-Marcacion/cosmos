/**
 * Los datos que se pueden poner en una casilla, con el nombre que usa quien
 * edita el formato.
 *
 * El modelo tiene 21 orígenes y 11 transformaciones. Ofrecer los dos por
 * separado son 231 combinaciones, y casi ninguna tiene sentido: "muelle en
 * hora de inicio" o "total de personal en fecha larga" son elegibles y no
 * significan nada. Peor todavía, obliga a saber qué es una transformación.
 *
 * Aquí se listan **las combinaciones que sí valen**, ya nombradas. "Fecha" y
 * "Fecha larga" son dos fichas distintas, no un desplegable dentro de otro.
 *
 * Es la misma idea que hace usable a PandaDoc: se arrastra "Fecha de firma",
 * no se elige un campo y luego un formateador.
 */
export interface DataField {
  /** Identificador de la ficha. No viaja al modelo. */
  id: string
  /** Cómo se llama para quien edita. */
  label: string
  /** Grupo con el que se agrupa en la paleta. */
  group: string
  /** Lo que se guarda en la casilla. */
  source: string
  transform?: string
  /** Ejemplo de lo que imprimirá, para que se entienda sin probar. */
  sample: string
  /**
   * La ficha imprime la **firma registrada** de esa persona, no su nombre.
   *
   * Es la única que produce una casilla de otra clase (`signature` en vez de
   * `data`), y va como bandera y no como grupo aparte porque para quien edita
   * es un dato más que se arrastra sobre el documento.
   */
  signature?: boolean
}

export const DATA_FIELDS: DataField[] = [
  // --- la jornada ------------------------------------------------------------
  { id: 'nave', group: 'Jornada', label: 'Nave', source: 'nave', sample: 'CMA CGM VOLTAIRE' },
  { id: 'muelle', group: 'Jornada', label: 'Muelle', source: 'muelle', sample: '2-A' },
  { id: 'fecha', group: 'Jornada', label: 'Fecha', source: 'fecha', transform: 'fechaCorta', sample: '10/09/2025' },
  {
    id: 'fecha-larga', group: 'Jornada', label: 'Fecha en letra',
    source: 'fecha', transform: 'fechaLarga', sample: '10 de septiembre de 2025',
  },
  { id: 'turno', group: 'Jornada', label: 'Turno', source: 'turno', sample: '07:00 - 15:00' },
  {
    id: 'hora-inicio', group: 'Jornada', label: 'Hora de inicio',
    source: 'turno', transform: 'horaInicio', sample: '07:00',
  },
  {
    id: 'hora-fin', group: 'Jornada', label: 'Hora de término',
    source: 'turno', transform: 'horaFin', sample: '15:00',
  },
  {
    id: 'jornada', group: 'Jornada', label: 'Número de jornada',
    source: 'jornada', transform: 'numeroJornada', sample: '1',
  },
  { id: 'total-personal', group: 'Jornada', label: 'Total de personal', source: 'totalPersonal', sample: '18' },

  // --- responsables ----------------------------------------------------------
  {
    id: 'jefe-cubierta', group: 'Responsables', label: 'Jefe de cubierta',
    source: 'jefeCubierta', transform: 'soloNombre', sample: 'HIDALGO CASTILLO DARWIN',
  },
  {
    id: 'jefe-cubierta-doc', group: 'Responsables', label: 'Documento del jefe de cubierta',
    source: 'jefeCubierta', transform: 'soloDocumento', sample: '03474793',
  },
  // Nombre y documento juntos, que es como firman el permiso y el ATS. Sin esta
  // ficha, `fieldFor` caía en la de "solo nombre" y el maestro enseñaba un
  // nombre donde el documento imprime nombre y DNI.
  {
    id: 'jefe-cubierta-completo', group: 'Responsables',
    label: 'Jefe de cubierta con documento',
    source: 'jefeCubierta', transform: 'nombreYDocumento',
    sample: 'HIDALGO CASTILLO DARWIN - 03474793',
  },
  {
    id: 'supervisor-operaciones', group: 'Responsables', label: 'Supervisor de operaciones',
    source: 'supervisorOperaciones', transform: 'soloNombre', sample: 'ESPINOZA RETO HENRY',
  },
  {
    id: 'supervisor-operaciones-doc', group: 'Responsables',
    label: 'Documento del supervisor de operaciones',
    source: 'supervisorOperaciones', transform: 'soloDocumento', sample: '03491027',
  },
  {
    id: 'supervisor-operaciones-completo', group: 'Responsables',
    label: 'Supervisor de operaciones con documento',
    source: 'supervisorOperaciones', transform: 'nombreYDocumento',
    sample: 'ESPINOZA RETO HENRY - 03491027',
  },
  // Las firmas registradas. Solo estas dos personas: el resto de responsables
  // llega como texto suelto, sin documento con el que buscar su firma.
  {
    id: 'firma-jefe-cubierta', group: 'Responsables',
    label: 'Firma del jefe de cubierta',
    source: 'jefeCubierta', signature: true,
    sample: 'su firma registrada',
  },
  {
    id: 'firma-supervisor-operaciones', group: 'Responsables',
    label: 'Firma del supervisor de operaciones',
    source: 'supervisorOperaciones', signature: true,
    sample: 'su firma registrada',
  },
  { id: 'supervisor-ssoma', group: 'Responsables', label: 'Supervisor SSOMA', source: 'supervisorSsoma', sample: 'MARIA DIAZ' },
  { id: 'jefe-cubierta-vsi', group: 'Responsables', label: 'Jefe de cubierta de la naviera', source: 'jefeCubiertaVsi', sample: 'JOHN SMITH' },
  { id: 'ssoma-vsi', group: 'Responsables', label: 'SSOMA de la naviera', source: 'ssomaVsi', sample: 'JANE DOE' },

  // --- documento -------------------------------------------------------------
  { id: 'numero-documento', group: 'Documento', label: 'Número de este documento', source: 'numeroDocumento', sample: 'ATS-2026-0042' },
  { id: 'codigo-nombrada', group: 'Documento', label: 'Código de nombrada', source: 'codigoNombrada', sample: '0875-1' },
  {
    id: 'numero-permiso', group: 'Documento', label: 'N.º de permiso de trabajo',
    source: 'numeroPermiso', transform: 'correlativo4', sample: '0137',
  },

  // --- charla ----------------------------------------------------------------
  { id: 'tema-1', group: 'Charla', label: 'Tema 1', source: 'temaCharla1', sample: 'USO DE BLOQUEADOR SOLAR' },
  { id: 'tema-2', group: 'Charla', label: 'Tema 2', source: 'temaCharla2', sample: '' },
  { id: 'tema-3', group: 'Charla', label: 'Tema 3', source: 'temaCharla3', sample: '' },
  { id: 'resumen-1', group: 'Charla', label: 'Resumen 1', source: 'resumenCharla1', sample: 'Aplicar los controles del ATS' },
  { id: 'resumen-2', group: 'Charla', label: 'Resumen 2', source: 'resumenCharla2', sample: '' },
  { id: 'resumen-3', group: 'Charla', label: 'Resumen 3', source: 'resumenCharla3', sample: '' },
]

/**
 * La ficha que corresponde a lo que una casilla tiene guardado.
 *
 * `signature` distingue las dos familias y no es un detalle: la ficha de firma
 * no lleva transformación, así que sin separarlas una casilla de dato con
 * origen `jefeCubierta` y sin transformación casaba con "Firma del jefe de
 * cubierta" y el maestro decía que imprimía una firma donde imprime un nombre.
 */
export function fieldFor(source?: string, transform?: string, signature = false): DataField | null {
  if (!source) {
    return null
  }
  const family = DATA_FIELDS.filter(field => Boolean(field.signature) === signature)
  return (
    family.find(field => field.source === source && field.transform === transform) ??
    family.find(field => field.source === source) ??
    null
  )
}

/** Nombre legible de lo que una casilla imprime, para enseñarlo sin jerga. */
export function labelFor(source?: string, transform?: string, signature = false): string {
  return fieldFor(source, transform, signature)?.label ?? source ?? ''
}

/** Las fichas agrupadas, en el orden en que se declaran. */
export function groupedFields(): { group: string; fields: DataField[] }[] {
  const groups: { group: string; fields: DataField[] }[] = []
  for (const field of DATA_FIELDS) {
    const existing = groups.find(entry => entry.group === field.group)
    if (existing) {
      existing.fields.push(field)
    } else {
      groups.push({ group: field.group, fields: [field] })
    }
  }
  return groups
}
