import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { NamedRecordService } from '../named/named-record.service'
import { FormatData, FormatDataService, FormatPerson } from './format-data.service'
import { FormatEngine } from './format-engine'
import { WorkbookDoc, CellValue } from './xlsx-patcher'
import { PdfService } from './pdf.service'
import { fillAfter, fillBlank, markOption } from './preprinted-text'
import {
  FORMAT_TEMPLATES,
  PersonLane,
  GLOBAL_CELLS,
  CHARLA_CELLS,
  CHARLA_PLACE_CELLS,
  CHARLA_TYPE_LABELS,
  PersonBlock,
  blockCapacity,
  getFormatTemplate,
  packNameAndDocument,
  attendanceCapacity,
  onePageCapacity,
  toJornadaNumber,
  toShiftLabel,
  toWorkPermitLabel,
} from './format-templates.config'

/**
 * Como se entrega el formato. El contenido es el mismo en los dos casos: el PDF
 * se obtiene convirtiendo el `.xlsx` recien generado, no volviendo a componerlo.
 * Por eso no pueden diferir.
 */
export type FormatOutput = 'xlsx' | 'pdf'

const CONTENT_TYPES: Record<FormatOutput, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
}

export interface GenerateFormatResult {
  fileName: string
  buffer: Buffer
  formatType: string
  staffCount: number
  /** Se conserva por compatibilidad; hoy nunca se trunca. */
  truncated: boolean
  omitted: string[]
  /** Paginas que ocupa la lista de personal en la hoja mas larga. */
  pages: number
  /** Correlativo del permiso de trabajo impreso en las hojas PTS. */
  workPermitNumber: number
  output: FormatOutput
  contentType: string
}

/**
 * Generacion del formato unico de una nombrada.
 *
 * Se parte de la plantilla del tipo que corresponda y se rellenan dos cosas: la
 * hoja `GLOBAL`, de la que cuelgan por formula las cabeceras de todas las
 * demas, y la lista de personal, que se escribe **hoja por hoja**.
 *
 * Lo segundo no se delega en la plantilla a proposito. Sus formulas solo
 * arrastraban dos o tres nombres a la charla, al ATS, al permiso de trabajo y a
 * la hoja de ingles, y en un caso apuntaban a un libro externo que ya no
 * existe. Escribiendo la lista completa en cada bloque, el formato sale entero
 * sea cual sea el tamano de la nombrada: si no cabe, se anaden paginas.
 */
@Injectable()
export class FormatService implements FormatEngine {
  readonly engineId = 'legacy' as const

  private readonly logger = new Logger(FormatService.name)
  private readonly templatesDir = path.join(process.cwd(), 'templates')
  private readonly templateCache = new Map<string, Buffer>()

  constructor(
    private readonly formatDataService: FormatDataService,
    private readonly namedRecordService: NamedRecordService,
    private readonly pdfService: PdfService
  ) { }

  listFormatTypes() {
    return FORMAT_TEMPLATES.map(t => ({
      id: t.id,
      label: t.label,
      /** Personal que lista la hoja de asistencia en una pagina. */
      capacity: attendanceCapacity(t),
      /**
       * A partir de aqui el formato se reparte en varias paginas. No es un
       * tope: no se pierde a nadie por encima de esta cifra.
       */
      onePageCapacity: onePageCapacity(t),
      attendanceSheet: t.attendanceSheet,
    }))
  }

