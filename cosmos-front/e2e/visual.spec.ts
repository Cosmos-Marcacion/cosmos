import { test, expect } from '@playwright/test';
import { mockApi, signIn } from './support/api';

/**
 * Regresion visual de las pantallas que se imprimen o se leen a distancia.
 *
 * Se usa el comparador nativo de Playwright y no un servicio externo: no hace
 * falta cuenta ni clave, las instantaneas viven en el repositorio y se revisan
 * como cualquier otro cambio de codigo.
 *
 * Reglas para que estas pruebas no se conviertan en ruido —que es como mueren
 * casi todas las suites visuales—:
 *
 *  - Se congela el reloj: una fecha en pantalla cambia el pixel cada dia.
 *  - Se desactivan animaciones y el cursor de escritura.
 *  - Se tolera un 1% de pixeles: la interpolacion de fuentes difiere entre el
 *    portatil y el runner del CI, y sin margen todo esta siempre en rojo.
 *  - Se fotografia una region, no la pagina entera, cuando lo que importa es
 *    una region.
 *
 * Etiquetadas `@visual`: `npm run e2e:visual`. Para aceptar un cambio
 * deliberado, `npm run e2e:update-snapshots` y revisar el diff de las imagenes.
 */

const RELOJ_FIJO = new Date('2026-03-09T12:00:00-05:00');

test.describe('Regresion visual @visual', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(RELOJ_FIJO);
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          caret-color: transparent !important;
        }
      `,
    });
  });

  test('la pantalla de acceso se mantiene', async ({ page }) => {
    await mockApi(page);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('login.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('el maestro de formatos se mantiene', async ({ page }) => {
    await mockApi(page);
    await signIn(page);
    await page.goto('/formatos/maestro');
    await page.waitForLoadState('networkidle');

    // Es la pantalla cuyo aspecto acaba en un documento oficial: un salto de
    // columna o una fila desalineada se imprime tal cual.
    await expect(page).toHaveScreenshot('maestro-formatos.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('el panel se mantiene en pantalla de movil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page);
    await signIn(page);
    await page.goto('/marcaciones');
    await page.waitForLoadState('networkidle');

    // El listado se consulta desde el movil en el muelle; el diseño responsivo
    // se rompe sin que nadie lo note desde un escritorio.
    await expect(page).toHaveScreenshot('marcaciones-movil.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
});
