import { expect, test } from '@playwright/test';
import { mockApi, signIn } from './support/api';
import { esperarPantalla } from './support/arranque';

/**
 * El manual de uso: público, navegable, con buscador, pasos que se recuerdan y
 * asistente de problemas. Se abre sin sesión a propósito.
 */
const portada = (page: import('@playwright/test').Page) =>
  page.getByRole('heading', { name: '¿Qué necesitas hacer?' });

test.describe('manual de uso', () => {
  test('se abre sin sesión y lleva a un tema desde la función elegida', async ({ page }) => {
    await page.goto('/manual');
    await esperarPantalla(portada(page));

    await page.getByRole('tab', { name: 'Personal del muelle' }).click();
    await page.getByRole('button', { name: /Marcar con reconocimiento facial/ }).click();

    await expect(page).toHaveURL(/\/manual\/app-marcar-rostro$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Marcar con reconocimiento facial');
    await expect(page).toHaveTitle(/Marcar con reconocimiento facial/);
  });

  test('el buscador encuentra sin tildes y Enter abre el primer resultado', async ({ page }) => {
    await page.goto('/manual');
    await esperarPantalla(portada(page));

    await page.keyboard.press('/');
    await page.keyboard.type('contrasena');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('para «contrasena»');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/manual\/web-ingreso$/);
  });

  test('los pasos marcados se recuerdan al recargar', async ({ page }) => {
    await page.goto('/manual/web-usuarios');
    await esperarPantalla(page.getByRole('heading', { level: 1, name: 'Usuarios' }));
    const guia = page.getByRole('region', { name: 'Crear un usuario' });

    await guia.getByRole('checkbox').first().check();
    await expect(guia.getByText('1 de 6')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('region', { name: 'Crear un usuario' }).getByText('1 de 6')).toBeVisible();
  });

  test('el asistente de problemas da la causa y la solución', async ({ page }) => {
    await page.goto('/manual/problemas');
    await esperarPantalla(page.getByRole('heading', { level: 1, name: 'Resolver un problema' }));

    await page.getByRole('button', { name: 'En la app del teléfono' }).click();
    await page.getByRole('button', { name: 'El lector de huella sale "Desconectado"' }).click();

    await expect(page.getByText('Por qué pasa:')).toBeVisible();
    await expect(page.getByText(/cable OTG/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Ver el tema completo →' }).click();
    await expect(page).toHaveURL(/\/manual\/app-marcar-huella$/);
  });

  test('un tema que no existe lo dice', async ({ page }) => {
    await page.goto('/manual/no-existe');
    await expect(page.getByRole('heading', { name: 'Este tema no existe' })).toBeVisible({ timeout: 30_000 });
  });

  test('en móvil el índice es un cajón y no hay scroll horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/manual/web-nombrada');
    await esperarPantalla(page.getByRole('heading', { level: 1, name: 'Detalle de una nombrada' }));

    const indice = page.getByRole('navigation', { name: 'Temas del manual' });
    await expect(indice).not.toBeInViewport();
    await page.getByRole('button', { name: 'Ver los temas' }).click();
    await expect(indice).toBeInViewport();
    await indice.getByRole('link', { name: 'Glosario' }).click();
    await expect(page).toHaveURL(/\/manual\/ref-glosario$/);

    for (const ruta of ['/manual', '/manual/web-emitir-formato', '/manual/ref-reglas', '/manual/problemas']) {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle').catch(() => {});
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sobra, ruta).toBe(0);
    }
  });

  test('el menú del panel enlaza al manual', async ({ page }) => {
    await mockApi(page);
    await signIn(page, ['panel']);
    await page.goto('/panel');
    const enlace = page.locator('app-menu').first().getByRole('link', { name: 'Manual de uso' });
    await esperarPantalla(enlace);
    await expect(enlace).toHaveAttribute('href', '/manual');
    await expect(enlace).toHaveAttribute('target', '_blank');
  });
});
