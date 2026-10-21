/**
 * Documentos resueltos de ejemplo para las pruebas e2e del panel.
 *
 * La vista de impresion (`cosmos-front`, `/formatos/imprimir/:id`) pinta el
 * modelo que devuelve `GET /format/:id/document`. Las e2e no levantan backend,
 * asi que aqui se construye ese mismo modelo con las definiciones de fabrica y
 * una nombrada de 30 personas, para que la prueba imprima los tres formatos
 * reales y no una maqueta.
 *
 * Uso: `npm run format:e2e-fixtures`. Se regenera cuando cambian las
 * definiciones (`npm run format:generate`).
 */
import * as fs from 'fs'
import * as path from 'path'
import { DocumentBuilder } from '../../src/modules/format/v2/document.builder'
import { FormatDefinition } from '../../src/modules/format/v2/document-model'
import { SEED_DEFINITIONS } from '../../src/modules/format/v2/definitions/seed'
import { FORMAT_TEMPLATES } from '../../src/modules/format/format-templates.config'

const OUT_DIR = path.join(process.cwd(), '..', 'cosmos-front', 'e2e', 'fixtures')

const people = Array.from({ length: 30 }, (_, i) => ({
  cargo: i % 3 === 0 ? 'TARJADOR' : 'ESTIBADOR',
  nombres: `APELLIDO${String(i + 1).padStart(2, '0')} MATERNO NOMBRE`,
  documento: String(40000000 + i),
  horaIngreso: '07:05',
  horaSalida: '15:02',
}))

const DATA = {
  staffTransmissionId: 123,
  workerDate: '12/05/2026',
  workerDateIso: '2026-05-12',
  workerDateValue: new Date(2026, 4, 12),
  workPermitNumber: 137,
  vesselDescription: 'CMA CGM VOLTAIRE',
  pierDescription: '2-A',
  shiftDescription: '07:00 - 15:00',
  namedNumber: '0875',
  supervisorOperaciones: { fullName: 'ANA PEREZ', document: '40000001' },
  jefeCubierta: { fullName: 'LUIS GOMEZ', document: '40000002' },
  supervisorSsoma: { fullName: 'MARIA DIAZ', document: '40000003' },
  jefeCubiertaVsi: 'JOHN SMITH',
  ssomaVsi: 'JANE DOE',
  talkTopics: [{ topic: 'USO DE BLOQUEADOR SOLAR', summary: 'Aplicar los controles del ATS' }],
  talk: {},
  people,
} as any

const builder = new DocumentBuilder()
fs.mkdirSync(OUT_DIR, { recursive: true })
for (const template of FORMAT_TEMPLATES) {
  const definition = SEED_DEFINITIONS[template.id] as FormatDefinition
  const numbers = new Map(definition.documents.map(document => [document.id, 'X-2026-0042']))
  const format = builder.build(definition, { ...DATA, formatType: template.id }, numbers)
  const file = path.join(OUT_DIR, `format-${template.id}.json`)
  fs.writeFileSync(file, JSON.stringify(format))
  console.log(file)
}
