import { expect, test, type Page } from '@playwright/test';
import { mockApi, signIn } from './support/api';
import { esperarPantalla } from './support/arranque';

/**
 * Hallazgos CKI08, CKI10, CKI12 y CKI14 del informe del 18/09/2026.
 *
 * - CKI14: Limpiar del Panel no dejaba los filtros en su estado inicial.
 * - CKI08: listas y graficos vacios dejaban un hueco sin explicar.
 * - CKI10: el editor de formatos a ~760 px pedia desplazamiento horizontal.
 * - CKI12: Enter sobre "Descargar formato" abria ademas la nombrada.
 */

/** Hoy en `yyyy-mm-dd`, calculado como lo hace el Panel. */
const hoy = (page: Page) =>
  page.evaluate(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
      .toISOString()
      .split('T')[0];
  });

async function abrirPanel(page: Page) {
  await mockApi(page);
  await signIn(page, ['panel']);
  await page.goto('/panel');
  await esperarPantalla(page.getByRole('button', { name: 'Buscar' }));
  await expect(page.getByRole('button', { name: 'Buscar' })).toBeEnabled();
}

test.describe('Panel: Limpiar (CKI14)', () => {
  test('vacía lo escrito en los campos y explica las fechas', async ({ page }) => {
    await abrirPanel(page);

    await page.getByLabel('Nombrada', { exact: true }).fill('3585');
    await page.getByLabel('Navío', { exact: true }).fill('MSC');
    await page.getByLabel('Empleado', { exact: true }).fill('ANA');
    await page.getByLabel('Cargo', { exact: true }).fill('ESTI');
    await page.getByLabel('Turno', { exact: true }).selectOption({ index: 1 });
    await page.getByLabel('Fecha Inicio', { exact: true }).fill('2026-09-01');
    await page.getByLabel('Fecha Fin', { exact: true }).fill('2026-09-18');
    // Cerrar las sugerencias abiertas antes de pulsar.
    await page.getByRole('heading', { name: 'Asistencias' }).first().click();

    await page.getByRole('button', { name: 'Limpiar' }).click();

    for (const campo of ['Nombrada', 'Navío', 'Empleado', 'Cargo']) {
      await expect(page.getByLabel(campo, { exact: true })).toHaveValue('');
    }
    await expect(page.getByLabel('Turno', { exact: true })).toHaveValue('');
    const fecha = await hoy(page);
    await expect(page.getByLabel('Fecha Inicio', { exact: true })).toHaveValue(fecha);
    await expect(page.getByLabel('Fecha Fin', { exact: true })).toHaveValue(fecha);
    await expect(page.getByTestId('cleared-notice')).toHaveText(
      'Filtros restablecidos. Las fechas vuelven al día de hoy.'
    );
  });

  test('conserva la validación de fechas invertidas', async ({ page }) => {
    await abrirPanel(page);
    await page.getByLabel('Fecha Inicio', { exact: true }).fill('2026-09-30');
    await page.getByLabel('Fecha Fin', { exact: true }).fill('2026-09-01');
    await page.getByLabel('Fecha Fin', { exact: true }).dispatchEvent('change');

    await expect(page.getByText('La fecha de inicio no puede ser posterior a la de fin')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buscar' })).toBeDisabled();
  });
});

test.describe('estados vacíos (CKI08)', () => {
  test('los gráficos del Panel sin asistencias lo dicen en vez de pintar ejes', async ({ page }) => {
    await abrirPanel(page);

    const vacios = page.locator('.chart-empty');
    await expect(vacios).toHaveCount(4);
    await expect(vacios.first()).toContainText('Sin asistencias para los filtros elegidos');
    await expect(page.locator('canvas:visible')).toHaveCount(0);
    await expect(page.getByText('No hay nombradas para los filtros elegidos.')).toBeVisible();
    await expect(page.getByText('No hay asistencias para los filtros elegidos.')).toBeVisible();
  });

  test('una búsqueda de usuarios sin coincidencias lo explica', async ({ page }) => {
    await mockApi(page);
    await signIn(page, ['usuarios']);
    await page.goto('/usuarios');
    await esperarPantalla(page.getByRole('heading', { name: 'Usuarios' }));

    await page.locator('#search').fill('zzzz');

    await expect(page.getByText('Nada coincide con «zzzz».', { exact: false }).first()).toBeVisible();
  });
});

test.describe('editor de formatos en ventana estrecha (CKI10)', () => {
  test.use({ viewport: { width: 762, height: 900 } });

  test('pliega los paneles y la página no se desplaza en horizontal', async ({ page }) => {
    await signIn(page);
    await mockApi(page);
    await page.goto('/formatos/maestro');
    await esperarPantalla(page.locator('app-format-builder'));

    await expect(page.getByRole('button', { name: 'Mostrar los datos' })).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        )
      )
      .toBe(true);

    await expect
      .poll(async () => {
        const hoja = (await page.locator('.fb-page').boundingBox())!.width;
        const lienzo = (await page.locator('.fb-page-wrap').boundingBox())!.width;
        return hoja <= lienzo;
      })
      .toBe(true);
  });
});

test.describe('tarjeta de nombrada con teclado (CKI12)', () => {
  test('Enter sobre Descargar formato no abre la nombrada', async ({ page }) => {
    await mockApi(page);
    await signIn(page, ['marcaciones']);
    await page.goto('/marcaciones');
    const descargar = page.getByRole('button', { name: 'Descargar formato' });
    await esperarPantalla(descargar);

    await descargar.focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/marcaciones(\?.*)?$/);
  });

  test('Enter sobre la tarjeta abre la nombrada', async ({ page }) => {
    await mockApi(page);
    await signIn(page, ['marcaciones']);
    await page.goto('/marcaciones');
    const tarjeta = page.getByRole('button', { name: /Abrir nombrada 3585/ });
    await esperarPantalla(tarjeta);

    await tarjeta.focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/marcaciones\/nombrada\/3541/);
  });
});
