import { DocumentDefinition } from '../document-model'
import { DEFAULT_SERIES } from './series'

/**
 * `REGISTRO DE INDUCCIÓN, CAPACITACIÓN, ENTRENAMIENTO Y SIMULACROS DE
 * EMERGENCIA`, la hoja de charla del formato.
 *
 * Transcrita del inventario de `FORMATOS GRANEL.xlsx`, hoja `CHARLA`
 * (`A1:K78`, 108 textos).
 *
 * Esta hoja es la que peor lleva el relleno sobre plantilla, y por eso es un
 * buen segundo documento. Sus opciones no son campos: son **textos
 * preimpresos con las opciones dentro** de una sola celda combinada, del estilo
 * `"        Inducción            Capacitación            Entrenamiento ..."`,
 * y el motor actual tiene que escribir *encima* sin cambiarles la longitud para
 * no descuadrar la caja (ver `preprinted-text.ts`). Aqui cada opcion es un
 * elemento de una lista de verificacion con su casilla propia, que es lo que
 * siempre quiso ser.
 *
 * Lo mismo con `N° Registro:`, que en la plantilla es una etiqueta y un numero
 * escrito al lado a mano (`0830`). Aqui es el numero del documento, con su
 * serie.
 */
export const CHARLA_DOCUMENT: DocumentDefinition = {
  id: 'charla',
  name: 'CHARLA',
  orientation: 'portrait',
  numbering: { kind: 'own', series: DEFAULT_SERIES.charla },
  sections: [
    {
      kind: 'header',
      id: 'cabecera',
      title: 'REGISTRO DE INDUCCIÓN, CAPACITACIÓN, ENTRENAMIENTO Y SIMULACROS DE EMERGENCIA',
      documentCode: 'GH02-F01',
      documentVersion: '14',
      documentDate: '05.01.2026',
      pageIndicator: true,
      fields: [
        { id: 'registro', label: 'N° Registro:', source: 'numeroDocumento' },
      ],
    },
    {
      kind: 'fields',
      id: 'empresa',
      title: 'DATOS DEL EMPLEADOR',
      columns: 2,
      fields: [
        { id: 'razon-social', label: 'Razón Social', source: 'literal', literal: 'COSMOS GLOBAL LOGISTIC SAC' },
        { id: 'ruc', label: 'RUC', source: 'literal', literal: '20100010136' },
        {
          id: 'domicilio',
          label: 'Domicilio (Dirección, distrito, departamento, provincia)',
          source: 'literal',
          literal: 'Calle LOS CONSTRUCTORES Mz A Lot 13 - PAITA',
        },
        { id: 'actividad', label: 'Actividad Económica', source: 'literal', literal: 'Servicios Marítimos' },
        { id: 'trabajadores', label: 'N° Trabajadores', source: 'totalPersonal' },
        { id: 'area', label: 'Área capacitada (según programa)', source: 'literal', literal: 'OPERACIONES ESTIBA' },
      ],
    },
    {
      // La celda `A8` de la plantilla mete las seis opciones en un solo texto.
      // Sin el `when`, la casilla sale en blanco para marcarla a mano, que es
      // lo que ocurre hoy salvo que la nombrada declare el tipo de charla.
      kind: 'checklist',
      id: 'tipo',
      title: 'Marcar (X)',
      columns: 3,
      items: [
        { id: 'induccion', label: 'Inducción' },
        { id: 'capacitacion', label: 'Capacitación' },
        { id: 'entrenamiento', label: 'Entrenamiento' },
        { id: 'simulacro', label: 'Simulacro de Emergencia' },
        { id: 'toolbox', label: 'TOOLBOX' },
        { id: 'otros', label: 'Otros' },
      ],
    },
    {
      kind: 'fields',
      id: 'temas',
      title: 'Tema:',
      columns: 1,
      fields: [
        { id: 'tema-1', label: 'Tema 1', source: 'temaCharla1' },
        { id: 'tema-2', label: 'Tema 2', source: 'temaCharla2' },
        { id: 'tema-3', label: 'Tema 3', source: 'temaCharla3' },
      ],
    },
    {
      kind: 'fields',
      id: 'resumenes',
      title: 'Resumen del tema expuesto:',
      columns: 1,
      fields: [
        { id: 'resumen-1', label: 'Resumen 1', source: 'resumenCharla1' },
        { id: 'resumen-2', label: 'Resumen 2', source: 'resumenCharla2' },
        { id: 'resumen-3', label: 'Resumen 3', source: 'resumenCharla3' },
      ],
    },
    {
      kind: 'checklist',
      id: 'programa-anual',
      title: '¿Pertenece a Programa Anual de Capacitación?',
      columns: 2,
      items: [
        { id: 'programa-si', label: 'SI' },
        { id: 'programa-no', label: 'NO' },
      ],
    },
    {
      kind: 'checklist',
      id: 'lugar',
      title: 'Datos',
      columns: 4,
      items: [
        { id: 'lugar-embarcacion', label: 'Embarcación' },
        { id: 'lugar-terminal', label: 'Terminal' },
        { id: 'lugar-oficina', label: 'Oficina' },
        { id: 'lugar-otros', label: 'Otros' },
      ],
    },
    {
      kind: 'fields',
      id: 'sesion',
      columns: 2,
      fields: [
        { id: 'sucursal', label: 'Sucursal:', source: 'literal', literal: 'Paita' },
        { id: 'fecha', label: 'Fecha:', source: 'fecha', transform: 'fechaCorta' },
        { id: 'hora-inicio', label: 'Hora inicio:', source: 'turno', transform: 'horaInicio' },
        { id: 'hora-termino', label: 'Hora término:', source: 'turno', transform: 'horaFin' },
        { id: 'horas', label: 'N° Horas:', source: 'literal', literal: '' },
        {
          id: 'capacitador',
          label: 'Nombre del capacitador o entrenador:',
          source: 'supervisorOperaciones',
          transform: 'soloNombre',
        },
        // La hoja pone un `Firma:` al lado del capacitador (`G21`), para
        // firmar a mano.
        { id: 'capacitador-firma', label: 'Firma:', source: 'literal', literal: '' },
      ],
    },
    {
      kind: 'table',
      id: 'personal',
      columns: [
        { id: 'numero', label: 'N°', source: 'numero', widthMm: 10, align: 'center' },
        { id: 'nombre', label: 'Nombres y Apellidos', source: 'nombre', widthMm: 78 },
        { id: 'puesto', label: 'Puesto/ Área', source: 'cargo', widthMm: 44 },
        { id: 'documento', label: 'DNI', source: 'documento', widthMm: 24, align: 'center' },
        { id: 'firma', label: 'Firma', source: 'firma', widthMm: 38 },
      ],
      leadingRows: [
        {
          id: 'jefe-cubierta',
          cargo: 'JEFE DE CUBIERTA',
          nameSource: 'jefeCubierta',
          documentSource: 'jefeCubierta',
        },
      ],
      minRows: 19,
      rowsPerPage: 19,
    },
    {
      // En la hoja son dos celdas, `A24` y `A25`, con las cuatro etiquetas
      // dentro: `"Nombre:      Fecha:"` y `"Cargo:      Firma:"`. Aqui cada una
      // es su propio campo, que es lo que hace que se pueda rellenar sin tener
      // que escribir encima de un texto preimpreso.
      kind: 'fields',
      id: 'responsable',
      title: 'RESPONSABLE DEL REGISTRO:',
      columns: 2,
      fields: [
        { id: 'responsable-nombre', label: 'Nombre:', source: 'supervisorSsoma' },
        { id: 'responsable-fecha', label: 'Fecha:', source: 'fecha', transform: 'fechaCorta' },
        { id: 'responsable-cargo', label: 'Cargo:', source: 'literal', literal: '' },
        { id: 'responsable-firma', label: 'Firma:', source: 'literal', literal: '' },
      ],
    },
    {
      kind: 'fields',
      id: 'observaciones',
      title: 'OBSERVACIONES',
      columns: 1,
      fields: [
        { id: 'observaciones', label: '', source: 'literal', literal: '' },
      ],
    },
  ],
}
