import { createHash } from 'crypto'
import { unzipSync } from 'fflate'
import { FormatService } from './format.service'
import { FormatDataService } from './format-data.service'

/**
 * Red de seguridad del motor actual, a nivel de contenido.
 *
 * El motor v2 se construye al lado del que ya funciona, y la variable
 * `FORMAT_ENGINE` decide cual emite. La promesa que sostiene ese diseno es que
 * con `FORMAT_ENGINE=legacy` no cambia **nada**, y una promesa asi no se
 * comprueba mirando media docena de celdas: se comprueba con la huella del
 * libro entero.
 *
 * La huella no puede ser la del fichero. `zipSync` de fflate sella cada entrada
 * con `Date.now()` (`f.mtime == null ? Date.now()`), asi que dos generaciones
 * identicas separadas por mas de dos segundos, que es la resolucion de la fecha
 * en un zip, producen ficheros distintos byte a byte. Se ve como un fallo
 * intermitente: mismo tamano, mismo contenido, distinto hash.
 *
 * Por eso se firma el **contenido**: cada parte del zip descomprimida, en orden
 * alfabetico. Eso ignora la fecha del contenedor y captura todo lo que de
 * verdad llega al cliente, incluido lo que a nadie se le ocurrio comprobar.
 *
 * Si una de estas huellas cambia, el motor actual ha dejado de emitir lo mismo.
 * No se actualiza la constante sin saber exactamente que cambio y por que.
 */

const WORKER_DATE = '10/09/2025'
const NAMED_ID = 2856

/** Personal fijo. Con 25 personas el permiso de trabajo (16 huecos) pagina. */
const STAFF_COUNT = 25

const NAMED = {
  staff_transmission_id: NAMED_ID,
  staff_vessel_id: 2884,
  vessel_description: 'CMA CGM VOLTAIRE',
  worker_date: WORKER_DATE,
  shift_description: '07:00 - 15:00',
  pier_description: '2-A',
  listStaffDetail: Array.from({ length: STAFF_COUNT }, (_, i) => ({
    staff_id: 5000 + i,
    personal_id: String(40000000 + i),
    last_name: `APELLIDO${i + 1}`,
    mother_last_name: `MATERNO${i + 1}`,
    first_name: `NOMBRE${i + 1}`,
    staff_role_type_description: 'ESTIBADOR',
    order_number: i + 1,
  })),
}

const EMPLOYEES = NAMED.listStaffDetail.map((d, i) => ({
  _id: { toString: () => `emp-${i}` },
  id: d.staff_id,
}))

const POINTS = [
  { _id: { toString: () => 'p1' }, order: 1 },
  { _id: { toString: () => 'p8' }, order: 8 },
]

/** Marcaciones de las tres primeras personas; el resto sin hora, a proposito. */
const ENTRIES = [
  { employeeId: { toString: () => 'emp-0' }, pointId: { toString: () => 'p1' }, namedId: NAMED_ID, isAbsence: false, date: new Date(2025, 8, 10, 7, 12) },
  { employeeId: { toString: () => 'emp-0' }, pointId: { toString: () => 'p8' }, namedId: NAMED_ID, isAbsence: false, date: new Date(2025, 8, 10, 15, 3) },
  { employeeId: { toString: () => 'emp-1' }, pointId: { toString: () => 'p1' }, namedId: NAMED_ID, isAbsence: false, date: new Date(2025, 8, 10, 7, 25) },
  { employeeId: { toString: () => 'emp-2' }, pointId: { toString: () => 'p1' }, namedId: NAMED_ID, isAbsence: true, date: new Date(2025, 8, 10, 7, 0) },
]

const recordFor = (formatType: string) => ({
  staffTransmissionId: NAMED_ID,
  formatType,
  jefeCubierta: { fullName: 'HIDALGO CASTILLO DARWIN JAVIER', document: '74355639' },
  supervisorOperaciones: { fullName: 'MORAN PERALTA CARLOS', document: '42213311' },
  supervisorSsoma: { fullName: 'POLO TOMOSADA TOMAS', document: '' },
  talkTopics: [
    { topic: 'LECTURA DE ATS DE NAVES GRANELERAS', summary: 'Aplicar los controles del ATS' },
    { topic: 'USO DE BLOQUEADORES SOLARES', summary: 'Prevencion de radiacion' },
  ],
  generatedFormats: [],
})

