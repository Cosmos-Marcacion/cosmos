import * as fs from 'fs'
import * as path from 'path'
import { SEED_DEFINITIONS } from './seed'
import { assetPath, ASSETS_DIR } from '../asset-library'
import { validateDefinition } from '../../definitions/format-definition.validator'
import { FORMAT_TEMPLATES } from '../../format-templates.config'

/**
 * Las definiciones de fabrica y lo que necesitan para llegar a produccion.
 *
 * Esto ultimo no es teorico: las definiciones se importan como `.json`, y el
 * compilador SWC **no copia los ficheros que no son codigo**. Con las pruebas
 * corriendo sobre `src/` todo pasaba, y el proceso construido moria al arrancar
 * con `Cannot find module './generated/ETHANOL.json'`. Un fallo asi no lo ve
 * ninguna prueba que solo mire el contenido, de ahi las de empaquetado.
 */

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..')
const GENERATED = path.join(__dirname, 'generated')

describe('definiciones de fabrica', () => {
  it('hay una por cada plantilla del cliente', () => {
    expect(Object.keys(SEED_DEFINITIONS).sort())
      .toEqual(FORMAT_TEMPLATES.map(template => template.id).sort())
  })

  for (const template of FORMAT_TEMPLATES) {
    describe(template.id, () => {
      const definition = SEED_DEFINITIONS[template.id]

      it('es valida y se puede publicar', () => {
        expect(validateDefinition(definition)).toEqual([])
      })

      it('trae documentos con secciones', () => {
        expect(definition.documents.length).toBeGreaterThan(0)
        for (const document of definition.documents) {
          expect({ documento: document.name, secciones: document.sections.length > 0 })
            .toEqual({ documento: document.name, secciones: true })
        }
      })

      it('cada documento lleva serie de numeracion propia', () => {
        const series = definition.documents.map(document => {
          const numbering: any = document.numbering
          return numbering?.kind === 'own' ? numbering.series.id : null
        })
        expect(series.filter(Boolean).length).toBe(definition.documents.length)
        // Dos documentos con la misma serie compartirian correlativo sin
        // haberlo pedido; la dependencia se declara con `inherit`, no asi.
        expect(new Set(series).size).toBe(series.length)
      })

      it('todas sus imagenes estan en la biblioteca', () => {
        const faltan: string[] = []
        for (const document of definition.documents) {
          for (const section of document.sections as any[]) {
            for (const entry of section.images ?? []) {
              if (!assetPath(entry.image.sha1)) {
                faltan.push(entry.image.sha1)
              }
            }
          }
        }
        expect(faltan).toEqual([])
      })
    })
  }
})

describe('empaquetado', () => {
  it('las definiciones generadas existen en el arbol de fuentes', () => {
    for (const template of FORMAT_TEMPLATES) {
      expect({
        fichero: `${template.id}.json`,
        existe: fs.existsSync(path.join(GENERATED, `${template.id}.json`)),
      }).toEqual({ fichero: `${template.id}.json`, existe: true })
    }
  })

  it('la biblioteca de imagenes existe y no esta vacia', () => {
    // La sirve `ServeStaticModule` bajo `/static`, y el renderizador de Excel
    // la lee de disco. Sin ella, los pictogramas del permiso de trabajo, que
    // son contenido normativo, no salen.
    expect(fs.existsSync(ASSETS_DIR)).toBe(true)
    expect(fs.readdirSync(ASSETS_DIR).length).toBeGreaterThan(0)
  })

  it('el build copia los .json al empaquetado', () => {
    // SWC compila `.ts` y deja atras todo lo demas. Sin esta declaracion, el
    // proceso construido no arranca.
    const nestCli = JSON.parse(fs.readFileSync(path.join(ROOT, 'nest-cli.json'), 'utf8'))
    const assets: any[] = nestCli.compilerOptions?.assets ?? []
    expect(assets.some(asset =>
      typeof asset?.include === 'string' &&
      asset.include.includes('definitions/generated') &&
      asset.include.endsWith('.json')
    )).toBe(true)
  })

  it('el build copia tambien el directorio publico', () => {
    const nestCli = JSON.parse(fs.readFileSync(path.join(ROOT, 'nest-cli.json'), 'utf8'))
    const assets: any[] = nestCli.compilerOptions?.assets ?? []
    expect(assets.some(asset => String(asset?.include ?? '').includes('public'))).toBe(true)
  })
})
