import { Injectable } from '@nestjs/common'
import { FormatData, FormatPerson } from '../format-data.service'
import {
  ColumnDefinition,
  DocumentDefinition,
  FieldDefinition,
  FieldSource,
  FieldTransform,
  FormatDefinition,
  PersonColumn,
  ResolvedDocument,
  ResolvedField,
  ResolvedFormat,
  ResolvedSection,
  SectionDefinition,
} from './document-model'

/**
 * Aplica una definicion a los datos de una nombrada.
 *
 * Es la unica pieza que sabe traducir `source` y `transform` a un valor. Los
 * renderizadores reciben texto ya resuelto y no vuelven a decidir nada: si el
 * Excel y la impresion pudieran interpretar un campo cada uno a su manera,
 * acabarian diciendo cosas distintas, que es exactamente lo que este motor
 * existe para evitar.
 *
 * Tampoco pagina cada renderizador por su cuenta. Las paginas se calculan aqui,
 * porque una hoja de calculo y una pagina HTML no cortan igual y el corte tiene
 * que ser el mismo en los tres sitios.
 */

/**
 * Un texto preimpreso con su marca.
 *
 * Si el rotulo trae su propio hueco, `TRABAJO EN CALIENTE  (     )`, la X va
 * dentro de el, que es como se rellena a mano. Si no, `SI` pasa a `X SI`: la X
 * delante y el rotulo intacto, para que se sepa que se marco.
 */
