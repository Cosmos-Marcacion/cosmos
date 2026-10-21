import { FormatDefinition } from '../document-model'
import ETHANOL from './generated/ETHANOL.json'
import GRANEL from './generated/GRANEL.json'
import MERCADERIA_GENERAL from './generated/MERCADERIA_GENERAL.json'
import CONTAINERO from './generated/CONTAINERO.json'
import BIG_BAG from './generated/BIG_BAG.json'

/**
 * Definiciones de fabrica, una por tipo de formato.
 *
 * **No se escriben a mano**: las genera `npm run format:generate` leyendo las
 * plantillas del cliente, con todos sus rotulos, sus combinaciones, sus
 * anchos en milimetros y sus imagenes ancladas donde estaban.
 *
 * Transcribir 817 rotulos a mano es donde se pierden datos, y un rotulo perdido
 * no da error: sale un formato que parece correcto y no lo es.
 * `label-coverage.spec.ts` compara lo generado contra el `.xlsx` real, hoja por
 * hoja y plantilla por plantilla, y falla si falta algo.
 *
 * Es la **semilla**: se escriben en la base de datos la primera vez que se pide
 * un tipo sin definicion publicada, y a partir de ahi manda la base de datos.
 * Si la siembra pisara lo publicado, cada despliegue desharia lo que el cliente
 * hubiera configurado en el maestro.
 *
 * Para regenerarlas tras cambiar una plantilla:
 *
 *   npm run format:generate
 */
export const SEED_DEFINITIONS: Record<string, FormatDefinition> = {
  ETHANOL: ETHANOL as unknown as FormatDefinition,
  GRANEL: GRANEL as unknown as FormatDefinition,
  MERCADERIA_GENERAL: MERCADERIA_GENERAL as unknown as FormatDefinition,
  CONTAINERO: CONTAINERO as unknown as FormatDefinition,
  BIG_BAG: BIG_BAG as unknown as FormatDefinition,
}
