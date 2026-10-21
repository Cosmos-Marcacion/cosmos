import { expect, test } from '@playwright/test';
import { mockApi, signIn } from './support/api';
import { esperarPantalla } from './support/arranque';

/**
 * La vista de impresión del formato de una nombrada.
 *
 * Es la pantalla a la que se llega para comprobar un formato antes de emitirlo,
 * así que lo que importa aquí es que un fallo se entienda: quien la abre está a
 * punto de firmar lo que sale.
 */
test.describe('imprimir el formato', () => {
  test('sin la fecha de la jornada dice cómo llegar bien', async ({ page }) => {
    await signIn(page);
    await mockApi(page);

    await page.goto('/formatos/imprimir/123');
    await esperarPantalla(page.locator('.fp-note--error'));

    await expect(page.locator('.fp-note--error')).toContainText('le falta la fecha de la jornada');
    await expect(page.locator('.fp-note--error')).toContainText('desde ahí');
  });

  test('un fallo al componerlo se explica una sola vez', async ({ page }) => {
    await signIn(page);
    const api = await mockApi(page);
    api.fail('GET', '/document', 500, { message: 'Cannot read properties of undefined' });

    await page.goto('/formatos/imprimir/123?workerDate=2026-05-12');
    await esperarPantalla(page.locator('.fp-note--error'));

    await expect(page.locator('.fp-note--error')).toContainText('No se pudo componer el formato');
    // Sin el aviso genérico encima con la jerga del servidor.
    await expect(page.locator('app-notification')).toHaveCount(0);
  });
});
