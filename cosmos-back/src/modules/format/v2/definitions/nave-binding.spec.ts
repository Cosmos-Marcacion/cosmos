import ETHANOL from './generated/ETHANOL.json'
import GRANEL from './generated/GRANEL.json'
import MERCADERIA_GENERAL from './generated/MERCADERIA_GENERAL.json'
import CONTAINERO from './generated/CONTAINERO.json'
import BIG_BAG from './generated/BIG_BAG.json'

/**
 * CKI03: en la version 12 publicada de Ethanol la casilla junto a "NAVE"
 * imprimia el jefe de cubierta. Las definiciones de fabrica estaban bien (el
 * cambio se hizo en el Maestro y vive en Mongo), pero esta prueba evita que una
 * regeneracion de las semillas repita el cruce: la casilla que sigue a un
 * rotulo de nave tiene que ser el dato `nave`.
 */
describe('definiciones de fabrica: la casilla de NAVE imprime la nave', () => {
  const seeds = {
    ETHANOL,
    GRANEL,
    MERCADERIA_GENERAL,
    CONTAINERO,
    BIG_BAG,
  } as Record<string, any>

  const naveLabels = (definition: any) => {
    const found: { where: string; next: any }[] = []
    for (const doc of definition.documents ?? []) {
      for (const section of doc.sections ?? []) {
        for (const row of section.rows ?? []) {
          const cells = row.cells ?? []
          cells.forEach((cell: any, i: number) => {
            const text = String(cell?.content?.text ?? '')
              .trim()
              .replace(/:$/, '')
              .toUpperCase()
            if (text === 'NAVE') {
              found.push({
                where: `${doc.id}/${section.id}/${row.id}/${cell.id}`,
                next: cells[i + 1]?.content ?? null,
              })
            }
          })
        }
      }
    }
    return found
  }

  for (const [formatType, definition] of Object.entries(seeds)) {
    it(`${formatType}`, () => {
      const labels = naveLabels(definition)

      expect(labels.length).toBeGreaterThan(0)
      for (const { where, next } of labels) {
        expect({ where, next }).toEqual({
          where,
          next: expect.objectContaining({ kind: 'data', source: 'nave' }),
        })
      }
    })
  }
})
