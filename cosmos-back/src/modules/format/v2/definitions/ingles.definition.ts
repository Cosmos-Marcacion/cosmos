import { DocumentDefinition } from '../document-model'
import { DEFAULT_SERIES } from './series'

/**
 * `SHIFT'S STEVEDORES LIST`, la hoja de ingles del formato.
 *
 * Es el documento mas pequeno de los seis (47 rotulos frente a los 361 del
 * permiso de trabajo) y por eso es el primero: sirve para calibrar el ciclo de
 * revision con el cliente antes de comprometer los otros cinco.
 *
 * Transcrito del inventario de `FORMATOS GRANEL.xlsx`, hoja `INGLÉS`. Todo lo
 * que dice esta definicion esta en esa hoja; la prueba de cobertura lo
 * comprueba contra el `.xlsx` real en cada ejecucion.
 *
 * Dos cosas que la hoja original hace y aqui se corrigen, porque generar en vez
 * de rellenar permite corregirlas:
 *
 * - **Las filas 41 y 42 estan en blanco.** No llevan correlativo ni cargo, y la
 *   fila 43 salta del 33 al 35. El motor actual escribe personal en esas dos
 *   filas, asi que dos personas salen impresas sin numero de orden. Aqui la
 *   numeracion es continua.
 * - **La hoja mide 418 mm de ancho** y solo cabe en A4 gracias a una escala de
 *   impresion del 39%, que es lo que la deja tan pequena. Con la rejilla
 *   compartida el ancho se declara en milimetros y no hace falta encoger nada.
 *
 * Y un rotulo que se anade: la hoja original pone `FULL NAME` combinando las
 * columnas B a D, y debajo la B lleva el cargo y la C el nombre. Es decir, el
 * cargo va bajo una cabecera que dice otra cosa. Aqui la columna del cargo
 * lleva la suya, `POSITION`. Es el unico texto de esta definicion que no esta
 * en el `.xlsx`, y esta anotado para que salga en la revision con el cliente.
 */
export const INGLES_DOCUMENT: DocumentDefinition = {
  id: 'ingles',
  name: 'INGLÉS',
  orientation: 'portrait',
  // La hoja original no lleva numero. Se le da serie propia porque el criterio
  // acordado es que cada documento tenga la suya; ocultar el campo de la
  // cabecera lo deja como estaba sin perder el correlativo.
  numbering: { kind: 'own', series: DEFAULT_SERIES.ingles },
  sections: [
    {
      kind: 'header',
      id: 'cabecera',
      title: "SHIFT'S STEVEDORES LIST",
      // Codigo, version y fecha del documento controlado del cliente. Van en la
      // definicion porque es justo lo que cambia cuando aprueban una revision.
      documentCode: 'PD03-R97',
      documentVersion: '06',
      documentDate: '10.08.23',
      pageIndicator: true,
      fields: [
        { id: 'numero', label: 'N°:', source: 'numeroDocumento' },
      ],
    },
    {
      kind: 'fields',
      id: 'informacion-general',
      title: 'GENERAL INFORMATION:',
      columns: 1,
      fields: [
        { id: 'vessel', label: 'VESSEL:', source: 'nave' },
        { id: 'date', label: 'DATE:', source: 'fecha', transform: 'fechaCorta' },
        { id: 'pier', label: 'PIER:', source: 'muelle' },
      ],
    },
    {
      // En la hoja son tres casillas con una X en el turno de la jornada. La
      // X la ponia una formula que comparaba con el literal `07:00 HRS.`.
      kind: 'checklist',
      id: 'turnos',
      title: 'SHIFTS:',
      columns: 1,
      items: [
        {
          id: 'turno-1',
          label: '07:00 / 15:00 HRS.',
          when: { source: 'turno', transform: 'horaInicio', equals: '07:00' },
        },
        {
          id: 'turno-2',
          label: '15:00 / 23:00 HRS.',
          when: { source: 'turno', transform: 'horaInicio', equals: '15:00' },
        },
        {
          id: 'turno-3',
          label: '23:00 / 07:00 HRS.',
          when: { source: 'turno', transform: 'horaInicio', equals: '23:00' },
        },
      ],
    },
    {
      kind: 'table',
      id: 'personal',
      columns: [
        { id: 'numero', label: 'N°', source: 'numero', widthMm: 12, align: 'center' },
        {
          id: 'cargo',
          label: 'POSITION',
          source: 'cargo',
          widthMm: 45,
          // La hoja original trae esta columna preimpresa: FOREMAN en la
          // primera fila del personal y STEVEDORE en el resto. Es una lista
          // para la tripulacion del buque, no el cargo de la nombrada.
          fixedText: { firstRow: 'FOREMAN', rest: 'STEVEDORE' },
        },
        { id: 'nombre', label: 'FULL NAME', source: 'nombre', widthMm: 85 },
        { id: 'documento', label: 'IDENTIFICATION NUMBER', source: 'documento', widthMm: 45, align: 'center' },
      ],
      // Las dos primeras filas de la hoja no salen de la lista de personal: son
      // los dos supervisores, que firman el documento y no van nombrados.
      leadingRows: [
        {
          id: 'operations-supervisor',
          cargo: 'OPERATIONS SUPERVISOR',
          nameSource: 'supervisorOperaciones',
          documentSource: 'supervisorOperaciones',
        },
        {
          id: 'safety-supervisor',
          cargo: 'SAFETY SUPERVISOR',
          nameSource: 'supervisorSsoma',
        },
      ],
      // La hoja original ofrece 36 huecos. Se conservan para que el documento
      // siga admitiendo altas a mano, aunque la lista venga mas corta.
      minRows: 36,
      rowsPerPage: 36,
    },
  ],
}
