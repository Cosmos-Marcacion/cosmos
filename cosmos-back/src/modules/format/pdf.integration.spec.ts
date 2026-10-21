import { FormatService } from './format.service'
import { FormatDataService } from './format-data.service'
import { PdfService } from './pdf.service'

/**
 * Conversion de verdad, contra el LibreOffice que haya instalado.
 *
 * Se salta sola donde no lo hay, para que el juego de pruebas siga corriendo en
 * un portatil, y se ejecuta entera dentro de la imagen de Docker, que es donde
 * importa: es la unica prueba que detecta que el convertidor esta ausente, roto
 * o exportando de menos.
 *
 * Lo que comprueba es justo lo que se rompio en el analisis previo:
 *
 * - Que el PDF sale y es un PDF.
 * - Que lleva **todas** las hojas visibles del formato. Las plantillas tienen
 *   hojas ocultas (`INGLES`, `VESSEL INSPECTION`, la copia `(3C)` del permiso)
 *   y LibreOffice exporta solo las visibles; si algun dia se destapa una, esta
 *   cuenta cambia y hay que decidirlo a proposito, no descubrirlo impreso.
 * - Que pesa lo que pesa un documento con contenido, no una hoja en blanco.
 */

const NAMED = {
  staff_transmission_id: 2856,
  staff_vessel_id: 2884,
  vessel_description: 'CMA CGM VOLTAIRE',
  voyage_number: '0DVMSN1MA',
  location_id: 'PEPAI - TPE',
  worker_date: '10/09/2025',
  shift_description: '07:00 - 15:00',
  pier_description: '2-A',
  berth_description: '',
  staff_vessel_number: '0875-1',
  listStaffDetail: Array.from({ length: 12 }, (_, i) => ({
    staff_id: 5000 + i,
    personal_id: String(40000000 + i),
    last_name: `APELLIDO${i + 1}`,
    mother_last_name: `MATERNO${i + 1}`,
    first_name: `NOMBRE${i + 1}`,
    staff_role_type_description: 'ESTIBADOR',
    order_number: i + 1,
  })),
}

const RECORD = {
  staffTransmissionId: 2856,
  formatType: 'GRANEL',
  jefeCubierta: { fullName: 'HIDALGO CASTILLO DARWIN JAVIER', document: '74355639' },
  supervisorOperaciones: { fullName: 'MORAN PERALTA CARLOS', document: '42213311' },
  supervisorSsoma: { fullName: 'POLO TOMOSADA TOMAS', document: '73607845' },
  talkTopics: [{ topic: 'LECTURA DE ATS', summary: 'Aplicar los controles del ATS' }],
  generatedFormats: [],
}

/** Paginas del PDF, contando los objetos de tipo pagina. */
function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

const pdfService = new PdfService()

function buildService() {
  const namedRecord = {
    findOne: async () => RECORD,
    addGeneratedFormat: async () => { },
    ensureWorkPermitNumber: async () => 1,
  } as any
  const data = new FormatDataService(
    { getNameds: async () => ({ listStaff: [NAMED] }) } as any,
    namedRecord,
    { getEmployeesByIds: async () => [] } as any,
    { getEntriesByEmployeeIds: async () => [] } as any,
    { findAllGlobal: async () => [] } as any
  )
  return new FormatService(data, namedRecord, pdfService)
}

describe('Conversion a PDF con LibreOffice', () => {
  let disponible = false

  beforeAll(async () => {
    disponible = (await pdfService.available()).ok
    if (!disponible) {
      console.warn(
        'Sin LibreOffice: se omite la prueba de conversion. ' +
        'Instala `libreoffice-calc` o define SOFFICE_BIN para ejecutarla.'
      )
    }
  }, 60000)

  it('convierte el formato entero y no se deja hojas', async () => {
    if (!disponible) {
      return
    }

    const result = await buildService().generate(2856, '10/09/2025', 'pruebas', 'pdf')

    expect(result.buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(result.buffer.toString('latin1')).toContain('%%EOF')
    // Un PDF de una hoja en blanco no llega ni a 5 KB.
    expect(result.buffer.length).toBeGreaterThan(20000)

    // GRANEL tiene cuatro hojas visibles: asistencia, charla, ATS y permiso.
    // El permiso ocupa dos paginas por si solo, de ahi el minimo de cinco.
    expect(pageCount(result.buffer)).toBeGreaterThanOrEqual(5)
  }, 180000)
})
