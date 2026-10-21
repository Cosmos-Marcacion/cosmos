import { test } from '@playwright/test';
import { mockApi, signIn } from './support/api';
import { comprobarAccesibilidad } from './support/axe';
import { esperarPantalla } from './support/arranque';

/**
 * Accesibilidad de las pantallas principales.
 *
 * No es un requisito abstracto: el panel se usa en garitas y oficinas de puerto,
 * con pantallas viejas, mucha luz y gente que navega con el teclado porque el
 * raton se ha perdido. Contraste insuficiente y campos sin etiqueta son fallos
 * de uso diarios.
 *
 * Las lineas base de abajo son los incumplimientos que ya existian al montar
 * esta suite (09/09/2026). El gate falla si aparece uno nuevo; arreglar los
 * existentes es trabajo pendiente y esta anotado en QA_PLAN.md.
 *
 * Etiquetadas `@a11y`: `npm run e2e:a11y`.
 */
test.describe('Accesibilidad @a11y', () => {
  test('la pantalla de acceso no empeora en WCAG A/AA', async ({ page }, testInfo) => {
    await mockApi(page);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    // Una pantalla en blanco no incumple ninguna regla: sin esperar a que
    // pinte, la auditoria daria por buena una pagina vacia.
    await esperarPantalla(page.locator('app-root *:visible').first());

    await comprobarAccesibilidad(page, testInfo, {
      lineaBase: {
        // Un boton sin texto: el lector de pantalla lo anuncia como "boton" a
        // secas. Es el interruptor de ver la contrasena, que solo lleva icono.
        'button-name': 1,
      },
    });
  });

  test('el maestro de formatos no empeora en WCAG A/AA', async ({ page }, testInfo) => {
    await mockApi(page);
    await signIn(page);
    await page.goto('/formatos/maestro');
    await page.waitForLoadState('networkidle');
    // Una pantalla en blanco no incumple ninguna regla: sin esperar a que
    // pinte, la auditoria daria por buena una pagina vacia.
    await esperarPantalla(page.locator('app-root *:visible').first());

    await comprobarAccesibilidad(page, testInfo, {
      lineaBase: {
        'color-contrast': 2,
        // Un desplegable sin etiqueta asociada. En una pantalla que decide que
        // documento se emite, no saber que se esta eligiendo es un error caro.
        'select-name': 1,
      },
    });
  });

  test('el listado de marcaciones no empeora en WCAG A/AA', async ({ page }, testInfo) => {
    await mockApi(page);
    await signIn(page);
    await page.goto('/marcaciones');
    await page.waitForLoadState('networkidle');
    // Una pantalla en blanco no incumple ninguna regla: sin esperar a que
    // pinte, la auditoria daria por buena una pagina vacia.
    await esperarPantalla(page.locator('app-root *:visible').first());

    await comprobarAccesibilidad(page, testInfo, {
      lineaBase: {
        // Texto de bajo contraste en la tabla. Se lee mal justo donde se lee a
        // distancia y con luz de sobra.
        'color-contrast': 4,
      },
    });
  });
});

/**
 * Navegacion con teclado.
 *
 * Axe comprueba que los elementos sean alcanzables, no que el recorrido tenga
 * sentido. Eso ultimo hay que afirmarlo a mano.
 */
test.describe('Teclado @a11y', () => {
  test('se puede llegar al boton de entrar sin tocar el raton', async ({ page }) => {
    await mockApi(page);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    // Una pantalla en blanco no incumple ninguna regla: sin esperar a que
    // pinte, la auditoria daria por buena una pagina vacia.
    await esperarPantalla(page.locator('app-root *:visible').first());

    const recorrido: string[] = [];
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const activo = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return '';
        const tipo = el.getAttribute('type');
        return `${el.tagName.toLowerCase()}${tipo ? `[${tipo}]` : ''}`;
      });
      recorrido.push(activo);
      if (activo.startsWith('button')) break;
    }

    if (!recorrido.some((e) => e.startsWith('button'))) {
      throw new Error(
        `El boton de envio no se alcanza con el teclado. Recorrido: ${recorrido.join(' -> ')}`
      );
    }
  });
});
