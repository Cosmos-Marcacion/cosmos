import { FormatDefinition } from '../v2/document-model'
import { SEED_DEFINITIONS } from '../v2/definitions/seed'
import { validateDefinition } from './format-definition.validator'

/**
 * La validacion es la frontera del maestro.
 *
 * Todo lo editable sale de catalogos cerrados, y aqui se comprueba que sea asi.
 * El motivo esta en el informe de factibilidad: con texto libre en `source` o
 * en `transform`, la primera errata deja un campo en blanco en un documento que
 * por lo demas parece correcto, y eso es peor que un error a la vista.
 */

const base = (documents: any[]): FormatDefinition => ({
  formatType: 'GRANEL',
  label: 'Granel',
  version: 1,
  documents,
})

const table = (extra: any = {}) => ({
  kind: 'table',
  id: 'personal',
  columns: [{ id: 'n', label: 'N°', source: 'numero', widthMm: 10 }],
  rowsPerPage: 20,
  ...extra,
})

const doc = (extra: any = {}) => ({
  id: 'ingles',
  name: 'INGLÉS',
  orientation: 'portrait',
  sections: [table()],
  ...extra,
})

describe('validateDefinition', () => {
  describe('las definiciones de fabrica', () => {
    for (const [formatType, definition] of Object.entries(SEED_DEFINITIONS)) {
      it(`${formatType} es valida`, () => {
        // Si esto falla, un despliegue en limpio no puede emitir nada: la
        // siembra publica estas definiciones sin que nadie las revise.
        expect(validateDefinition(definition)).toEqual([])
      })
    }
  })

  describe('estructura', () => {
    it('exige tipo de formato', () => {
      const issues = validateDefinition({ ...base([doc()]), formatType: '' })
      expect(issues.some(i => i.path === 'formatType')).toBe(true)
    })

    it('exige al menos un documento', () => {
      expect(validateDefinition(base([]))[0].path).toBe('documents')
    })

    it('rechaza ids de documento repetidos', () => {
      const issues = validateDefinition(base([doc(), doc()]))
      expect(issues.some(i => /repetido/.test(i.message))).toBe(true)
    })

    it('rechaza ids de seccion repetidos dentro de un documento', () => {
      const issues = validateDefinition(base([doc({ sections: [table(), table()] })]))
      expect(issues.some(i => /repetido/.test(i.message))).toBe(true)
    })

    it('rechaza una orientacion desconocida', () => {
      const issues = validateDefinition(base([doc({ orientation: 'diagonal' })]))
      expect(issues.some(i => i.path.endsWith('.orientation'))).toBe(true)
    })

    it('rechaza un tipo de seccion desconocido', () => {
      const issues = validateDefinition(base([doc({ sections: [{ kind: 'grafico', id: 'x' }] })]))
      expect(issues[0].message).toMatch(/tipo de seccion desconocido/)
    })
  })

  describe('catalogos cerrados', () => {
    it('rechaza un origen que el motor no sabe resolver', () => {
      const issues = validateDefinition(base([doc({
        sections: [{
          kind: 'fields', id: 'f', columns: 1,
          fields: [{ id: 'x', label: 'X', source: 'nombreDelBarco' }],
        }],
      })]))
      expect(issues[0].message).toMatch(/origen desconocido: "nombreDelBarco"/)
    })

    it('rechaza una transformacion inventada', () => {
      const issues = validateDefinition(base([doc({
        sections: [{
          kind: 'fields', id: 'f', columns: 1,
          fields: [{ id: 'x', label: 'X', source: 'nave', transform: 'titulo' }],
        }],
      })]))
      expect(issues[0].message).toMatch(/transformacion desconocida/)
    })

    it('rechaza una columna de personal que no existe', () => {
      const issues = validateDefinition(base([doc({
        sections: [table({ columns: [{ id: 'x', label: 'X', source: 'edad', widthMm: 10 }] })],
      })]))
      expect(issues[0].message).toMatch(/columna desconocida: "edad"/)
    })

    it('exige el texto de un campo literal', () => {
      const issues = validateDefinition(base([doc({
        sections: [{
          kind: 'fields', id: 'f', columns: 1,
          fields: [{ id: 'x', label: 'X', source: 'literal' }],
        }],
      })]))
      expect(issues[0].message).toMatch(/necesita su texto/)
    })

    it('acepta un campo literal con texto vacio', () => {
      // Un hueco para rellenar a mano es un literal vacio, no un error.
      const issues = validateDefinition(base([doc({
        sections: [{
          kind: 'fields', id: 'f', columns: 1,
          fields: [{ id: 'x', label: 'X', source: 'literal', literal: '' }],
        }],
      })]))
      expect(issues).toEqual([])
    })
  })

  describe('medidas', () => {
    it('rechaza un ancho de columna que no sea positivo', () => {
      const issues = validateDefinition(base([doc({
        sections: [table({ columns: [{ id: 'n', label: 'N', source: 'numero', widthMm: 0 }] })],
      })]))
      expect(issues[0].message).toMatch(/mayor que cero/)
    })

    it('rechaza una tabla sin filas por pagina', () => {
      const issues = validateDefinition(base([doc({ sections: [table({ rowsPerPage: 0 })] })]))
      expect(issues.some(i => /filas por pagina/.test(i.message))).toBe(true)
    })

    it('rechaza una tabla sin columnas', () => {
      const issues = validateDefinition(base([doc({ sections: [table({ columns: [] })] })]))
      expect(issues.some(i => /no tiene columnas/.test(i.message))).toBe(true)
    })

    it('rechaza una lista de verificacion vacia', () => {
      const issues = validateDefinition(base([doc({
        sections: [{ kind: 'checklist', id: 'c', columns: 1, items: [] }],
      })]))
      expect(issues[0].message).toMatch(/esta vacia/)
    })
  })

  describe('secciones de filas', () => {
    const rowsSection = (extra: any = {}) => ({
      kind: 'rows',
      id: 'cuerpo',
      rows: [{
        id: 'f1',
        cells: [
          { id: 'c1', width: 30, content: { kind: 'text', text: 'NAVE:' } },
          { id: 'c2', width: 70, content: { kind: 'data', source: 'nave' } },
        ],
      }],
      ...extra,
    })

    it('acepta una seccion de filas completa', () => {
      expect(validateDefinition(base([doc({ sections: [rowsSection()] })]))).toEqual([])
    })

    it('exige que la seccion tenga filas', () => {
      const issues = validateDefinition(base([doc({ sections: [rowsSection({ rows: [] })] })]))
      expect(issues.some(i => /no tiene filas/.test(i.message))).toBe(true)
    })

    it('exige que la fila tenga columnas', () => {
      const issues = validateDefinition(base([doc({
        sections: [rowsSection({ rows: [{ id: 'f1', cells: [] }] })],
      })]))
      expect(issues.some(i => /no tiene columnas/.test(i.message))).toBe(true)
    })

    it('rechaza una fila cuyas columnas no reparten el ancho entero', () => {
      // Sale corta o se desborda, y eso no se ve hasta imprimir.
      const issues = validateDefinition(base([doc({
        sections: [rowsSection({
          rows: [{
            id: 'f1',
            cells: [
              { id: 'c1', width: 30, content: { kind: 'text', text: 'A' } },
              { id: 'c2', width: 30, content: { kind: 'blank' } },
            ],
          }],
        })],
      })]))
      expect(issues[0].message).toMatch(/suman 60% y deben sumar 100%/)
    })

    it('rechaza un ancho de cero', () => {
      const issues = validateDefinition(base([doc({
        sections: [rowsSection({
          rows: [{ id: 'f1', cells: [{ id: 'c1', width: 0, content: { kind: 'blank' } }] }],
        })],
      })]))
      expect(issues.some(i => /mayor que cero/.test(i.message))).toBe(true)
    })

    it('rechaza un contenido desconocido', () => {
      const issues = validateDefinition(base([doc({
        sections: [rowsSection({
          rows: [{ id: 'f1', cells: [{ id: 'c1', width: 100, content: { kind: 'video' } }] }],
        })],
      })]))
      expect(issues[0].message).toMatch(/contenido desconocido: "video"/)
    })

    it('rechaza un origen que el motor no sabe resolver', () => {
      const issues = validateDefinition(base([doc({
        sections: [rowsSection({
          rows: [{
            id: 'f1',
            cells: [{ id: 'c1', width: 100, content: { kind: 'data', source: 'inventado' } }],
          }],
        })],
      })]))
      expect(issues[0].message).toMatch(/origen desconocido/)
    })

    it('rechaza una transformacion inventada', () => {
      const issues = validateDefinition(base([doc({
        sections: [rowsSection({
          rows: [{
            id: 'f1',
            cells: [{
              id: 'c1', width: 100,
              content: { kind: 'data', source: 'fecha', transform: 'titulo' },
            }],
          }],
        })],
      })]))
      expect(issues[0].message).toMatch(/transformacion desconocida/)
    })

    it('rechaza la condicion de una casilla con un origen inventado', () => {
      // Una casilla que se marca sola con un origen con errata no da error: sale
      // siempre en blanco. En la hoja de asistencia eso es decir que la jornada
      // es otra, y nadie lo ve hasta auditar el registro.
      const issues = validateDefinition(base([doc({
        sections: [rowsSection({
          rows: [{
            id: 'f1',
            cells: [{
              id: 'c1', width: 100,
              content: {
                kind: 'check',
                when: { source: 'inventado', equals: '07:00' },
              },
            }],
          }],
        })],
      })]))
      expect(issues[0].path).toMatch(/content\.when\.source$/)
      expect(issues[0].message).toMatch(/origen desconocido/)
    })

    it('acepta una casilla que se marca sola con un origen del catalogo', () => {
      const issues = validateDefinition(base([doc({
        sections: [rowsSection({
          rows: [{
            id: 'f1',
            cells: [{
              id: 'c1', width: 100,
              content: {
                kind: 'check',
                when: { source: 'turno', transform: 'horaInicio', equals: '07:00' },
              },
            }],
          }],
        })],
      })]))
      expect(issues).toEqual([])
    })

    it('acepta una casilla de firma de una persona', () => {
      const issues = validateDefinition(base([doc({
        sections: [rowsSection({
          rows: [{
            id: 'f1',
            cells: [{
              id: 'c1', width: 100,
              content: { kind: 'signature', source: 'jefeCubierta' },
            }],
          }],
        })],
      })]))
      expect(issues).toEqual([])
    })

    it('rechaza una casilla de firma con un origen inventado', () => {
      const issues = validateDefinition(base([doc({
        sections: [rowsSection({
          rows: [{
            id: 'f1',
            cells: [{
              id: 'c1', width: 100,
              content: { kind: 'signature', source: 'inventado' },
            }],
          }],
        })],
      })]))
      expect(issues[0].message).toMatch(/origen desconocido/)
    })

    it('rechaza pedir la firma de algo que no es una persona', () => {
      // Una casilla de firma con origen `nave` no da error al emitir: sale
      // siempre en blanco. En un documento que se audita, un hueco sin firmar y
      // un hueco que no supo de quien era la firma se ven exactamente igual.
      const issues = validateDefinition(base([doc({
        sections: [rowsSection({
          rows: [{
            id: 'f1',
            cells: [{
              id: 'c1', width: 100,
              content: { kind: 'signature', source: 'nave' },
            }],
          }],
        })],
      })]))
      expect(issues[0].message).toMatch(/no es una persona y no tiene firma/)
    })

    it('rechaza una columna de imagen sin imagenes', () => {
      const issues = validateDefinition(base([doc({
        sections: [rowsSection({
          rows: [{
            id: 'f1',
            cells: [{ id: 'c1', width: 100, content: { kind: 'image', images: [] } }],
          }],
        })],
      })]))
      expect(issues.some(i => /no tiene ninguna/.test(i.message))).toBe(true)
    })

    it('rechaza una imagen sin sha1', () => {
      const issues = validateDefinition(base([doc({
        sections: [rowsSection({
          rows: [{
            id: 'f1',
            cells: [{
              id: 'c1', width: 100,
              content: { kind: 'image', images: [{ alt: 'x' }] },
            }],
          }],
        })],
      })]))
      expect(issues.some(i => /necesita su sha1/.test(i.message))).toBe(true)
    })

    it('acepta varias imagenes en la misma columna', () => {
      // Los pictogramas del permiso de trabajo van en bandas de varios.
      const issues = validateDefinition(base([doc({
        sections: [rowsSection({
          rows: [{
            id: 'f1',
            cells: [{
              id: 'c1', width: 100,
              content: {
                kind: 'image',
                images: [{ sha1: 'a', alt: 'x' }, { sha1: 'b', alt: 'y' }],
                text: 'Casco',
              },
            }],
          }],
        })],
      })]))
      expect(issues).toEqual([])
    })
  })

  describe('numeracion', () => {
    it('acepta series propias', () => {
      const issues = validateDefinition(base([doc({
        numbering: { kind: 'own', series: { id: 'ats', prefix: 'ATS', scope: 'year', pad: 4 } },
      })]))
      expect(issues).toEqual([])
    })

    it('rechaza una serie sin prefijo valido ni digitos', () => {
      const issues = validateDefinition(base([doc({
        numbering: { kind: 'own', series: { id: 'ats', prefix: 'ATS', scope: 'anual', pad: 0 } },
      })]))
      expect(issues[0].message).toMatch(/ambito \(year o global\)/)
    })

    it('rechaza mas de diez digitos', () => {
      const issues = validateDefinition(base([doc({
        numbering: { kind: 'own', series: { id: 'a', prefix: 'A', scope: 'year', pad: 99 } },
      })]))
      expect(issues.length).toBeGreaterThan(0)
    })

    it('rechaza un origen de numeracion desconocido', () => {
      const issues = validateDefinition(base([doc({ numbering: { kind: 'aleatorio' } })]))
      expect(issues.some(i => /origen de numeracion desconocido/.test(i.message))).toBe(true)
    })

    it('rechaza heredar de un documento que no existe', () => {
      const issues = validateDefinition(base([doc({ numbering: { kind: 'inherit', from: 'pts' } })]))
      expect(issues.some(i => /no existe en este formato/.test(i.message))).toBe(true)
    })

    it('rechaza un ciclo entre numeraciones', () => {
      const issues = validateDefinition(base([
        doc({ id: 'a', numbering: { kind: 'inherit', from: 'b' } }),
        doc({ id: 'b', numbering: { kind: 'inherit', from: 'a' } }),
      ]))
      expect(issues.some(i => /ciclo/.test(i.message))).toBe(true)
    })

    it('acepta la herencia que reproduce el pie del permiso de trabajo', () => {
      const issues = validateDefinition(base([
        doc({
          id: 'pts',
          numbering: { kind: 'own', series: { id: 'pts', prefix: 'PTS', scope: 'global', pad: 4 } },
        }),
        doc({ id: 'pts-3c', numbering: { kind: 'inherit', from: 'pts' } }),
      ]))
      expect(issues).toEqual([])
    })
  })

  it('señala la ruta exacta del problema', () => {
    const issues = validateDefinition(base([doc({
      sections: [table(), {
        kind: 'fields', id: 'f', columns: 1,
        fields: [{ id: 'x', label: 'X', source: 'inventado' }],
      }],
    })]))
    // La pantalla del maestro necesita saber a que campo llevar al usuario.
    expect(issues[0].path).toBe('documents[0].sections[1].fields[0].source')
  })
})
