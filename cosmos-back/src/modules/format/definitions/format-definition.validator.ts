import { isValidSeries } from '../../../common/numbering/document-number.service'
import {
  FIELD_SOURCES,
  FIELD_TRANSFORMS,
  FormatDefinition,
  PERSON_COLUMNS,
} from '../v2/document-model'
import { validateNumbering } from '../v2/numbering'

export interface ValidationIssue {
  /** Ruta dentro de la definicion: `documents[0].sections[2].fields[1].source`. */
  path: string
  message: string
}

/**
 * Los tipos de seccion que el motor sabe pintar en las tres salidas.
 *
 * Se exporta para que el catalogo del maestro sirva esta misma lista: con dos
 * copias, anadir un tipo obligaria a tocar los dos sitios y la pantalla podria
 * ofrecer algo que el validador rechaza al publicar.
 */
export const SECTION_KINDS = ['header', 'fields', 'checklist', 'table', 'rows', 'signatures']

/**
 * Origenes que pueden imprimir una firma.
 *
 * Son las personas cuya firma resuelve el constructor. `supervisorSsoma` y los
 * de la naviera llegan como texto suelto y no traen documento, asi que no hay
 * con que buscar su firma registrada; si algun dia lo traen, se anaden aqui y
 * en `DocumentBuilder.signatureOf`, que son los dos sitios que hay que tocar.
 */
export const SIGNABLE_SOURCES: readonly string[] = ['supervisorOperaciones', 'jefeCubierta']

/**
 * Valida una definicion antes de publicarla.
 *
 * Es la frontera del maestro. Todo lo que se puede editar en pantalla sale de
 * catalogos cerrados, y aqui se comprueba que efectivamente sea asi: con texto
 * libre en `source` o en `transform`, la primera errata deja un campo en blanco
 * en un documento que por lo demas parece correcto, y eso es peor que un error.
 *
 * Se valida al **publicar**, no al guardar. Un borrador a medias tiene que
 * poder guardarse; lo que no puede es llegar a emitir formatos.
 */
