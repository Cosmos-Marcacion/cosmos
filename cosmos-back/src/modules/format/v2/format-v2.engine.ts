import { Injectable, Logger } from '@nestjs/common'
import { NamedRecordService } from '../../named/named-record.service'
import { UploadService } from '../../upload/upload.service'
import { FormatData, FormatDataService } from '../format-data.service'
import { FormatEngine, FormatTypeSummary } from '../format-engine'
import { FormatOutput, GenerateFormatResult } from '../format.service'
import { PdfService } from '../pdf.service'
import {
  FORMAT_TEMPLATES,
  attendanceCapacity,
  onePageCapacity,
} from '../format-templates.config'
import { FormatDefinitionService } from '../definitions/format-definition.service'
import { DocumentBuilder } from './document.builder'
import { FormatNumberingService } from './format-numbering.service'
import { XlsxRenderer } from './xlsx.renderer'
import { ResolvedFormat } from './document-model'

const CONTENT_TYPES: Record<FormatOutput, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
}

/** El documento resuelto y los datos con los que se compuso. */
export interface BuiltFormat {
  format: ResolvedFormat
  data: FormatData
}

/**
 * El motor que **genera** el documento, frente al motor legacy que rellena la
 * plantilla del cliente.
 *
 * Las tres salidas (Excel, PDF e impresion del navegador) parten del mismo
 * `ResolvedFormat`. Ninguna puede omitir un dato que otra lleve, porque las
 * tres leen la misma lista de secciones, y ninguna decide por su cuenta donde
 * cortan las paginas ni que numero lleva cada documento: eso viene resuelto.
 *
 * El PDF sale de convertir el Excel recien generado, no de volver a componerlo.
 * Es lo mismo que hace el motor legacy y es lo que garantiza que lo que se
 * imprime sea lo que se descarga.
 */
@Injectable()
export class FormatV2Engine implements FormatEngine {
  readonly engineId = 'v2' as const
  private readonly logger = new Logger(FormatV2Engine.name)

  constructor(
    private readonly data: FormatDataService,
    private readonly definitions: FormatDefinitionService,
    private readonly builder: DocumentBuilder,
    private readonly numbering: FormatNumberingService,
    private readonly xlsx: XlsxRenderer,
    private readonly pdf: PdfService,
    private readonly namedRecordService: NamedRecordService,
    private readonly upload: UploadService
  ) { }

  /**
   * Los tipos salen del catalogo del motor legacy a proposito: son los mismos
   * tipos de nombrada y su capacidad se sigue midiendo por la hoja de
   * asistencia. Con dos listas, las dos podrian divergir.
   */
  listFormatTypes(): FormatTypeSummary[] {
    return FORMAT_TEMPLATES.map(template => ({
      id: template.id,
      label: template.label,
      capacity: attendanceCapacity(template),
      onePageCapacity: onePageCapacity(template),
      attendanceSheet: template.attendanceSheet,
    }))
  }

  /**
   * Compone el documento resuelto de una nombrada.
   *
   * Es lo que consume la vista de impresion, y es lo mismo que se renderiza a
   * Excel. Asigna los correlativos igual que la descarga: un numero que
   * cambiara entre lo que se ve en pantalla y lo que se descarga no serviria
   * de nada. La asignacion es idempotente, asi que mirar el documento no
   * consume correlativos nuevos.
   */
  async buildDocument(
    staffTransmissionId: number,
    workerDate: string,
    formatTypeOverride?: string
  ): Promise<BuiltFormat> {
    const data = await this.data.collect(staffTransmissionId, workerDate)
    const formatType = formatTypeOverride || data.formatType
    const definition = await this.definitions.getPublished(formatType)

    const numbers = await this.numbering.resolve(definition.documents, {
      staffTransmissionId,
      namedCode: data.namedNumber,
      when: data.workerDateValue,
      // El permiso ya asignado manda: reemitir no puede cambiar el numero que
      // alguien firmo.
      legacyWorkPermitNumber: data.workPermitNumber,
    })

    return { format: this.builder.build(definition, data, numbers), data }
  }

  /**
   * Baja los bytes de cada firma que el documento va a imprimir.
   *
   * Las firmas viven en S3 como URL, y el renderizador de Excel necesita los
   * bytes. Se bajan aqui, una sola vez por URL distinta aunque la misma persona
   * firme en cinco casillas, y en paralelo.
   *
   * Con `allSettled` y no `all`: una firma que no se pueda descargar deja su
   * casilla en blanco, que es el hueco de toda la vida para firmar a mano. Que
   * un fallo de red impidiera emitir el formato de una jornada seria un remedio
   * peor que la enfermedad.
   */
  private async fetchSignatures(format: ResolvedFormat): Promise<Map<string, Buffer>> {
    const urls = new Set<string>()
    for (const document of format.documents) {
      for (const section of document.sections) {
        if (section.kind === 'rows') {
          for (const row of section.rows) {
            for (const cell of row.cells) {
              if (cell.signatureUrl) urls.add(cell.signatureUrl)
            }
          }
        }
        if (section.kind === 'table') {
          for (const row of section.signatures ?? []) {
            for (const url of row) {
              if (url) urls.add(url)
            }
          }
        }
      }
    }
    if (urls.size === 0) {
      return new Map()
    }

    const wanted = [...urls]
    const results = await Promise.allSettled(
      wanted.map(url => this.upload.getFileBuffer(url))
    )

    const bytes = new Map<string, Buffer>()
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value?.length) {
        bytes.set(wanted[index], result.value)
      } else {
        this.logger.warn(`No se pudo descargar la firma ${wanted[index]}; su casilla queda en blanco.`)
      }
    })
    return bytes
  }

  async generate(
    staffTransmissionId: number,
    workerDate: string,
    generatedBy?: string,
    output: FormatOutput = 'xlsx'
  ): Promise<GenerateFormatResult> {
    const { format, data } = await this.buildDocument(staffTransmissionId, workerDate)

    const xlsxBuffer = await this.xlsx.render(format, await this.fetchSignatures(format))
    const buffer = output === 'pdf' ? await this.pdf.fromXlsx(xlsxBuffer) : xlsxBuffer

    const pages = Math.max(1, ...format.documents.map(document => document.pages))
    const safeDate = workerDate.replace(/\//g, '-')
    const fileName = `formato_${format.formatType}_${staffTransmissionId}_${safeDate}.${output}`
    const workPermitNumber = data.workPermitNumber ?? 0

    await this.namedRecordService.addGeneratedFormat(
      staffTransmissionId,
      workerDate.split('/').reverse().join('-'),
      {
        formatType: format.formatType,
        fileName,
        generatedAt: new Date(),
        generatedBy,
        staffCount: data.people.length,
        truncated: false,
        pages,
        workPermitNumber,
        output,
        // Con que motor y que version de la definicion salio, y que correlativo
        // llevo cada documento. Sin esto, un formato de hace tres meses deja de
        // ser reproducible.
        engine: this.engineId,
        definitionVersion: format.version,
        documentNumbers: format.documents
          .filter(document => document.number)
          .map(document => `${document.id}:${document.number}`),
      } as any
    )

    return {
      fileName,
      buffer,
      formatType: format.formatType,
      staffCount: data.people.length,
      truncated: false,
      omitted: [],
      pages,
      workPermitNumber,
      output,
      contentType: CONTENT_TYPES[output],
    }
  }
}
