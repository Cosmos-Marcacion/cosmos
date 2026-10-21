import { Injectable, Logger } from '@nestjs/common'
import * as ExcelJS from 'exceljs'
import * as fs from 'fs'
import { assetPath } from './asset-library'
import {
  ResolvedDocument,
  ResolvedFormat,
  ResolvedSection,
} from './document-model'
import {
  A4,
  HEADER_ROW_HEIGHT_MM,
  ROW_HEIGHT_MM,
  contentWidthMm,
  fitColumns,
  mmToExcelWidth,
  mmToPoints,
} from './a4-grid'

/**
 * El modelo resuelto, a libro de Excel.
 *
 * Aqui si se usa ExcelJS, y conviene decir por que cuando el motor legacy lo
 * descarto: aquel **reescribe** el `.xlsx` del cliente, y el ida y vuelta por
 * ExcelJS pierde elementos de unas plantillas con 3 MB de imagenes y 1.500
 * celdas combinadas. Esto **crea un libro desde cero**: no hay ida y vuelta, no
 * hay validaciones ajenas que preservar y no hay nada que perder. Escribir el
 * XML de `drawing`, `styles` y `sheet` a mano seria reinventar una libreria
 * madura por un motivo que aqui no aplica.
 *
 * Una hoja por documento. Todas las medidas salen de `a4-grid.ts`, que es la
 * misma rejilla que aplica la vista de impresion.
 */

/** Columnas de la rejilla. Cuantas mas, mas fino se puede alinear. */
const GRID_COLUMNS = 24

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF9AA5B1' } },
  left: { style: 'thin', color: { argb: 'FF9AA5B1' } },
  bottom: { style: 'thin', color: { argb: 'FF9AA5B1' } },
  right: { style: 'thin', color: { argb: 'FF9AA5B1' } },
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE8EEF4' },
}

/**
 * Proporcion ancho/alto del lienzo en el que se firma en la app movil.
 *
 * `cosmos-app/src/app/components/sign/sign.html` dibuja sobre un canvas de
 * 500x200, y el PNG que sube conserva esas medidas. Deducir el ancho de aqui y
 * no estirar la imagen al ancho de la casilla es lo que evita que la firma
 * salga deformada: una firma estirada en un documento que se audita se lee como
 * manipulada.
 */
const SIGNATURE_ASPECT = 500 / 200

@Injectable()
export class XlsxRenderer {
  private readonly logger = new Logger(XlsxRenderer.name)

  /**
   * `signatures` son los bytes de cada firma, por su URL.
   *
   * Llegan ya descargados y no se piden aqui: el renderizador es sincrono de
   * arriba abajo, y meterle una descarga en medio obligaria a volver asincrono
   * el recorrido entero de secciones, filas y celdas para una casilla de cada
   * cien. Quien las baja es `FormatV2Engine`, que ya es asincrono.
   *
   * Una URL que no este en el mapa deja la casilla en blanco. Es el mismo hueco
   * de siempre para firmar a mano, no un error.
   */
  async render(
    format: ResolvedFormat,
    signatures: Map<string, Buffer> = new Map()
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Cosmos'
    workbook.created = new Date()

    for (const document of format.documents) {
      this.renderDocument(workbook, document, signatures)
    }

    // ExcelJS devuelve `ArrayBuffer` en algunas versiones de sus tipos; el
    // servicio de PDF y la respuesta HTTP esperan `Buffer`.
    const written = await workbook.xlsx.writeBuffer()
    return Buffer.from(written as ArrayBuffer)
  }