export function markText(text: string): string {
  const hueco = /\(\s*\)/
  return hueco.test(text) ? text.replace(hueco, '( X )') : `X ${text.trim()}`
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

@Injectable()
export class DocumentBuilder {
  /**
   * `numbers` trae el correlativo ya resuelto de cada documento, por su `id`.
   *
   * Llega desde fuera y no se calcula aqui a proposito: repartir un correlativo
   * escribe en la base de datos, y este constructor es una funcion pura sobre
   * la definicion y los datos. Mezclarlo haria que componer un documento para
   * previsualizarlo consumiera numeros de la serie.
   */
  build(
    definition: FormatDefinition,
    data: FormatData,
    numbers: Map<string, string> = new Map()
  ): ResolvedFormat {
    return {
      formatType: definition.formatType,
      label: definition.label,
      version: definition.version,
      engine: 'v2',
      documents: definition.documents.map(doc =>
        this.buildDocument(doc, data, numbers.get(doc.id) ?? '')
      ),
    }
  }

  private buildDocument(
    definition: DocumentDefinition,
    data: FormatData,
    documentNumber: string
  ): ResolvedDocument {
    const sections = definition.sections
      .filter(section => section.visible !== false)
      .map(section => this.buildSection(section, data, documentNumber))

    // Las paginas del documento las marca su tabla mas larga. Se calcula
    // despues de construir las secciones y se le pasa a la cabecera, que es
    // quien imprime "Página 1 de N" y no puede saberlo por su cuenta.
    const pages = Math.max(
      1,
      ...sections.filter(s => s.kind === 'table').map(s => s.pages)
    )
    for (const section of sections) {
      if (section.kind === 'header' && section.pages !== null) {
        section.pages = pages
      }
    }

    return {
      id: definition.id,
      name: definition.name,
      orientation: definition.orientation,
      pages,
      printPages: Math.max(1, definition.printPages ?? 1) * pages,
      number: documentNumber,
      documentCode: definition.documentCode,
      documentVersion: definition.documentVersion,
      documentDate: definition.documentDate,
      sections,
    }
  }

  private buildSection(
    definition: SectionDefinition,
    data: FormatData,
    documentNumber: string
  ): ResolvedSection {
    switch (definition.kind) {
      case 'header':
        return {
          kind: 'header',
          id: definition.id,
          title: definition.title,
          logo: definition.logo,
          documentCode: definition.documentCode,
          documentVersion: definition.documentVersion,
          documentDate: definition.documentDate,
          // Se rellena en `buildDocument`, que es donde se sabe cuantas hay.
          pages: definition.pageIndicator ? 1 : null,
          fields: this.buildFields(
            definition.fields ?? [],
            data,
            documentNumber
          ),
        }

      case 'fields':
        return {
          kind: 'fields',
          id: definition.id,
          title: definition.title,
          columns: definition.columns,
          fields: this.buildFields(definition.fields, data, documentNumber),
        }

      case 'checklist':
        return {
          kind: 'checklist',
          id: definition.id,
          title: definition.title,
          columns: definition.columns,
          items: definition.items.map(item => ({
            id: item.id,
            label: item.label,
            checked: this.isChecked(item, data, documentNumber),
            image: item.image,
          })),
        }

      case 'table':
        return this.buildTable(definition, data)

      case 'rows':
        return {
          kind: 'rows',
          id: definition.id,
          title: definition.title,
          rows: definition.rows
            .filter(row => row.visible !== false)
            .map(row => ({
              id: row.id,
              minHeightMm: row.minHeightMm,
              cells: row.cells
                .filter(cell => cell.visible !== false)
                .map(cell => {
                  const content = cell.content
                  return {
                    id: cell.id,
                    width: cell.width,
                    kind: content.kind,
                    // Una celda lleva texto o un dato, nunca los dos: si trae
                    // dato, el texto es lo que ese dato resuelva.
                    text:
                      content.kind === 'text'
                        ? content.marked
                          ? markText(content.text)
                          : content.text
                        : content.kind === 'data'
                          ? this.valueOf(
                              content.source,
                              content.transform,
                              undefined,
                              data,
                              documentNumber
                            )
                          : content.kind === 'image'
                            ? (content.text ?? '')
                            : '',
                    checked:
                      content.kind === 'check'
                        ? this.isChecked(
                            content,
                            data,
                            documentNumber,
                            !!content.checked
                          )
                        : content.kind === 'text' && !!content.marked,
                    images:
                      content.kind === 'image' ? content.images : undefined,
                    ...(content.kind === 'signature'
                      ? { signatureUrl: this.signatureOf(content.source, data) }
                      : {}),
                    bold: !!cell.bold,
                    align: cell.align ?? 'left',
                    fill: !!cell.fill,
                    boxed: cell.boxed !== false,
                  }
                }),
            })),
        }

      case 'signatures':
        return {
          kind: 'signatures',
          id: definition.id,
          title: definition.title,
          columns: definition.columns,
          slots: definition.slots.map(slot => ({
            id: slot.id,
            label: slot.label,
            name: slot.nameSource
              ? this.valueOf(
                  slot.nameSource,
                  'soloNombre',
                  undefined,
                  data,
                  documentNumber
                )
              : '',
          })),
        }
    }
  }

  private buildFields(
    definitions: FieldDefinition[],
    data: FormatData,
    documentNumber: string
  ): ResolvedField[] {
    return definitions
      .filter(field => field.visible !== false)
      .map(field => ({
        id: field.id,
        label: field.label,
        value: this.valueOf(
          field.source,
          field.transform,
          field.literal,
          data,
          documentNumber
        ),
        span: field.span,
      }))
  }

  private buildTable(
    definition: Extract<SectionDefinition, { kind: 'table' }>,
    data: FormatData
  ) {
    const rows: string[][] = []
    const signatures: (string | null)[][] = []

    const push = (
      person: FormatPerson,
      leading: boolean,
      firstOfList = false
    ) => {
      rows.push(
        this.personRow(
          person,
          rows.length + 1,
          definition.columns,
          leading,
          firstOfList
        )
      )
      signatures.push(this.personSignatures(person, definition.columns))
    }

    // Las filas de cabeza no salen de la lista de personal: son responsables
    // que firman el documento y que la lista no incluye.
    for (const leading of definition.leadingRows ?? []) {
      const document = leading.documentSource
        ? this.valueOf(leading.documentSource, 'soloDocumento', undefined, data)
        : ''
      push(
        {
          cargo: leading.cargo,
          nombres: this.valueOf(
            leading.nameSource,
            'soloNombre',
            undefined,
            data
          ),
          documento: document,
          horaIngreso: '',
          horaSalida: '',
          // La firma de una fila de cabeza sale de su origen, no de la lista: esa
          // persona no esta en `data.people`.
          signature: this.signatureOf(leading.nameSource, data),
        },
        true
      )
    }

    const firstPersonRow = rows.length
    for (const person of data.people) {
      push(person, false, rows.length === firstPersonRow)
    }

    // Huecos en blanco para anadir a mano. Se numeran igual: un hueco sin
    // numero en un formato firmado es un hueco que nadie sabe si falta.
    const minRows = definition.minRows ?? 0
    while (rows.length < minRows) {
      push(
        {
          cargo: '',
          nombres: '',
          documento: '',
          horaIngreso: '',
          horaSalida: '',
        },
        false,
        rows.length === firstPersonRow
      )
    }

    return {
      kind: 'table' as const,
      id: definition.id,
      title: definition.title,
      columns: definition.columns.map(column => ({
        id: column.id,
        label: column.label,
        widthMm: column.widthMm,
        align: column.align ?? 'left',
      })),
      rows,
      signatures,
      rowsPerPage: definition.rowsPerPage,
      pages: Math.max(1, Math.ceil(rows.length / definition.rowsPerPage)),
    }
  }

  /**
   * La firma de una fila, columna a columna.
   *
   * Solo las columnas marcadas con `signature` la llevan, y solo si la persona
   * tiene una guardada. El resto va a `null`, que es lo que deja el hueco en
   * blanco para firmar a mano.
   */
  private personSignatures(
    person: FormatPerson,
    columns: ColumnDefinition[]
  ): (string | null)[] {
    return columns.map(column =>
      column.signature && column.source === 'firma' && person.signature
        ? person.signature
        : null
    )
  }

  /**
   * Una fila de la tabla.
   *
   * `leading` distingue las filas de cabeza, que llevan su cargo escrito en la
   * definicion, de las del personal, donde una columna puede traer texto
   * preimpreso en vez de dato.
   */
  private personRow(
    person: FormatPerson,
    number: number,
    columns: ColumnDefinition[],
    leading: boolean,
    firstOfList = false
  ): string[] {
    return columns.map(column => {
      if (!leading && column.fixedText) {
        return (
          (firstOfList ? column.fixedText.firstRow : undefined) ??
          column.fixedText.rest
        )
      }
      return this.personValue(person, number, column.source)
    })
  }

  private personValue(
    person: FormatPerson,
    number: number,
    source: PersonColumn
  ): string {
    switch (source) {
      case 'numero':
        return String(number)
      case 'cargo':
        return person.cargo
      case 'nombre':
        return person.nombres
      case 'documento':
        return person.documento
      case 'horaIngreso':
        return person.horaIngreso
      case 'horaSalida':
        return person.horaSalida
      case 'firma':
        return ''
    }
  }

  /**
   * Si una casilla sale marcada.
   *
   * Sirve tanto a los puntos de una lista de verificacion como a las casillas
   * sueltas de una fila: las dos declaran la condicion igual, y las dos tienen
   * que resolverla contra los datos de esta nombrada y no contra lo que trajera
   * la plantilla escrito.
   */
  private isChecked(
    item: {
      when?: { source: FieldSource; transform?: FieldTransform; equals: string }
    },
    data: FormatData,
    documentNumber: string,
    /** Valor fijo cuando no hay condicion; la casilla se rellena a mano. */
    fallback = false
  ): boolean {
    if (!item.when) {
      return fallback
    }
    const value = this.valueOf(
      item.when.source,
      item.when.transform,
      undefined,
      data,
      documentNumber
    )
    return value.trim().toLowerCase() === item.when.equals.trim().toLowerCase()
  }

  /**
   * La firma registrada de un responsable, o cadena vacia.
   *
   * Solo las personas tienen firma. Pedir la firma de la nave o de la fecha no
   * es un error que valga la pena senalar: devuelve vacio y la casilla queda en
   * blanco, igual que si esa persona no la hubiera registrado.
   */
  private signatureOf(source: FieldSource, data: FormatData): string {
    switch (source) {
      case 'supervisorOperaciones':
        return data.supervisorOperaciones?.signature ?? ''
      case 'jefeCubierta':
        return data.jefeCubierta?.signature ?? ''
      default:
        return ''
    }
  }

  /** Hora de inicio o de fin de un turno `07:00 - 15:00`. */
  private shiftPart(shift: string, part: 0 | 1): string {
    return (shift ?? '').split('-')[part]?.trim() ?? ''
  }

  private valueOf(
    source: FieldSource,
    transform: FieldTransform | undefined,
    literal: string | undefined,
    data: FormatData,
    documentNumber = ''
  ): string {
    if (source === 'literal') {
      return this.apply(literal ?? '', transform, data)
    }

    switch (source) {
      case 'nave':
        return this.apply(data.vesselDescription ?? '', transform, data)
      case 'muelle':
        return this.apply(data.pierDescription ?? '', transform, data)
      case 'turno':
        return this.apply(
          data.shiftDescription ?? '',
          transform ?? 'texto',
          data
        )
      case 'jornada':
        return this.apply(
          data.shiftDescription ?? '',
          transform ?? 'numeroJornada',
          data
        )
      case 'fecha':
        return this.applyDate(data.workerDateValue, transform ?? 'fechaCorta')
      case 'codigoNombrada':
        return this.apply(data.namedNumber, transform, data)
      case 'numeroPermiso':
        return this.apply(
          String(data.workPermitNumber ?? ''),
          transform ?? 'correlativo4',
          data
        )
      // Ya viene compuesto por la numeracion del formato (`ATS-2026-0042`), asi
      // que no lleva `correlativo4` por defecto: rellenarlo de ceros a la
      // izquierda estropearia el numero en vez de formatearlo.
      case 'numeroDocumento':
        return this.apply(documentNumber, transform, data)
      case 'totalPersonal':
        return String(data.people.length)
      case 'supervisorSsoma':
        return this.apply(data.supervisorSsoma, transform, data)
      case 'jefeCubiertaVsi':
        return this.apply(data.jefeCubiertaVsi, transform, data)
      case 'ssomaVsi':
        return this.apply(data.ssomaVsi, transform, data)

      case 'supervisorOperaciones':
      case 'jefeCubierta': {
        const person =
          source === 'jefeCubierta'
            ? data.jefeCubierta
            : data.supervisorOperaciones
        if (transform === 'nombreYDocumento') {
          return person.document
            ? `${person.fullName} - ${person.document}`
            : person.fullName
        }
        if (transform === 'soloDocumento') {
          return person.document
        }
        return this.apply(person.fullName, transform, data)
      }

      case 'temaCharla1':
        return this.apply(data.talkTopics[0]?.topic ?? '', transform, data)
      case 'temaCharla2':
        return this.apply(data.talkTopics[1]?.topic ?? '', transform, data)
      case 'temaCharla3':
        return this.apply(data.talkTopics[2]?.topic ?? '', transform, data)
      case 'resumenCharla1':
        return this.apply(data.talkTopics[0]?.summary ?? '', transform, data)
      case 'resumenCharla2':
        return this.apply(data.talkTopics[1]?.summary ?? '', transform, data)
      case 'resumenCharla3':
        return this.apply(data.talkTopics[2]?.summary ?? '', transform, data)
    }
  }

  private apply(
    value: string,
    transform: FieldTransform | undefined,
    data: FormatData
  ): string {
    switch (transform) {
      case undefined:
      case 'texto':
      case 'soloNombre':
      case 'soloDocumento':
      case 'nombreYDocumento':
        return value
      case 'mayusculas':
        return value.toUpperCase()
      case 'horaInicio':
        return this.shiftPart(value || data.shiftDescription, 0)
      case 'horaFin':
        return this.shiftPart(value || data.shiftDescription, 1)
      case 'numeroJornada': {
        const start = this.shiftPart(value || data.shiftDescription, 0)
        if (start === '07:00') return '1'
        if (start === '15:00') return '2'
        if (start === '23:00') return '3'
        return ''
      }
      case 'correlativo4':
        return value ? value.padStart(4, '0') : ''
      case 'fechaCorta':
      case 'fechaLarga':
        // Una fecha ya escrita como texto no se reinterpreta: se deja estar.
        return value
    }
  }

  private applyDate(date: Date, transform: FieldTransform): string {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return ''
    }
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    if (transform === 'fechaLarga') {
      return `${date.getDate()} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`
    }
    return `${day}/${month}/${date.getFullYear()}`
  }
}
