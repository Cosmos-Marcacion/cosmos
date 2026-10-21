import { Injectable } from '@nestjs/common'
import {
  AssignedNumber,
  DocumentNumberService,
} from '../../../common/numbering/document-number.service'
import { NumberingSource, numberingOrder } from './numbering'

/** Serie del permiso de trabajo. Es la unica que ya tenia correlativos vivos. */
export const WORK_PERMIT_SERIES_ID = 'pts'

export interface NumberableDocument {
  id: string
  numbering?: NumberingSource
}

export interface NumberingContext {
  staffTransmissionId: number
  /** Codigo de nombrada de Visma, para `numbering: namedCode`. */
  namedCode: string
  /** Fecha de la jornada. Decide el año de las series anuales. */
  when: Date
  /**
   * Correlativo del permiso de trabajo asignado antes de existir esta
   * numeracion. Si viene, la serie `pts` lo adopta en vez de repartir uno.
   */
  legacyWorkPermitNumber?: number
}

/**
 * Resuelve el numero de cada documento de un formato.
 *
 * El orden importa: un documento que hereda necesita que aquel del que cuelga
 * este resuelto antes. `numberingOrder` da ese orden, y el bucle lo respeta en
 * vez de recorrer los documentos como vienen en la definicion.
 *
 * Los numeros se asignan **antes** de renderizar y valen para las tres salidas.
 * En la plantilla actual el numero del pie del permiso salia de una formula de
 * Excel, asi que la vista de impresion no podia conocerlo sin abrir el libro;
 * aqui las tres leen el mismo mapa.
 */
@Injectable()
export class FormatNumberingService {
  constructor(private readonly numbers: DocumentNumberService) { }

  async resolve(
    documents: NumberableDocument[],
    context: NumberingContext
  ): Promise<Map<string, string>> {
    const byId = new Map<string, NumberableDocument>()
    for (const doc of documents) {
      byId.set(doc.id, doc)
    }

    const resolved = new Map<string, string>()

    for (const id of numberingOrder(documents)) {
      const doc = byId.get(id)
      if (!doc) {
        continue
      }
      const numbering: NumberingSource = doc.numbering ?? { kind: 'none' }

      switch (numbering.kind) {
        case 'none':
          break

        case 'namedCode':
          resolved.set(id, context.namedCode ?? '')
          break

        case 'inherit': {
          // Sin valor de origen se deja vacio en vez de fallar: un formato al
          // que le falta un numero es un problema de configuracion que se ve en
          // la hoja, no un motivo para no poder emitir la jornada.
          resolved.set(id, resolved.get(numbering.from) ?? '')
          break
        }

        case 'own': {
          const seedSeq = numbering.series.id === WORK_PERMIT_SERIES_ID
            ? context.legacyWorkPermitNumber
            : undefined
          const assigned: AssignedNumber = await this.numbers.ensure(
            numbering.series,
            context.staffTransmissionId,
            { when: context.when, seedSeq: seedSeq || undefined }
          )
          resolved.set(id, assigned.formatted)
          break
        }
      }
    }

    return resolved
  }
}