  private loadTemplate(file: string): Buffer {
    const cached = this.templateCache.get(file)
    if (cached) {
      return cached
    }
    const full = path.join(this.templatesDir, file)
    if (!fs.existsSync(full)) {
      throw new HttpException(
        `No se encontro la plantilla "${file}" en ${this.templatesDir}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
    const buffer = fs.readFileSync(full)
    this.templateCache.set(file, buffer)
    return buffer
  }

  /** Turno `"07:00 - 15:00"` a su hora de termino, `"15:00 HRS."`. */
  private toEndShiftLabel(shiftDescription: string): string {
    const end = (shiftDescription ?? '').split('-')[1]?.trim() ?? ''
    return end ? `${end} HRS.` : ''
  }

  /**
   * Genera el formato de una nombrada.
   *
   * `output` decide como se entrega, no que se entrega. El PDF se saca del
   * mismo libro que la descarga en Excel, ya relleno, asi que no hay forma de
   * que uno lleve datos que el otro no.
   */
  async generate(
    staffTransmissionId: number,
    workerDate: string,
    generatedBy?: string,
    output: FormatOutput = 'xlsx'
  ): Promise<GenerateFormatResult> {
    // La recoleccion es comun a los dos motores: si algun dia se corrige de
    // donde sale una hora o quien encabeza la lista, se corrige una sola vez.
    const data = await this.formatDataService.collect(staffTransmissionId, workerDate)

    const { workerDateIso, workPermitNumber, namedNumber, people: rows } = data
    const template = getFormatTemplate(data.formatType)

    // --- hoja GLOBAL ----------------------------------------------------------
    const topics = data.talkTopics
    const globalCells: Record<string, CellValue> = {
      [GLOBAL_CELLS.nave]: data.vesselDescription ?? '',
      [GLOBAL_CELLS.fecha]: data.workerDateValue,
      [GLOBAL_CELLS.muelle]: data.pierDescription ?? '',
      [GLOBAL_CELLS.jornada]: toJornadaNumber(data.shiftDescription),
      [GLOBAL_CELLS.inicioJornada]: toShiftLabel(data.shiftDescription),
      [GLOBAL_CELLS.terminoJornada]: this.toEndShiftLabel(data.shiftDescription),
      [GLOBAL_CELLS.supervisorOperaciones]: packNameAndDocument(
        data.supervisorOperaciones.fullName,
        data.supervisorOperaciones.document
      ),
      [GLOBAL_CELLS.jefeCubierta]: packNameAndDocument(
        data.jefeCubierta.fullName,
        data.jefeCubierta.document
      ),
      [GLOBAL_CELLS.temaCharla1]: topics[0]?.topic ?? '',
      [GLOBAL_CELLS.temaCharla2]: topics[1]?.topic ?? '',
      [GLOBAL_CELLS.temaCharla3]: topics[2]?.topic ?? '',
      [GLOBAL_CELLS.resumenCharla1]: topics[0]?.summary ?? '',
      [GLOBAL_CELLS.resumenCharla2]: topics[1]?.summary ?? '',
      [GLOBAL_CELLS.resumenCharla3]: topics[2]?.summary ?? '',
      [GLOBAL_CELLS.supervisorSsoma]: data.supervisorSsoma,
      // El "N° ATS" de las hojas ATS y PTS apunta a esta misma celda. El numero
      // sale de `staff_vessel_id`, no de `staff_vessel_number`, que llega vacio
      // en una de cada diez nombradas y dejaba el formato sin N.o de ATS.
      [GLOBAL_CELLS.codigoNombrada]: namedNumber,
      [GLOBAL_CELLS.jefeCubiertaVsi]: data.jefeCubiertaVsi,
      [GLOBAL_CELLS.ssomaVsi]: data.ssomaVsi,
    }

    // --- escritura sobre la plantilla -----------------------------------------
    const doc = new WorkbookDoc(this.loadTemplate(template.file))
    for (const [ref, value] of Object.entries(globalCells)) {
      doc.set('GLOBAL', ref, value)
    }

    const pagesByBlock: Record<string, number> = {}
    for (const block of template.blocks) {
      if (!doc.has(block.sheet)) {
        this.logger.warn(`La plantilla ${template.id} no tiene la hoja "${block.sheet}"; se omite ese bloque.`)
        continue
      }
      // Antes de paginar: las paginas anadidas se clonan de esta y heredan el
      // numero ya escrito.
      if (block.permitNumberCell) {
        doc.set(block.sheet, block.permitNumberCell, toWorkPermitLabel(workPermitNumber))
      }
      // Igual que el permiso: la cabecera de la charla se escribe antes de
      // paginar para que las paginas anadidas salgan con los mismos datos.
      if (block.id === 'charla') {
        this.fillTalkHeader(doc, block.sheet, data)
      }
      pagesByBlock[block.id] = this.fillBlock(doc, block, rows)
    }

    const pages = Math.max(1, ...Object.values(pagesByBlock))
    const workbook = doc.save()

    const safeVessel = (data.vesselDescription ?? 'NAVE')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
    const baseName = `${template.id}_${safeVessel}_${workerDateIso}_${namedNumber}`
    const fileName = `${baseName}.${output}`

    // El PDF es una conversion del libro que se acaba de rellenar, no una
    // segunda maquetacion. Si falla la conversion no se anota nada: no se ha
    // entregado ningun formato.
    const buffer = output === 'pdf'
      ? await this.pdfService.fromXlsx(workbook, baseName)
      : workbook

    await this.namedRecordService.addGeneratedFormat(staffTransmissionId, workerDateIso, {
      formatType: template.id,
      fileName,
      generatedAt: new Date(),
      generatedBy: generatedBy ?? '',
      staffCount: rows.length,
      truncated: false,
      pages,
      workPermitNumber,
      output,
    })

    return {
      fileName,
      buffer,
      formatType: template.id,
      staffCount: rows.length,
      truncated: false,
      omitted: [],
      pages,
      workPermitNumber,
      output,
      contentType: CONTENT_TYPES[output],
    }
  }

  /**
   * Rellena la cabecera de la hoja de charla: tipo de capacitacion, programa
   * anual, lugar, horario y quien la dio.
   *
   * Nada de esto son campos de la plantilla. Son textos preimpresos con las
   * opciones dentro y un "Marcar (X)" al lado, porque el formato del cliente
   * esta pensado para rellenarse a mano. Se escribe encima sin alterarles la
   * longitud, de modo que la hoja sale identica a la que el cliente aprobo,
   * solo que ya marcada. Ver `preprinted-text.ts`.
   *
   * Lo que no se haya registrado se queda sin marcar, igual que en una hoja
   * impresa en blanco.
   */
  private fillTalkHeader(doc: WorkbookDoc, sheet: string, data: FormatData): void {
    const talk = data.talk

    const typeLabel = CHARLA_TYPE_LABELS[talk.type]
    if (typeLabel) {
      doc.set(sheet, CHARLA_CELLS.tipo, markOption(doc.text(sheet, CHARLA_CELLS.tipo), typeLabel))
    }

    // El "SI / NO" solo se marca cuando hay tipo: sin capacitacion registrada
    // no procede decir si pertenece al programa anual.
    if (typeLabel) {
      const anual = doc.text(sheet, CHARLA_CELLS.programaAnual)
      doc.set(sheet, CHARLA_CELLS.programaAnual, markOption(anual, talk.isAnnual ? 'SI' : 'NO'))
    }

    const place = CHARLA_PLACE_CELLS[talk.place]
    if (place) {
      doc.set(sheet, place.cell, markOption(doc.text(sheet, place.cell), place.label))
    }

    if (talk.startTime) {
      doc.set(sheet, CHARLA_CELLS.horaInicio, talk.startTime)
    }
    if (talk.endTime) {
      doc.set(sheet, CHARLA_CELLS.horaTermino, talk.endTime)
    }
    if (talk.hours > 0) {
      const horas = doc.text(sheet, CHARLA_CELLS.horas)
      doc.set(sheet, CHARLA_CELLS.horas, fillBlank(horas, String(talk.hours)))
    }

    // La celda trae `=GLOBAL!B9` (el supervisor de operaciones). Solo se pisa
    // cuando hay entrenador designado, para no perder ese comportamiento.
    if (talk.trainer.fullName) {
      doc.set(
        sheet,
        CHARLA_CELLS.capacitador,
        packNameAndDocument(talk.trainer.fullName, talk.trainer.document)
      )
    }

    if (talk.registerResponsible.fullName) {
      const nombre = doc.text(sheet, CHARLA_CELLS.responsableNombre)
      doc.set(
        sheet,
        CHARLA_CELLS.responsableNombre,
        fillAfter(fillAfter(nombre, 'Nombre:', talk.registerResponsible.fullName), 'Fecha:', data.workerDate)
      )
      if (talk.registerResponsible.position) {
        const cargo = doc.text(sheet, CHARLA_CELLS.responsableCargo)
        doc.set(
          sheet,
          CHARLA_CELLS.responsableCargo,
          fillAfter(cargo, 'Cargo:', talk.registerResponsible.position)
        )
      }
    }
  }

  /**
   * Escribe la lista de personal en un bloque, anadiendo paginas si no cabe.
   *
   * Devuelve el numero de paginas que ocupa el bloque. Los huecos sobrantes se
   * vacian: la plantilla trae datos de ejemplo que, de no limpiarse, saldrian
   * impresos como si fueran personal de la jornada.
   */
  private fillBlock(doc: WorkbookDoc, block: PersonBlock, people: FormatPerson[]): number {
    const capacity = blockCapacity(block)
    const pages = Math.max(1, Math.ceil(people.length / capacity))

    // Cada pagina anadida repite la geometria de la original desplazada.
    const offsets = pages > 1
      ? [0, ...doc.addPages(block.sheet, block.page.from, block.page.to, pages - 1)]
      : [0]

    let lastWrittenRow = 0
    let index = 0

    for (const offset of offsets) {
      // El ATS y el permiso numeran hacia abajo por columna, no de izquierda a
      // derecha, porque asi estan preimpresos sus correlativos.
      const slots: { row: number; lane: number }[] = []
      if (block.fill === 'lane') {
        for (let lane = 0; lane < block.lanes.length; lane++) {
          for (const row of block.rows) {
            slots.push({ row: row + offset, lane })
          }
        }
      } else {
        for (const row of block.rows) {
          for (let lane = 0; lane < block.lanes.length; lane++) {
            slots.push({ row: row + offset, lane })
          }
        }
      }

      for (const slot of slots) {
        const lane = block.lanes[slot.lane]
        const person = people[index]
        index++

        if (!person) {
          this.clearSlot(doc, block.sheet, lane, slot.row)
          continue
        }

        if (lane.numero) doc.set(block.sheet, `${lane.numero}${slot.row}`, index)
        if (lane.cargo) doc.set(block.sheet, `${lane.cargo}${slot.row}`, person.cargo)
        doc.set(block.sheet, `${lane.nombre}${slot.row}`, person.nombres)
        doc.set(block.sheet, `${lane.documento}${slot.row}`, person.documento)
        if (lane.horaIngreso) doc.set(block.sheet, `${lane.horaIngreso}${slot.row}`, person.horaIngreso)
        if (lane.horaSalida) doc.set(block.sheet, `${lane.horaSalida}${slot.row}`, person.horaSalida)
        lastWrittenRow = Math.max(lastWrittenRow, slot.row)
      }
    }

    // El area de impresion de la plantilla se queda corta incluso sin anadir
    // paginas: en granel llegaba a la fila 32 con la lista hasta la 83, asi que
    // la persona 23 se guardaba en el archivo pero no salia impresa.
    const printLastRow = pages > 1
      ? block.page.to + offsets[offsets.length - 1]
      : Math.max(lastWrittenRow, block.page.to)
    doc.extendPrintArea(block.sheet, printLastRow)

    // Con paginas anadidas el area de impresion dobla o triplica su alto. Las
    // hojas que se ajustaban a una pagina tienen que soltar ese ajuste o
    // comprimen todo el personal en una sola.
    if (pages > 1) {
      doc.releaseVerticalFit(block.sheet)
    }

    return pages
  }

  /** Vacia un hueco sin tocar bordes ni relleno. */
  private clearSlot(doc: WorkbookDoc, sheet: string, lane: PersonLane, row: number): void {
    for (const column of [lane.numero, lane.cargo, lane.nombre, lane.documento,
      lane.horaIngreso, lane.inicioRefrigerio, lane.terminoRefrigerio, lane.horaSalida]) {
      if (column) {
        doc.set(sheet, `${column}${row}`, '')
      }
    }
  }
}
