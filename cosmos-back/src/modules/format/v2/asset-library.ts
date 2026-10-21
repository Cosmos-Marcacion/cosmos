import * as fs from 'fs'
import * as path from 'path'

/**
 * La biblioteca de imagenes de los formatos.
 *
 * Las 41 imagenes distintas de las tres plantillas se extraen una sola vez
 * (`npm run format:assets`) a `public/format-assets/`, nombradas por su SHA-1.
 * Ese directorio ya se sirve en `/static`, asi que la vista de impresion las
 * pide por URL y el renderizador de Excel las lee del disco.
 *
 * Por SHA-1 y no por nombre de parte porque las tres plantillas comparten 38 de
 * las 41: guardarlas por `xl/media/image6.png` las duplicaria tres veces y, peor,
 * haria que dos imagenes distintas con el mismo nombre se pisaran.
 */

export const ASSETS_DIR = path.join(process.cwd(), 'public', 'format-assets')

/** Ruta en disco de una imagen, o `null` si no esta en la biblioteca. */
export function assetPath(sha1: string): string | null {
  for (const extension of ['png', 'jpeg', 'jpg', 'gif', 'emf']) {
    const candidate = path.join(ASSETS_DIR, `${sha1}.${extension}`)
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

/** URL publica de una imagen. La sirve `ServeStaticModule` bajo `/static`. */
export function assetUrl(sha1: string, extension: string): string {
  return `/static/format-assets/${sha1}.${extension}`
}
