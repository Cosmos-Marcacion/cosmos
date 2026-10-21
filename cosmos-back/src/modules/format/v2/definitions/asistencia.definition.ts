import { DocumentDefinition } from '../document-model'
import { DEFAULT_SERIES } from './series'

/**
 * `ASISTENCIA DE PERSONAL PAITA`, la hoja de asistencia del formato.
 *
 * Transcrita del inventario de `FORMATOS GRANEL.xlsx`, hoja `ASISTENCIA`
 * (`A1:M32`, 225 textos). La prueba de cobertura comprueba contra el `.xlsx`
 * real que no falte ninguno de sus rotulos.
 *
 * Cuatro cosas que la hoja original hace y aqui cambian, y las cuatro por el
 * mismo motivo: generar permite corregir lo que rellenar obligaba a arrastrar.
 *
 * - **`Página: 1 de 1` esta escrito a mano** en la celda `H2`. Deja de ser
 *   cierto en cuanto el personal no cabe en una pagina. Aqui lo pone el modelo,
 *   que es quien sabe cuantas hay.
 * - **La cabecera de columnas se repite escrita** en las filas 7, 15 y 23, para
 *   que cada pagina impresa la lleve. Aqui la repeticion la hace el propio
 *   medio (`printTitlesRow` en Excel, `thead` al imprimir), asi que la
 *   definicion la declara una sola vez.
 * - **Las columnas de refrigerio y firma van en blanco.** Se rellenan a mano en
 *   el muelle; la plataforma no tiene ese dato y escribir algo ahi seria
 *   inventarlo.
 * - **La hoja no lleva numero.** Se le da serie propia, segun el criterio de
 *   que cada documento tenga la suya.
 */
export const ASISTENCIA_DOCUMENT: DocumentDefinition = {
  id: 'asistencia',
  name: 'ASISTENCIA',
  orientation: 'landscape',
  numbering: { kind: 'own', series: DEFAULT_SERIES.asistencia },
  sections: [
    {
      kind: 'header',
      id: 'cabecera',
      title: 'ASISTENCIA DE PERSONAL PAITA',
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
      id: 'hoja',
      title: 'HOJA:',
      columns: 1,
      fields: [
        {
          id: 'titular',
          label: '',
          source: 'literal',
          literal: 'ASISTENCIA DE PERSONAL PAITA - TERMINALES PORTUARIOS EUROANDINOS',
        },
        {
          id: 'empresa',
          label: '',
          source: 'literal',
          literal: 'COSMOS AGENCIA MARITIMA SAC. N° DE RUC: 20100010136',
        },
      ],
    },
    {
      kind: 'fields',
      id: 'informacion-general',
      title: 'INFORMACIÓN GENERAL',
      columns: 1,
      fields: [
        { id: 'nave', label: 'NAVE:', source: 'nave' },
        { id: 'fecha', label: 'FECHA:', source: 'fecha', transform: 'fechaCorta' },
        { id: 'muelle', label: 'MUELLE:', source: 'muelle' },
      ],
    },
    {
      // En la hoja son tres casillas y una X en la del turno. La X la ponia una
      // formula que comparaba `GLOBAL!B7` con el literal `07:00 HRS.`.
      kind: 'checklist',
      id: 'jornada',
      title: 'JORNADA DE TRABAJO:',
      columns: 1,
      items: [
        {
          id: 'jornada-1',
          label: '07:00 / 15:00 HRS.',
          when: { source: 'turno', transform: 'horaInicio', equals: '07:00' },
        },
        {
          id: 'jornada-2',
          label: '15:00 / 23:00 HRS.',
          when: { source: 'turno', transform: 'horaInicio', equals: '15:00' },
        },
        {
          id: 'jornada-3',
          label: '23:00 / 07:00 HRS.',
          when: { source: 'turno', transform: 'horaInicio', equals: '23:00' },
        },
      ],
    },
    {
      kind: 'table',
      id: 'personal',
      columns: [
        { id: 'numero', label: 'N°', source: 'numero', widthMm: 8, align: 'center' },
        { id: 'cargo', label: 'CARGO', source: 'cargo', widthMm: 38 },
        { id: 'nombre', label: 'APELLIDOS Y NOMBRES', source: 'nombre', widthMm: 62 },
        { id: 'documento', label: 'DNI N°', source: 'documento', widthMm: 22, align: 'center' },
        { id: 'hora-ingreso', label: 'HORA INGRESO', source: 'horaIngreso', widthMm: 18, align: 'center' },
        { id: 'firma-ingreso', label: 'FIRMA INGRESO', source: 'firma', widthMm: 22 },
        { id: 'inicio-refrigerio', label: 'INICIO REFRIGERIO', source: 'firma', widthMm: 18, align: 'center' },
        { id: 'termino-refrigerio', label: 'TERMINO DE REFRIGERIO', source: 'firma', widthMm: 18, align: 'center' },
        { id: 'firma-refrigerio', label: 'FIRMA TIEMPO DE REFRIGERIO', source: 'firma', widthMm: 22 },
        { id: 'hora-salida', label: 'HORA SALIDA', source: 'horaSalida', widthMm: 18, align: 'center' },
        { id: 'firma-salida', label: 'FIRMA SALIDA', source: 'firma', widthMm: 22 },
        { id: 'horas-extras', label: 'HORAS EXTRAS', source: 'firma', widthMm: 18, align: 'center' },
      ],
      // La hoja pone al jefe de cubierta al frente de la lista, por encima del
      // personal nombrado.
      leadingRows: [
        {
          id: 'jefe-cubierta',
          cargo: 'JEFE DE CUBIERTA',
          nameSource: 'jefeCubierta',
          documentSource: 'jefeCubierta',
        },
      ],
      // La hoja original ofrece 21 huecos por pagina (filas 8 a 14, 16 a 22 y
      // 24 a 30, con la cabecera repetida entre medias). Se conservan para
      // poder anadir a mano.
      minRows: 21,
      rowsPerPage: 21,
    },
  ],
}
