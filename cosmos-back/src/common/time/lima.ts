import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

/**
 * La operacion es en Lima y todas las horas que ve el usuario son de Lima.
 *
 * El contenedor corre en UTC y no fija `TZ`, asi que cualquier `getHours()` o
 * `new Date('yyyy-mm-dd hh:mm')` depende de donde se despliegue: una marcacion
 * de las 10:00 de Lima salia impresa como "15:00" en el formato. Estas dos
 * funciones hacen la conversion explicita y no dependen del proceso.
 */
export const LIMA_TZ = 'America/Lima'

/** `HH:mm` en hora de Lima; cadena vacia si la fecha no es valida. */
export function formatLimaTime(date: Date | string | null | undefined): string {
  if (!date) {
    return ''
  }
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) {
    return ''
  }
  return formatInTimeZone(d, LIMA_TZ, 'HH:mm')
}

/** Instante real de una fecha `yyyy-mm-dd` y una hora `HH:mm` de Lima. */
export function limaDateTime(dateIso: string, time: string): Date {
  return fromZonedTime(
    `${dateIso}T${time.length === 5 ? `${time}:00` : time}`,
    LIMA_TZ
  )
}