function serviceFor(formatType: string): FormatService {
  const namedRecord = {
    findOne: async () => recordFor(formatType),
    addGeneratedFormat: async () => undefined,
    ensureWorkPermitNumber: async () => 1234,
  } as any
  const data = new FormatDataService(
    { getNameds: async () => ({ listStaff: [NAMED] }) } as any,
    namedRecord,
    {
      getEmployeesByIds: async () => EMPLOYEES,
      // Nadie tiene firma registrada: esta prueba mide la huella del libro que
      // emite el motor legacy, que no dibuja firmas.
      findSignaturesByDocuments: async () => new Map(),
    } as any,
    { getEntriesByEmployeeIds: async () => ENTRIES } as any,
    { findAllGlobal: async () => POINTS } as any
  )
  return new FormatService(
    data,
    namedRecord,
    { fromXlsx: async () => Buffer.from('%PDF-1.7 fingido') } as any
  )
}

/** Numero de partes del zip, por plantilla. Una parte de menos es una perdida. */
const EXPECTED_PARTS: Record<string, number> = {
  ETHANOL: 96,
  GRANEL: 104,
  MERCADERIA_GENERAL: 109,
  CONTAINERO: 102,
  BIG_BAG: 109,
}

/** Huella del contenido del libro: cada parte del zip, en orden alfabetico. */
function contentDigest(xlsx: Buffer): { digest: string; parts: number } {
  const files = unzipSync(new Uint8Array(xlsx))
  const names = Object.keys(files).sort()
  const hash = createHash('sha256')
  for (const name of names) {
    hash.update(name)
    hash.update(Uint8Array.of(0))
    hash.update(files[name])
  }
  return { digest: hash.digest('hex'), parts: names.length }
}

async function fingerprint(formatType: string): Promise<{ digest: string; parts: number }> {
  const result = await serviceFor(formatType).generate(NAMED_ID, WORKER_DATE)
  return contentDigest(result.buffer)
}

/**
 * Huellas del contenido emitido por el motor actual, con la entrada de arriba.
 *
 * Las primeras se obtuvieron ejecutando esta misma prueba contra el motor tal
 * como estaba antes de empezar el trabajo de formatos v2 (commit 0aa95c8).
 *
 * Actualizadas una vez desde entonces, al dejar de emitir `xl/calcChain.xml`.
 * Ese indice viajaba intacto desde la plantilla mientras las hojas se
 * reescribian, asi que apuntaba a celdas que ya no tenian formula y Excel
 * reparaba el fichero al abrirlo. El cambio quita esa parte del zip y las dos
 * referencias que la nombran, de ahi que cada plantilla emita **una parte
 * menos**. Ningun otro contenido se toca: lo unico que se pierde es una cache
 * de orden de recalculo que Excel rehace sola, porque el libro va marcado con
 * `fullCalcOnLoad`. Ver `dropCalcChain` en `xlsx-patcher.ts` y la prueba
 * `format.package-integrity.spec.ts`.
 *
 * Y otra el 24/09/2026 en granel, mercaderia, containero y big bag: la lista
 * de asistencia incluia una fila oculta y la cabecera impresa de la segunda
 * pagina (granel 35 y 41, las otras 47 y 53). Con esta nombrada de 25 personas
 * granel escribia a la persona 25 encima de "Fecha / Version / Codigo". Ver
 * `wideAttendanceBlock` en `format-templates.config.ts`.
 */
const EXPECTED: Record<string, string> = {
  ETHANOL: '7703a8c2192bfa3c368756bd268b8c3a7d81937b87ff96fed23cee0967d49b32',
  GRANEL: 'ee317198608c5264b68702f4ba8c04540cdfa3c6e3c4ce820ad25b8993962d56',
  MERCADERIA_GENERAL: 'd81a4f563a1cf59bbd1f692de73c905a23dd1d5f01eab289389c96b50255cc4d',
  // Tomadas al incorporar las plantillas de containero y big bag (24/09/2026).
  CONTAINERO:
    '0d2424b4f8f9cd31e1054949df6ba6ebcf4bea9f81f80c588166cb56ceca0201',
  BIG_BAG:
    'e4d5b5761ea8078a04fe7026fce97c32005b65e0c6da302a63c75c1d8b20cead',
}

describe('FormatService, motor legacy: huella del libro emitido', () => {
  it('emite el mismo contenido en dos ejecuciones seguidas', async () => {
    const first = await fingerprint('GRANEL')
    const second = await fingerprint('GRANEL')
    expect(second.digest).toBe(first.digest)
  }, 120000)

  for (const formatType of Object.keys(EXPECTED)) {
    it(`${formatType} conserva su huella`, async () => {
      const actual = await fingerprint(formatType)
      expect(actual.parts).toBe(EXPECTED_PARTS[formatType])
      if (!EXPECTED[formatType]) {
        throw new Error(
          `Falta la huella de ${formatType}. La actual es ${actual.digest}. ` +
          'Escribela en EXPECTED solo si el motor esta en su estado de referencia.'
        )
      }
      expect(actual.digest).toBe(EXPECTED[formatType])
    }, 120000)
  }
})
