/**
 * La rejilla A4 que comparten los dos renderizadores.
 *
 * Es la pieza que hace que el Excel y la impresion del navegador salgan con la
 * misma retica y no solo con los mismos datos. El modelo declara los anchos en
 * milimetros; el HTML los aplica tal cual y el XLSX los convierte a la unidad
 * de Excel, que es la unica traduccion que ocurre.
 *
 * Todo en milimetros. No hay pixeles en el modelo a proposito: un pixel
 * significa cosas distintas en una hoja de calculo y en una pagina impresa, y
 * esa ambiguedad es de donde salen las desviaciones entre medios.
 */

export const A4 = {
  widthMm: 210,
  heightMm: 297,
  marginMm: { top: 10, right: 8, bottom: 10, left: 8 },
} as const

/** Ancho util de la pagina, descontados los margenes. */
export const A4_CONTENT_WIDTH_MM = A4.widthMm - A4.marginMm.left - A4.marginMm.right

/** Y el de una pagina apaisada. */
export const A4_LANDSCAPE_CONTENT_WIDTH_MM =
  A4.heightMm - A4.marginMm.left - A4.marginMm.right

/** Alto de una fila de tabla. */
export const ROW_HEIGHT_MM = 5.5

/** Alto de la fila de cabecera de una tabla. */
export const HEADER_ROW_HEIGHT_MM = 7

/**
 * Milimetros a la unidad de ancho de columna de Excel.
 *
 * Excel mide el ancho de columna en "caracteres" de la fuente por defecto, no
 * en una unidad fisica. La equivalencia que usa el propio Excel es
 * `pixeles = caracteres * 7 + 5`, y a 96 ppp un milimetro son 96/25.4 pixeles.
 * De ahi sale la conversion. No es exacta al decimo de milimetro (no puede
 * serlo, el ancho de columna es discreto), pero mantiene la proporcion, que es
 * lo que se necesita para que las dos salidas se parezcan.
 */
export function mmToExcelWidth(mm: number): number {
  const pixels = (mm * 96) / 25.4
  return Math.max(1, Math.round(((pixels - 5) / 7) * 100) / 100)
}

/** Milimetros a puntos, que es como Excel mide el alto de fila. */
export function mmToPoints(mm: number): number {
  return Math.round((mm * 72 / 25.4) * 100) / 100
}

/**
 * Reparte un ancho disponible entre columnas que declaran el suyo.
 *
 * Las definiciones declaran anchos pensando en una pagina concreta, y al ocultar
 * una columna desde el maestro la tabla dejaria un hueco a la derecha. Escalar
 * al ancho util reparte ese hueco en proporcion, que es lo que hace cualquier
 * maquetador a mano y lo que evita que editar la definicion estropee la pagina.
 */
export function fitColumns(widthsMm: number[], availableMm: number): number[] {
  const total = widthsMm.reduce((sum, width) => sum + width, 0)
  if (total <= 0) {
    return widthsMm.map(() => availableMm / Math.max(1, widthsMm.length))
  }
  const factor = availableMm / total
  return widthsMm.map(width => Math.round(width * factor * 100) / 100)
}

/** Ancho util segun la orientacion del documento. */
export function contentWidthMm(orientation: 'portrait' | 'landscape'): number {
  return orientation === 'landscape' ? A4_LANDSCAPE_CONTENT_WIDTH_MM : A4_CONTENT_WIDTH_MM
}
