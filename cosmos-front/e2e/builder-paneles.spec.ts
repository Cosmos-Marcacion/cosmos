import { expect, test, type Page } from '@playwright/test';
import { mockApi, signIn } from './support/api';
import { esperarPantalla } from './support/arranque';

/**
 * Los paneles laterales del constructor de formatos y el ajuste del documento.
 *
 * Observación 6 del informe del 16 y 17 de septiembre: los campos del formato
 * no se aprecian con detalle. La rejilla era fija —220 px de Datos, 260 de
 * Detalles— y ninguno de los dos se podía cerrar, así que en un portátil el
 * documento se quedaba con poco más de la mitad de la pantalla.
 */
const lienzo = (page: Page) => page.locator('.fb-page-wrap');
const hoja = (page: Page) => page.locator('.fb-page');
const ocultarDatos = (page: Page) => page.getByRole('button', { name: 'Ocultar los datos' });
const mostrarDatos = (page: Page) => page.getByRole('button', { name: 'Mostrar los datos' });
const ocultarDetalles = (page: Page) =>
  page.getByRole('button', { name: 'Ocultar los detalles' });

async function abrirMaestro(page: Page) {
  await signIn(page);
  await mockApi(page);
  await page.goto('/formatos/maestro');
  await esperarPantalla(page.locator('app-format-builder'));
}

const ancho = async (page: Page) => (await lienzo(page).boundingBox())!.width;

test.describe('paneles del constructor', () => {
  test('plegar Datos ensancha el documento y se vuelve a abrir', async ({ page }) => {
    await abrirMaestro(page);
    const antes = await ancho(page);
    await expect(page.getByText('Arrastra un dato sobre una casilla.')).toBeVisible();

    await ocultarDatos(page).click();

    expect(await ancho(page)).toBeGreaterThan(antes);
    await expect(page.getByText('Arrastra un dato sobre una casilla.')).toHaveCount(0);

    await mostrarDatos(page).click();

    await expect(page.getByText('Arrastra un dato sobre una casilla.')).toBeVisible();
  });

  test('con los dos plegados el documento se lleva casi toda la pantalla', async ({ page }) => {
    await abrirMaestro(page);
    const antes = await ancho(page);

    await ocultarDatos(page).click();
    await ocultarDetalles(page).click();

    // Los 480 px de los dos paneles se quedan en dos carriles de 40.
    expect(await ancho(page)).toBeGreaterThan(antes + 350);
  });

  test('recuerda los paneles plegados al recargar', async ({ page }) => {
    await abrirMaestro(page);
    await ocultarDatos(page).click();

    await page.reload();
    await esperarPantalla(page.locator('app-format-builder'));

    await expect(mostrarDatos(page)).toBeVisible();
  });
});

test.describe('ajustar al ancho', () => {
  test('deja el documento sin barra horizontal', async ({ page }) => {
    await abrirMaestro(page);

    await page.getByRole('button', { name: 'Ajustar al ancho' }).click();

    // La hoja se escala con `zoom`, así que su medida en pantalla es la del
    // rectángulo, no `offsetWidth`.
    await expect
      .poll(async () => {
        const caja = (await hoja(page).boundingBox())!.width;
        const hueco = (await lienzo(page).boundingBox())!.width;
        return caja <= hueco;
      })
      .toBe(true);
  });

  test('al plegar un panel se recalcula con el sitio nuevo', async ({ page }) => {
    await abrirMaestro(page);
    await page.getByRole('button', { name: 'Ajustar al ancho' }).click();
    const antes = (await hoja(page).boundingBox())!.width;

    await ocultarDatos(page).click();

    // Si no se recalculara, el documento seguiría igual de pequeño con más
    // sitio libre a su alrededor.
    await expect.poll(async () => (await hoja(page).boundingBox())!.width).toBeGreaterThan(antes);
  });

  test('mover el zoom a mano manda sobre el ajuste', async ({ page }) => {
    await abrirMaestro(page);
    await page.getByRole('button', { name: 'Ajustar al ancho' }).click();

    await page.locator('.fb-zoom input').fill('0.6');

    const escala = await hoja(page).evaluate(el => getComputedStyle(el).zoom);
    expect(Number(escala)).toBeCloseTo(0.6, 1);
  });
});

test.describe('arrastrar con la escala cambiada', () => {
  test('el dato cae en la casilla sobre la que se suelta', async ({ page }) => {
    await abrirMaestro(page);
    // La hoja se escala con `zoom`, que cambia la maquetacion: si el calculo de
    // coordenadas del arrastre partiera de la medida sin escalar, el dato
    // acabaria en otra casilla.
    await page.getByRole('button', { name: 'Ajustar al ancho' }).click();
    await ocultarDatos(page).click();
    await mostrarDatos(page).click();

    // Por posicion y no por su contenido: la casilla vacia deja de estarlo al
    // soltar, y un localizador por texto dejaria de encontrarla justo cuando
    // hay que comprobarla. Es la tercera del documento de prueba: NAVE, el
    // dato de la nave, y la fila en blanco.
    const destino = page.locator('.fb-cell').nth(2);
    await page.locator('.fb-chip').filter({ hasText: 'Muelle' }).first().dragTo(destino);

    await expect(destino).toContainText('Muelle');
  });
});
