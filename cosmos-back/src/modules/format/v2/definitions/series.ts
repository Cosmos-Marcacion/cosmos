import { NumberSeries } from '../../../../common/numbering/document-number.service'
import { WORK_PERMIT_SERIES_ID } from '../format-numbering.service'

/**
 * Series de numeracion que trae el sistema de fabrica.
 *
 * Cada tipo de documento lleva la suya, con su contador independiente: el ATS
 * numero 42 y el permiso numero 42 son de la misma jornada solo por casualidad.
 * Si se quiere que compartan correlativo, eso se expresa con
 * `numbering: { kind: 'inherit' }` en la definicion, no juntando las series.
 *
 * Todas son anuales salvo la del permiso de trabajo. Esa es global porque ya
 * tiene correlativos vivos repartidos desde que se instalo el sistema, y
 * pasarla a anual reiniciaria la cuenta y repetiria numeros ya firmados.
 *
 * Estas constantes son la **semilla**: una vez publicada la definicion en el
 * maestro, manda lo que diga la definicion, y el prefijo o los digitos se
 * cambian ahi sin desplegar.
 */
export const DEFAULT_SERIES: Record<string, NumberSeries> = {
  asistencia: { id: 'asistencia', prefix: 'AST', scope: 'year', pad: 4 },
  charla: { id: 'charla', prefix: 'CHA', scope: 'year', pad: 4 },
  ats: { id: 'ats', prefix: 'ATS', scope: 'year', pad: 4 },
  /**
   * Global y sin año en el numero impreso, por compatibilidad con los permisos
   * ya emitidos. `format()` omite el periodo cuando es `global`, asi que sale
   * `PTS-0042` y no `PTS-global-0042`.
   */
  [WORK_PERMIT_SERIES_ID]: { id: WORK_PERMIT_SERIES_ID, prefix: 'PTS', scope: 'global', pad: 4 },
  inspeccion: { id: 'inspeccion', prefix: 'VSI', scope: 'year', pad: 4 },
  ingles: { id: 'ingles', prefix: 'SSL', scope: 'year', pad: 4 },
}
