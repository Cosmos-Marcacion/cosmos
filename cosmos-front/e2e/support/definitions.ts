/**
 * Definiciones de formato para las pruebas.
 *
 * Son la forma que devuelve `GET /format/definitions/:type`, recortada a lo
 * imprescindible: dos documentos, un bloque de filas editable y un bloque de
 * lista de personal, que es el que el constructor no deja tocar. Con eso se
 * ejercitan los dos caminos de la pantalla.
 */
import type {
  IDocumentDefinition,
  IFormatDefinition,
} from '../../src/app/modules/formats/interfaces/format-document.interface';

export function atsDocument(): IDocumentDefinition {
  return {
    id: 'ats',
    name: 'ATS',
    label: 'ATS',
    orientation: 'portrait',
    numbering: {
      kind: 'own',
      series: { id: 'ats', prefix: 'ATS', scope: 'year', pad: 4 },
    },
    sections: [
      {
        kind: 'rows',
        id: 's1',
        title: 'SECCIÓN I: DESCRIPCIÓN DEL TRABAJO',
        rows: [
          {
            id: 'f1',
            cells: [
              { id: 'f1-a', width: 30, content: { kind: 'text', text: 'NAVE' }, bold: true },
              { id: 'f1-b', width: 70, content: { kind: 'data', source: 'nave' } },
            ],
          },
          {
            id: 'f2',
            cells: [{ id: 'f2-a', width: 100, content: { kind: 'blank' } }],
          },
        ],
      },
      { kind: 'table', id: 's2', title: 'Personal' },
    ],
  };
}

export function attendanceDocument(): IDocumentDefinition {
  return {
    id: 'asistencia',
    name: 'Registro de asistencia',
    label: 'Asistencia',
    orientation: 'landscape',
    numbering: { kind: 'namedCode' },
    sections: [
      {
        kind: 'rows',
        id: 'a1',
        title: 'Datos de la jornada',
        rows: [
          {
            id: 'af1',
            cells: [
              { id: 'af1-a', width: 40, content: { kind: 'text', text: 'FECHA' }, bold: true },
              { id: 'af1-b', width: 60, content: { kind: 'data', source: 'fecha' } },
            ],
          },
        ],
      },
    ],
  };
}

export function granelDefinition(version = 3): IFormatDefinition {
  return {
    formatType: 'granel',
    label: 'Granel',
    version,
    documents: [atsDocument(), attendanceDocument()],
  };
}

export function ethanolDefinition(version = 1): IFormatDefinition {
  return {
    formatType: 'ethanol',
    label: 'Ethanol',
    version,
    documents: [
      {
        ...atsDocument(),
        sections: [
          {
            kind: 'rows',
            id: 'e1',
            title: 'Condiciones del producto',
            rows: [
              {
                id: 'ef1',
                cells: [
                  { id: 'ef1-a', width: 50, content: { kind: 'text', text: 'PRODUCTO' } },
                  { id: 'ef1-b', width: 50, content: { kind: 'blank' } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

export const CATALOG = {
  sources: ['nave', 'fecha', 'turno', 'nombre', 'dni'],
  transforms: ['upper', 'fecha-larga'],
  personColumns: ['numero', 'nombre', 'dni'],
  sectionKinds: ['header', 'fields', 'checklist', 'table', 'rows', 'signatures'],
  numberingKinds: ['none', 'own', 'inherit', 'namedCode'],
  numberingScopes: ['year', 'global'] as ('year' | 'global')[],
  orientations: ['portrait', 'landscape'] as ('portrait' | 'landscape')[],
};
