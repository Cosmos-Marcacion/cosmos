import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { mockApi, signIn } from './support/api';
import { esperarPantalla } from './support/arranque';

/**
 * La impresión de los tres formatos reales, en A4 y sin la aplicación alrededor.
 *
 * Los documentos son los que construye el backend con las definiciones de
 * fábrica (`e2e/fixtures`, ver `tools/format-inspector/e2e-fixtures.ts` en
 * cosmos-back), no una maqueta: lo que se comprueba es cómo sale de verdad cada
 * formato al darle a imprimir.
 *
 * Antes la vista colgaba del layout principal y la hoja impresa llevaba el menú
 * lateral y la cabecera, y el contenedor con scroll la recortaba a la primera
 * pantalla.
 */

const ASSETS = path.join(__dirname, '..', '..', 'cosmos-back', 'public', 'format-assets');
const FIXTURES = path.join(__dirname, 'fixtures');
const TYPES = ['ETHANOL', 'GRANEL', 'MERCADERIA_GENERAL', 'CONTAINERO', 'BIG_BAG'];

/** 1 mm en píxeles CSS. */
const MM = 96 / 25.4;
/** A4 en puntos PDF: 595,28 × 841,89. */
const A4_PT = { short: 595.28, long: 841.89 };

for (const type of TYPES) {
  test(`${type}: se imprime limpio y en A4`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await signIn(page);
    await mockApi(page);
    const document = fs.readFileSync(path.join(FIXTURES, `format-${type}.json`), 'utf8');
    await page.route('http://localhost:3024/api/v1/format/123/document**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: document })
    );
    await page.route('http://localhost:3024/static/format-assets/**', (route) => {
      const name = path.basename(new URL(route.request().url()).pathname);
      const file = path.join(ASSETS, name);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      const type = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(file) });
    });

    await page.goto('/formatos/imprimir/123?workerDate=12/05/2026');
    await esperarPantalla(page.locator('.fd-sheet').first());

    // Sin la aplicación alrededor: ni menú, ni cabecera, ni barra lateral.
    await expect(page.locator('app-menu')).toHaveCount(0);
    await expect(page.locator('app-main-layout')).toHaveCount(0);

    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.fp-bar')).toBeHidden();

    // Cada hoja mide el ancho útil de A4 (menos 8 mm por lado) en su
    // orientación y nada se sale de ella a lo ancho.
    const sheets = await page.locator('.fd-sheet').evaluateAll((elements) =>
      elements.map((element) => ({
        landscape: element.classList.contains('fd-sheet--landscape'),
        pages: Number((element as HTMLElement).dataset['printPages']),
        width: element.getBoundingClientRect().width,
        overflow: element.scrollWidth - element.clientWidth,
      }))
    );
    // Las hojas de la plantilla original (asistencia 1, charla 1, permiso 2 y
    // ATS 2) por cada página de la lista de personal: con 31 personas el
    // permiso, que admite 16 por página, ocupa el doble.
    const expectedPages = (JSON.parse(document).documents as { printPages: number }[]).map(
      (entry) => entry.printPages
    );
    expect(sheets.map((sheet) => sheet.pages)).toEqual(expectedPages);
    for (const sheet of sheets) {
      const expected = ((sheet.landscape ? 297 : 210) - 16) * MM;
      expect(Math.abs(sheet.width - expected)).toBeLessThan(2);
      expect(sheet.overflow).toBeLessThanOrEqual(1);
    }

    // El PDF del navegador: todas las páginas en A4, apaisada la asistencia.
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    fs.writeFileSync(testInfo.outputPath(`${type}.pdf`), pdf);
    const boxes = [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map(
      (match) => [Number(match[1]), Number(match[2])]
    );
    // Ni una hoja de más: una de más quiere decir que algo no cupo.
    expect(boxes.length).toBe(expectedPages.reduce((sum, pages) => sum + pages, 0));
    for (const [width, height] of boxes) {
      const [short, long] = width < height ? [width, height] : [height, width];
      expect(Math.abs(short - A4_PT.short)).toBeLessThan(2);
      expect(Math.abs(long - A4_PT.long)).toBeLessThan(2);
    }
    // La primera página es la asistencia, apaisada.
    expect(boxes[0][0]).toBeGreaterThan(boxes[0][1]);

  });
}