  private renderDocument(
    workbook: ExcelJS.Workbook,
    document: ResolvedDocument,
    signatures: Map<string, Buffer>
  ) {
    // Excel no admite `:` `\` `/` `?` `*` `[` `]` en el nombre de hoja, ni mas
    // de 31 caracteres. Un nombre invalido no da error: corrompe el libro.
    const name = document.name.replace(/[:\\/?*[\]]/g, '-').slice(0, 31)
    const sheet = workbook.addWorksheet(name, {
      pageSetup: {
        paperSize: 9, // A4
        orientation: document.orientation,
        // Las mismas hojas que la plantilla original, a lo ancho y a lo alto.
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: document.printPages ?? 1,
        margins: {
          top: A4.marginMm.top / 25.4,
          bottom: A4.marginMm.bottom / 25.4,
          left: A4.marginMm.left / 25.4,
          right: A4.marginMm.right / 25.4,
          header: 0,
          footer: 0,
        },
      },
      views: [{ showGridLines: false }],
    })

    // Todo el documento se apoya en la misma rejilla de columnas estrechas.
    // Las secciones no traen anchos propios: cada celda dice que porcentaje de
    // su fila ocupa, y aqui se traduce a un numero de columnas de esta rejilla.
    const totalWidth = contentWidthMm(document.orientation)
    const columnWidth = totalWidth / GRID_COLUMNS
    for (let i = 1; i <= GRID_COLUMNS; i++) {
      sheet.getColumn(i).width = mmToExcelWidth(columnWidth)
    }

    let row = 1

    // El correlativo y el numero de pagina, en una linea propia.
    //
    // Solo cuando el documento no trae seccion de cabecera: los generados desde
    // plantilla llevan la suya dentro de la rejilla preimpresa, y ahi no hay
    // sitio reservado para un numero que la hoja original no tenia.
    const hasHeader = document.sections.some(
      section => section.kind === 'header'
    )
    if (!hasHeader && (document.number || document.pages > 1)) {
      row = this.renderDocumentBar(sheet, document, row)
    }

    for (const section of document.sections) {
      row = this.renderSection(sheet, section, document, row, signatures)
      row += 1
    }

    sheet.pageSetup.printArea = `A1:${this.columnLetter(GRID_COLUMNS)}${Math.max(1, row)}`
  }

  private renderSection(
    sheet: ExcelJS.Worksheet,
    section: ResolvedSection,
    document: ResolvedDocument,
    startRow: number,
    signatures: Map<string, Buffer>
  ): number {
    switch (section.kind) {
      case 'header':
        return this.renderHeader(sheet, section, document, startRow)
      case 'fields':
        return this.renderFields(sheet, section, startRow)
      case 'checklist':
        return this.renderChecklist(sheet, section, startRow)
      case 'table':
        return this.renderTable(sheet, section, startRow, signatures)
      case 'rows':
        return this.renderRows(sheet, section, startRow, signatures)
      case 'signatures':
        return this.renderSignatures(sheet, section, startRow)
    }
    // Inalcanzable con los tipos actuales; deja el retorno explicito para que
    // anadir un tipo de seccion nuevo falle al compilar y no en silencio.
    return startRow
  }

  // --- secciones -------------------------------------------------------------

  /**
   * Linea con el correlativo del documento y su paginacion.
   *
   * La hoja original lleva `Página: 1 de 1` escrito a mano, que deja de ser
   * cierto en cuanto el personal no cabe. Y no lleva correlativo ninguno. Las
   * dos cosas las sabe el modelo, asi que van aqui.
   */
  private renderDocumentBar(
    sheet: ExcelJS.Worksheet,
    document: ResolvedDocument,
    row: number
  ): number {
    const parts: string[] = []
    if (document.number) parts.push(`N°: ${document.number}`)
    if (document.documentCode) parts.push(`Código: ${document.documentCode}`)
    if (document.documentVersion)
      parts.push(`Versión: ${document.documentVersion}`)
    parts.push(`Página: 1 de ${document.pages}`)

    const cell = sheet.getCell(row, 1)
    cell.value = parts.join('    ')
    cell.font = { size: 8, bold: true }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    sheet.getRow(row).height = mmToPoints(5)
    return row + 1
  }

  private renderHeader(
    sheet: ExcelJS.Worksheet,
    section: Extract<ResolvedSection, { kind: 'header' }>,
    document: ResolvedDocument,
    startRow: number
  ): number {
    let row = startRow

    // Titulo a la izquierda, datos del documento controlado a la derecha. Es la
    // disposicion de las seis plantillas medidas.
    const titleSpan = 16
    this.merge(sheet, row, 1, row + 1, titleSpan)
    const title = sheet.getCell(row, 1)
    title.value = section.title
    title.font = { bold: true, size: 13 }
    title.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    }
    title.border = BORDER
    title.fill = HEADER_FILL