export function validateDefinition(definition: FormatDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!definition?.formatType?.trim()) {
    issues.push({ path: 'formatType', message: 'el tipo de formato es obligatorio' })
  }
  if (!Array.isArray(definition?.documents) || definition.documents.length === 0) {
    issues.push({ path: 'documents', message: 'la definicion no tiene ningun documento' })
    return issues
  }

  const documentIds = new Set<string>()
  definition.documents.forEach((document, documentIndex) => {
    const at = `documents[${documentIndex}]`

    if (!document.id?.trim()) {
      issues.push({ path: `${at}.id`, message: 'el documento necesita un id' })
    } else if (documentIds.has(document.id)) {
      issues.push({ path: `${at}.id`, message: `el id "${document.id}" esta repetido` })
    } else {
      documentIds.add(document.id)
    }

    if (!document.name?.trim()) {
      issues.push({ path: `${at}.name`, message: 'el documento necesita un nombre de hoja' })
    }
    if (document.orientation !== 'portrait' && document.orientation !== 'landscape') {
      issues.push({ path: `${at}.orientation`, message: 'la orientacion es portrait o landscape' })
    }

    if (document.numbering) {
      const numbering: any = document.numbering
      if (numbering.kind === 'own' && !isValidSeries(numbering.series)) {
        issues.push({
          path: `${at}.numbering.series`,
          message: 'la serie necesita id, prefijo, ambito (year o global) y digitos entre 1 y 10',
        })
      }
      if (numbering.kind === 'inherit' && !numbering.from?.trim()) {
        issues.push({ path: `${at}.numbering.from`, message: 'falta el documento del que hereda' })
      }
      if (!['none', 'own', 'inherit', 'namedCode'].includes(numbering.kind)) {
        issues.push({ path: `${at}.numbering.kind`, message: `origen de numeracion desconocido: "${numbering.kind}"` })
      }
    }

    if (!Array.isArray(document.sections)) {
      issues.push({ path: `${at}.sections`, message: 'el documento no tiene secciones' })
      return
    }

    const sectionIds = new Set<string>()
    document.sections.forEach((section: any, sectionIndex: number) => {
      const sectionAt = `${at}.sections[${sectionIndex}]`

      if (!SECTION_KINDS.includes(section.kind)) {
        issues.push({ path: `${sectionAt}.kind`, message: `tipo de seccion desconocido: "${section.kind}"` })
        return
      }
      if (!section.id?.trim()) {
        issues.push({ path: `${sectionAt}.id`, message: 'la seccion necesita un id' })
      } else if (sectionIds.has(section.id)) {
        issues.push({ path: `${sectionAt}.id`, message: `el id "${section.id}" esta repetido` })
      } else {
        sectionIds.add(section.id)
      }

      const checkField = (field: any, path: string) => {
        if (!field.id?.trim()) {
          issues.push({ path: `${path}.id`, message: 'el campo necesita un id' })
        }
        if (!(FIELD_SOURCES as readonly string[]).includes(field.source)) {
          issues.push({ path: `${path}.source`, message: `origen desconocido: "${field.source}"` })
        }
        if (field.transform && !(FIELD_TRANSFORMS as readonly string[]).includes(field.transform)) {
          issues.push({
            path: `${path}.transform`,
            message: `transformacion desconocida: "${field.transform}"`,
          })
        }
        if (field.source === 'literal' && typeof field.literal !== 'string') {
          issues.push({ path: `${path}.literal`, message: 'un campo literal necesita su texto' })
        }
      }

      if (section.kind === 'header' || section.kind === 'fields') {
        const fields = section.fields ?? []
        if (section.kind === 'fields' && fields.length === 0) {
          issues.push({ path: `${sectionAt}.fields`, message: 'la seccion de campos esta vacia' })
        }
        fields.forEach((field: any, index: number) =>
          checkField(field, `${sectionAt}.fields[${index}]`)
        )
      }

      if (section.kind === 'checklist') {
        const items = section.items ?? []
        if (items.length === 0) {
          issues.push({ path: `${sectionAt}.items`, message: 'la lista de verificacion esta vacia' })
        }
        items.forEach((item: any, index: number) => {
          const itemAt = `${sectionAt}.items[${index}]`
          if (!item.id?.trim()) {
            issues.push({ path: `${itemAt}.id`, message: 'el elemento necesita un id' })
          }
          if (!item.label?.trim()) {
            issues.push({ path: `${itemAt}.label`, message: 'el elemento necesita una etiqueta' })
          }
          if (item.when && !(FIELD_SOURCES as readonly string[]).includes(item.when.source)) {
            issues.push({
              path: `${itemAt}.when.source`,
              message: `origen desconocido: "${item.when.source}"`,
            })
          }
        })
      }

      if (section.kind === 'table') {
        const columns = section.columns ?? []
        if (columns.length === 0) {
          issues.push({ path: `${sectionAt}.columns`, message: 'la tabla no tiene columnas' })
        }
        columns.forEach((column: any, index: number) => {
          const columnAt = `${sectionAt}.columns[${index}]`
          if (!(PERSON_COLUMNS as readonly string[]).includes(column.source)) {
            issues.push({
              path: `${columnAt}.source`,
              message: `columna desconocida: "${column.source}"`,
            })
          }
          if (!(column.widthMm > 0)) {
            issues.push({ path: `${columnAt}.widthMm`, message: 'el ancho debe ser mayor que cero' })
          }
        })
        if (!(section.rowsPerPage > 0)) {
          issues.push({
            path: `${sectionAt}.rowsPerPage`,
            message: 'las filas por pagina deben ser mayores que cero',
          })
        }
        ;(section.leadingRows ?? []).forEach((row: any, index: number) => {
          const rowAt = `${sectionAt}.leadingRows[${index}]`
          if (!(FIELD_SOURCES as readonly string[]).includes(row.nameSource)) {
            issues.push({ path: `${rowAt}.nameSource`, message: `origen desconocido: "${row.nameSource}"` })
          }
        })
      }

      if (section.kind === 'rows') {
        const rows = section.rows ?? []
        if (rows.length === 0) {
          issues.push({ path: `${sectionAt}.rows`, message: 'la seccion no tiene filas' })
        }
        rows.forEach((row: any, rowIndex: number) => {
          const rowAt = `${sectionAt}.rows[${rowIndex}]`
          if (!row.id?.trim()) {
            issues.push({ path: `${rowAt}.id`, message: 'la fila necesita un id' })
          }
          const cells = row.cells ?? []
          if (cells.length === 0) {
            issues.push({ path: `${rowAt}.cells`, message: 'la fila no tiene columnas' })
            return
          }

          const total = cells.reduce((sum: number, cell: any) => sum + (cell.width ?? 0), 0)
          // Las columnas de una fila reparten el ancho entero. Si no suman 100,
          // la fila sale corta o se desborda, y eso no se ve hasta imprimir.
          if (Math.abs(total - 100) > 1) {
            issues.push({
              path: `${rowAt}.cells`,
              message: `las columnas suman ${Math.round(total)}% y deben sumar 100%`,
            })
          }

          cells.forEach((cell: any, cellIndex: number) => {
            const cellAt = `${rowAt}.cells[${cellIndex}]`
            if (!cell.id?.trim()) {
              issues.push({ path: `${cellAt}.id`, message: 'la columna necesita un id' })
            }
            if (!(cell.width > 0)) {
              issues.push({ path: `${cellAt}.width`, message: 'el ancho debe ser mayor que cero' })
            }
            const content = cell.content
            if (!content?.kind) {
              issues.push({ path: `${cellAt}.content`, message: 'la columna necesita contenido' })
              return
            }
            if (!['text', 'data', 'check', 'image', 'signature', 'blank'].includes(content.kind)) {
              issues.push({
                path: `${cellAt}.content.kind`,
                message: `contenido desconocido: "${content.kind}"`,
              })
            }
            if (content.kind === 'data') {
              if (!(FIELD_SOURCES as readonly string[]).includes(content.source)) {
                issues.push({
                  path: `${cellAt}.content.source`,
                  message: `origen desconocido: "${content.source}"`,
                })
              }
              if (content.transform &&
                !(FIELD_TRANSFORMS as readonly string[]).includes(content.transform)) {
                issues.push({
                  path: `${cellAt}.content.transform`,
                  message: `transformacion desconocida: "${content.transform}"`,
                })
              }
            }
            // Solo las personas tienen firma. Con un origen que no la tenga la
            // casilla no da error: sale siempre en blanco, y en un documento
            // que se audita un hueco sin firmar y un hueco que no supo de quien
            // era la firma se ven exactamente igual.
            if (content.kind === 'signature') {
              if (!(FIELD_SOURCES as readonly string[]).includes(content.source)) {
                issues.push({
                  path: `${cellAt}.content.source`,
                  message: `origen desconocido: "${content.source}"`,
                })
              } else if (!SIGNABLE_SOURCES.includes(content.source)) {
                issues.push({
                  path: `${cellAt}.content.source`,
                  message: `"${content.source}" no es una persona y no tiene firma`,
                })
              }
            }
            // Una casilla que se marca sola declara su condicion igual que un
            // punto de la lista de verificacion, y se valida igual. Con un
            // origen con errata la casilla no da error: sale siempre en blanco,
            // que en la hoja de asistencia significa decir que la jornada es
            // otra.
            if (content.kind === 'check' && content.when) {
              if (!(FIELD_SOURCES as readonly string[]).includes(content.when.source)) {
                issues.push({
                  path: `${cellAt}.content.when.source`,
                  message: `origen desconocido: "${content.when.source}"`,
                })
              }
              if (content.when.transform &&
                !(FIELD_TRANSFORMS as readonly string[]).includes(content.when.transform)) {
                issues.push({
                  path: `${cellAt}.content.when.transform`,
                  message: `transformacion desconocida: "${content.when.transform}"`,
                })
              }
              if (typeof content.when.equals !== 'string') {
                issues.push({
                  path: `${cellAt}.content.when.equals`,
                  message: 'la condicion necesita el valor con el que compara',
                })
              }
            }
            // La marca es si o no. Un `"false"` en texto se leeria como marcado.
            const marca = content as { kind: string; marked?: unknown; checked?: unknown }
            const valor = marca.kind === 'text' ? marca.marked : marca.kind === 'check' ? marca.checked : undefined
            if (valor !== undefined && typeof valor !== 'boolean') {
              issues.push({
                path: `${cellAt}.content.${marca.kind === 'text' ? 'marked' : 'checked'}`,
                message: 'la marca debe ser verdadero o falso',
              })
            }
            if (content.kind === 'image') {
              const images = content.images ?? []
              if (images.length === 0) {
                issues.push({
                  path: `${cellAt}.content.images`,
                  message: 'la columna de imagen no tiene ninguna',
                })
              }
              images.forEach((image: any, imageIndex: number) => {
                if (!image?.sha1?.trim()) {
                  issues.push({
                    path: `${cellAt}.content.images[${imageIndex}].sha1`,
                    message: 'la imagen necesita su sha1',
                  })
                }
              })
            }
          })
        })
      }

      if (section.kind === 'signatures') {
        const slots = section.slots ?? []
        if (slots.length === 0) {
          issues.push({ path: `${sectionAt}.slots`, message: 'el bloque de firmas esta vacio' })
        }
        slots.forEach((slot: any, index: number) => {
          if (slot.nameSource && !(FIELD_SOURCES as readonly string[]).includes(slot.nameSource)) {
            issues.push({
              path: `${sectionAt}.slots[${index}].nameSource`,
              message: `origen desconocido: "${slot.nameSource}"`,
            })
          }
        })
      }
    })
  })

  // Las dependencias entre numeraciones se comprueban sobre el conjunto: una
  // herencia solo se puede juzgar mirando los demas documentos.
  for (const error of validateNumbering(definition.documents as any)) {
    issues.push({
      path: `documents[${error.documentId}].numbering`,
      message: error.message,
    })
  }

  return issues
}