    const meta: string[] = []
    if (section.documentCode) meta.push(`Código: ${section.documentCode}`)
    if (section.documentVersion)
      meta.push(`Versión: ${section.documentVersion}`)
    if (section.documentDate) meta.push(`Fecha: ${section.documentDate}`)
    if (document.number) meta.push(`N°: ${document.number}`)
    if (section.pages !== null) meta.push(`Página: 1 de ${section.pages}`)

    this.merge(sheet, row, titleSpan + 1, row + 1, GRID_COLUMNS)
    const metaCell = sheet.getCell(row, titleSpan + 1)
    metaCell.value = meta.join('\n')
    metaCell.font = { size: 8 }
    metaCell.alignment = {
      vertical: 'middle',
      horizontal: 'left',
      wrapText: true,
    }
    metaCell.border = BORDER

    sheet.getRow(row).height = mmToPoints(7)
    sheet.getRow(row + 1).height = mmToPoints(7)
    row += 2

    if (section.fields.length > 0) {
      row = this.renderFieldGrid(sheet, section.fields, 2, row)
    }
    return row
  }

  private renderFields(
    sheet: ExcelJS.Worksheet,
    section: Extract<ResolvedSection, { kind: 'fields' }>,
    startRow: number
  ): number {
    let row = startRow
    if (section.title) {
      row = this.renderSectionTitle(sheet, section.title, row)
    }
    return this.renderFieldGrid(sheet, section.fields, section.columns, row)
  }

  /**
   * Rejilla de etiqueta y valor.
   *
   * `columns` son pares etiqueta/valor por fila, no celdas: una rejilla de dos
   * columnas ocupa cuatro celdas de ancho.
   */
  private renderFieldGrid(
    sheet: ExcelJS.Worksheet,
    fields: { label: string; value: string }[],
    columns: number,
    startRow: number
  ): number {
    const pairs = Math.max(1, columns)
    const cellsPerPair = Math.floor(GRID_COLUMNS / pairs)
    const labelCells = Math.max(1, Math.round(cellsPerPair * 0.4))
    let row = startRow

    for (let index = 0; index < fields.length; index++) {
      const field = fields[index]
      const column = index % pairs
      const base = column * cellsPerPair + 1

      this.merge(sheet, row, base, row, base + labelCells - 1)
      const label = sheet.getCell(row, base)
      label.value = field.label
      label.font = { bold: true, size: 9 }
      label.alignment = {
        vertical: 'middle',
        horizontal: 'left',
        wrapText: true,
      }
      label.border = BORDER
      label.fill = HEADER_FILL

      const valueEnd =
        column === pairs - 1 ? GRID_COLUMNS : base + cellsPerPair - 1
      this.merge(sheet, row, base + labelCells, row, valueEnd)
      const value = sheet.getCell(row, base + labelCells)
      value.value = field.value
      value.font = { size: 9 }
      value.alignment = {
        vertical: 'middle',
        horizontal: 'left',
        wrapText: true,
      }
      value.border = BORDER

      if (column === pairs - 1 || index === fields.length - 1) {
        sheet.getRow(row).height = mmToPoints(HEADER_ROW_HEIGHT_MM)
        row += 1
      }
    }
    return row
  }

  private renderChecklist(
    sheet: ExcelJS.Worksheet,
    section: Extract<ResolvedSection, { kind: 'checklist' }>,
    startRow: number
  ): number {
    let row = startRow
    if (section.title) {
      row = this.renderSectionTitle(sheet, section.title, row)
    }

    const columns = Math.max(1, section.columns)
    const cellsPerItem = Math.floor(GRID_COLUMNS / columns)

    for (let index = 0; index < section.items.length; index++) {
      const item = section.items[index]
      const column = index % columns
      const base = column * cellsPerItem + 1

      const box = sheet.getCell(row, base)
      // `X` y no un caracter de casilla marcada: las plantillas del cliente
      // marcan con X, y una fuente que no tenga el glifo lo pinta como cuadro.
      box.value = item.checked ? 'X' : ''
      box.font = { bold: true, size: 10 }
      box.alignment = { vertical: 'middle', horizontal: 'center' }
      box.border = BORDER

      const end =
        column === columns - 1 ? GRID_COLUMNS : base + cellsPerItem - 1
      this.merge(sheet, row, base + 1, row, end)
      const label = sheet.getCell(row, base + 1)
      label.value = item.label
      label.font = { size: 9 }
      label.alignment = {
        vertical: 'middle',
        horizontal: 'left',
        wrapText: true,
      }
      label.border = BORDER

      if (column === columns - 1 || index === section.items.length - 1) {
        sheet.getRow(row).height = mmToPoints(HEADER_ROW_HEIGHT_MM)
        row += 1
      }
    }
    return row
  }

  private renderTable(
    sheet: ExcelJS.Worksheet,
    section: Extract<ResolvedSection, { kind: 'table' }>,
    startRow: number,
    signatures: Map<string, Buffer>
  ): number {
    let row = startRow
    if (section.title) {
      row = this.renderSectionTitle(sheet, section.title, row)
    }

    // Los anchos declarados se escalan al ancho util. Sin esto, ocultar una
    // columna desde el maestro dejaria la tabla corta y descuadrada.
    const scaled = fitColumns(
      section.columns.map(column => column.widthMm),
      GRID_COLUMNS
    )
    // De milimetros relativos a celdas de la rejilla, con al menos una celda por
    // columna y ajustando la ultima para que la suma cuadre exactamente.
    const spans = scaled.map(width => Math.max(1, Math.round(width)))
    const drift = GRID_COLUMNS - spans.reduce((sum, span) => sum + span, 0)
    spans[spans.length - 1] = Math.max(1, spans[spans.length - 1] + drift)

    const headerRow = row
    let cursor = 1
    for (let index = 0; index < section.columns.length; index++) {
      const column = section.columns[index]
      const end = cursor + spans[index] - 1
      this.merge(sheet, headerRow, cursor, headerRow, end)
      const cell = sheet.getCell(headerRow, cursor)
      cell.value = column.label
      cell.font = { bold: true, size: 9 }
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      }
      cell.border = BORDER
      cell.fill = HEADER_FILL
      cursor = end + 1
    }
    sheet.getRow(headerRow).height = mmToPoints(HEADER_ROW_HEIGHT_MM)
    row += 1

    section.rows.forEach((dataRow, rowIndex) => {
      cursor = 1
      for (let index = 0; index < section.columns.length; index++) {
        const end = cursor + spans[index] - 1
        this.merge(sheet, row, cursor, row, end)
        const cell = sheet.getCell(row, cursor)
        cell.value = dataRow[index] ?? ''
        cell.font = { size: 9 }
        cell.alignment = {
          vertical: 'middle',
          horizontal: section.columns[index].align,
          wrapText: true,
        }
        cell.border = BORDER

        // La firma se dibuja **encima** de la casilla, que sigue vacia: si en
        // vez de la imagen se escribiera la URL, un formato sin la firma
        // descargada mostraria una direccion de S3 en la columna de firmas.
        const signatureUrl = section.signatures?.[rowIndex]?.[index]
        if (signatureUrl) {
          this.placeSignature(
            sheet,
            signatures,
            signatureUrl,
            row,
            cursor,
            ROW_HEIGHT_MM
          )
        }
        cursor = end + 1
      }
      sheet.getRow(row).height = mmToPoints(ROW_HEIGHT_MM)
      row += 1
    })

    // La cabecera se repite en cada pagina impresa. Es lo que la plantilla
    // conseguia intercalando cabeceras entre las filas de personal.
    sheet.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`
    return row
  }

  /**
   * Una seccion de filas.
   *
   * Cada fila del modelo es una fila de la hoja, y cada celda ocupa las
   * columnas de la rejilla que le tocan por su porcentaje. El reparto se hace
   * con redondeo acumulado para que las celdas de una fila sumen siempre las 24
   * columnas exactas: repartir por separado y redondear cada una deja huecos de
   * una columna que se ven como rayas en el documento.
   */
  private renderRows(
    sheet: ExcelJS.Worksheet,
    section: Extract<ResolvedSection, { kind: 'rows' }>,
    startRow: number,
    signatures: Map<string, Buffer>
  ): number {
    let row = startRow
    if (section.title) {
      row = this.renderSectionTitle(sheet, section.title, row)
    }

    for (const modelRow of section.rows) {
      const spans = this.spread(modelRow.cells.map(cell => cell.width))
      let column = 1

      for (let index = 0; index < modelRow.cells.length; index++) {
        const cell = modelRow.cells[index]
        const span = spans[index]
        if (span <= 0) {
          continue
        }
        const right = column + span - 1
        this.merge(sheet, row, column, row, right)

        const target = sheet.getCell(row, column)
        target.value =
          cell.kind === 'check' ? (cell.checked ? 'X' : '') : cell.text
        target.font = { size: 8, bold: cell.bold }
        target.alignment = {
          vertical: 'middle',
          horizontal: cell.kind === 'check' ? 'center' : cell.align,
          wrapText: true,
        }
        if (cell.fill) {
          target.fill = HEADER_FILL
        }
        if (cell.boxed) {
          target.border = BORDER
        }
        if (cell.kind === 'image') {
          // Varias imagenes en una casilla se reparten a lo ancho de ella.
          ;(cell.images ?? []).forEach((image, position) => {
            this.placeImage(
              sheet,
              image,
              row,
              Math.min(column + position, right)
            )
          })
        }
        if (cell.kind === 'signature' && cell.signatureUrl) {
          this.placeSignature(
            sheet,
            signatures,
            cell.signatureUrl,
            row,
            column,
            modelRow.minHeightMm
          )
        }
        column = right + 1
      }

      if (modelRow.minHeightMm) {
        sheet.getRow(row).height = mmToPoints(modelRow.minHeightMm)
      }
      row += 1
    }
    return row
  }

  /**
   * Reparte porcentajes entre las columnas de la rejilla.
   *
   * Acumulando y redondeando la frontera, no cada trozo por separado: asi los
   * trozos suman exactamente el total y ninguna fila queda una columna corta.
   */
  private spread(weights: number[]): number[] {
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1
    const spans: number[] = []
    let consumed = 0
    let accumulated = 0

    for (let index = 0; index < weights.length; index++) {
      accumulated += weights[index]
      const boundary =
        index === weights.length - 1
          ? GRID_COLUMNS
          : Math.round((accumulated / total) * GRID_COLUMNS)
      spans.push(Math.max(1, boundary - consumed))
      consumed += spans[index]
    }

    // El maximo de columnas manda: con muchas celdas estrechas, el minimo de
    // una columna por celda puede pasarse de la cuenta.
    let excess = consumed - GRID_COLUMNS
    for (let index = spans.length - 1; index >= 0 && excess > 0; index--) {
      const take = Math.min(excess, spans[index] - 1)
      spans[index] -= take
      excess -= take
    }
    return spans
  }

  /** Ancla una imagen en una celda. */
  private placeImage(
    sheet: ExcelJS.Worksheet,
    image: { sha1: string; alt: string; widthMm?: number; heightMm?: number },
    row: number,
    column: number
  ) {
    const file = assetPath(image.sha1)
    if (!file || !fs.existsSync(file)) {
      this.logger.warn(
        `Falta la imagen ${image.sha1} (${image.alt}) en la biblioteca.`
      )
      return
    }
    try {
      const id = sheet.workbook.addImage({
        buffer: fs.readFileSync(file) as any,
        extension:
          file.endsWith('.jpeg') || file.endsWith('.jpg') ? 'jpeg' : 'png',
      })
      // ExcelJS ancla en base cero, y el modelo cuenta desde uno.
      sheet.addImage(id, {
        tl: { col: column - 1, row: row - 1 } as any,
        ext: {
          width: ((image.widthMm ?? 10) * 96) / 25.4,
          height: ((image.heightMm ?? 10) * 96) / 25.4,
        },
      })
    } catch (error) {
      this.logger.warn(`No se pudo insertar la imagen ${image.sha1}: ${error}`)
    }
  }

  /**
   * La firma registrada de una persona, dibujada dentro de su casilla.
   *
   * No se anota en la biblioteca de recursos ni se le calcula un SHA-1: la
   * biblioteca guarda lo que traen las plantillas, que es siempre lo mismo, y
   * una firma cambia con cada nombrada.
   *
   * El alto se ajusta al de la fila menos un margen, y el ancho se deriva de
   * ese alto con la proporcion del lienzo en el que se firma en la app (`sign`
   * dibuja sobre un canvas apaisado). Sin esa proporcion la firma sale
   * estirada, que en un documento que se audita se lee como manipulada.
   */
  private placeSignature(
    sheet: ExcelJS.Worksheet,
    signatures: Map<string, Buffer>,
    url: string,
    row: number,
    column: number,
    rowHeightMm = ROW_HEIGHT_MM
  ) {
    const buffer = signatures.get(url)
    if (!buffer) {
      // Ya se aviso al no poder descargarla. Aqui solo queda dejar el hueco.
      return
    }
    try {
      const id = sheet.workbook.addImage({
        buffer: buffer as any,
        extension: 'png',
      })
      const heightMm = Math.max(3, (rowHeightMm || ROW_HEIGHT_MM) - 1)
      sheet.addImage(id, {
        tl: { col: column - 1, row: row - 1 } as any,
        ext: {
          width: (heightMm * SIGNATURE_ASPECT * 96) / 25.4,
          height: (heightMm * 96) / 25.4,
        },
      })
    } catch (error) {
      this.logger.warn(`No se pudo insertar la firma: ${error}`)
    }
  }

  private renderSignatures(
    sheet: ExcelJS.Worksheet,
    section: Extract<ResolvedSection, { kind: 'signatures' }>,
    startRow: number
  ): number {
    let row = startRow
    if (section.title) {
      row = this.renderSectionTitle(sheet, section.title, row)
    }

    const columns = Math.max(1, section.columns)
    const cellsPerSlot = Math.floor(GRID_COLUMNS / columns)

    for (let index = 0; index < section.slots.length; index += columns) {
      const batch = section.slots.slice(index, index + columns)

      // Tres filas por bloque: hueco para firmar, nombre y cargo.
      batch.forEach((_slot, column) => {
        const base = column * cellsPerSlot + 1
        const end =
          column === columns - 1 ? GRID_COLUMNS : base + cellsPerSlot - 1
        this.merge(sheet, row, base, row, end)
        const space = sheet.getCell(row, base)
        space.border = {
          ...BORDER,
          bottom: { style: 'thin', color: { argb: 'FF1F2933' } },
        }
      })
      sheet.getRow(row).height = mmToPoints(14)
      row += 1

      batch.forEach((slot, column) => {
        const base = column * cellsPerSlot + 1
        const end =
          column === columns - 1 ? GRID_COLUMNS : base + cellsPerSlot - 1
        this.merge(sheet, row, base, row, end)
        const name = sheet.getCell(row, base)
        name.value = slot.name
        name.font = { size: 9, bold: true }
        name.alignment = { vertical: 'middle', horizontal: 'center' }
      })
      sheet.getRow(row).height = mmToPoints(5)
      row += 1

      batch.forEach((slot, column) => {
        const base = column * cellsPerSlot + 1
        const end =
          column === columns - 1 ? GRID_COLUMNS : base + cellsPerSlot - 1
        this.merge(sheet, row, base, row, end)
        const label = sheet.getCell(row, base)
        label.value = slot.label
        label.font = { size: 8 }
        label.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        }
      })
      sheet.getRow(row).height = mmToPoints(5)
      row += 1
    }
    return row
  }

  // --- utilidades ------------------------------------------------------------

  private renderSectionTitle(
    sheet: ExcelJS.Worksheet,
    title: string,
    row: number
  ): number {
    this.merge(sheet, row, 1, row, GRID_COLUMNS)
    const cell = sheet.getCell(row, 1)
    cell.value = title
    cell.font = { bold: true, size: 10 }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.fill = HEADER_FILL
    cell.border = BORDER
    sheet.getRow(row).height = mmToPoints(HEADER_ROW_HEIGHT_MM)
    return row + 1
  }

  /** Combina, tolerando el caso de una sola celda, que ExcelJS rechaza. */
  private merge(
    sheet: ExcelJS.Worksheet,
    top: number,
    left: number,
    bottom: number,
    right: number
  ) {
    if (top === bottom && left === right) {
      return
    }
    sheet.mergeCells(top, left, bottom, Math.max(left, right))
  }

  /** `1` a `A`, `27` a `AA`. */
  private columnLetter(index: number): string {
    let value = index
    let letters = ''
    while (value > 0) {
      const remainder = (value - 1) % 26
      letters = String.fromCharCode(65 + remainder) + letters
      value = Math.floor((value - 1) / 26)
    }
    return letters
  }
}
